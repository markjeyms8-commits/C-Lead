-- Durable in-app reminders and private per-device Web Push delivery.
alter table public.posts add column announcement_dispatched_at timestamptz;
update public.posts set announcement_dispatched_at=now() where kind='announcement' and state='published' and publish_at<=now();
create table private.reminder_sent(source_kind text not null,source_id uuid not null,due_at timestamptz not null,minutes_before integer not null,recipient_id uuid not null references public.profiles,created_at timestamptz not null default now(),primary key(source_kind,source_id,due_at,minutes_before,recipient_id));
create table private.push_subscriptions(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles,session_id uuid not null references public.app_sessions,endpoint text not null check(length(endpoint)<=2048),p256dh text not null check(p256dh ~ '^[A-Za-z0-9_-]{87}=?$'),auth_secret text not null check(auth_secret ~ '^[A-Za-z0-9_-]{22}={0,2}$'),disabled_at timestamptz,created_at timestamptz not null default now());
create unique index one_active_push_endpoint on private.push_subscriptions(endpoint)where disabled_at is null;
create table private.push_jobs(id uuid primary key default gen_random_uuid(),notification_id uuid not null references public.notifications,subscription_id uuid not null references private.push_subscriptions,state text not null default 'pending' check(state in ('pending','sending','delivered','skipped','failed')),attempts integer not null default 0 check(attempts between 0 and 5),next_attempt_at timestamptz not null default now(),lease_id uuid,lease_until timestamptz,created_at timestamptz not null default now(),finished_at timestamptz,unique(notification_id,subscription_id));
do $$declare tab text;begin foreach tab in array array['reminder_sent','push_subscriptions','push_jobs']loop execute format('alter table private.%I enable row level security',tab);execute format('revoke all on private.%I from public,anon,authenticated',tab);execute format('grant all on private.%I to service_role',tab);end loop;end $$;
create function private.allowed_push_endpoint(value text) returns boolean language sql immutable set search_path='' as $$select value ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.push\.services\.mozilla\.com|([a-z0-9-]+\.)*push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/[^[:space:]#]+$' and value !~ '[\\]'$$;
create function public.register_push(push_endpoint text,push_p256dh text,push_auth text) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;current_session uuid=(auth.jwt()->>'session_id')::uuid;
begin
 if not private.active_session() or not coalesce(private.allowed_push_endpoint(push_endpoint),false) then raise exception 'Push subscription denied';end if;
 if(select count(*) from private.push_subscriptions where user_id=auth.uid() and disabled_at is null and endpoint<>push_endpoint)>=10 then raise exception 'Ten push devices maximum';end if;
 perform pg_advisory_xact_lock(hashtext(push_endpoint));
 update private.push_subscriptions set disabled_at=now() where endpoint=push_endpoint and disabled_at is null;
 insert into private.push_subscriptions(user_id,session_id,endpoint,p256dh,auth_secret)values(auth.uid(),current_session,push_endpoint,push_p256dh,push_auth)returning id into result;
 insert into public.audit_logs(actor_id,action,target_type,target_id)values(auth.uid(),'push_enabled','push_subscriptions',result::text);return result;
end $$;
create function public.disable_push(push_endpoint text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.active_session() then raise exception 'Unauthorized';end if;
 update private.push_subscriptions set disabled_at=now() where user_id=auth.uid() and endpoint=push_endpoint and disabled_at is null;
 insert into public.audit_logs(actor_id,action,target_type,target_id)values(auth.uid(),'push_disabled','profiles',auth.uid()::text);
end $$;
create function public.my_push_enabled(push_endpoint text) returns boolean language sql stable security definer set search_path='' as $$select private.active_session() and exists(select 1 from private.push_subscriptions where endpoint=push_endpoint and user_id=auth.uid() and session_id=(auth.jwt()->>'session_id')::uuid and disabled_at is null)$$;
create function private.enqueue_push() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into private.push_jobs(notification_id,subscription_id)select new.id,p.id from private.push_subscriptions p join public.app_sessions s on s.id=p.session_id join auth.sessions a on a.id=s.id where p.user_id=new.user_id and p.disabled_at is null and s.revoked_at is null on conflict do nothing;return new;
end $$;
create trigger notification_push after insert on public.notifications for each row execute function private.enqueue_push();
create function public.claim_push_jobs(batch_size integer default 10) returns table(job_id uuid,claim_id uuid,subscription_id uuid,endpoint text,p256dh text,auth_secret text,title text,body text,path text) language plpgsql security definer set search_path='' as $$
declare j private.push_jobs;s private.push_subscriptions;n public.notifications;token uuid;fil boolean;claimed integer=0;
begin
 if batch_size not between 1 and 10 then raise exception 'Invalid batch';end if;
 for j in select * from private.push_jobs q where (q.state='pending' and q.next_attempt_at<=now() or q.state='sending' and q.lease_until<=now()) order by q.created_at for update skip locked limit 100 loop
  select * into strict s from private.push_subscriptions where id=j.subscription_id;
  select * into strict n from public.notifications where id=j.notification_id;
  if j.attempts>=5 or j.created_at<now()-interval '7 days' or s.disabled_at is not null or not exists(select 1 from public.profiles p join public.app_sessions a on a.user_id=p.id join auth.sessions h on h.id=a.id where p.id=s.user_id and p.active and a.id=s.session_id and a.revoked_at is null) or (n.category<>'security' and exists(select 1 from public.notification_preferences where user_id=s.user_id and category=n.category and not enabled)) then
   update private.push_jobs set state='skipped',finished_at=now() where id=j.id;continue;
  end if;
  token=gen_random_uuid();update private.push_jobs set state='sending',attempts=attempts+1,lease_id=token,lease_until=now()+interval '2 minutes' where id=j.id;
  select language='fil' into fil from public.preferences where user_id=s.user_id;
  -- Generic lock-screen copy avoids leaking account data during revocation/delivery races.
  job_id=j.id;claim_id=token;subscription_id=s.id;endpoint=s.endpoint;p256dh=s.p256dh;auth_secret=s.auth_secret;title='C-LEAD';body=case when fil then 'Buksan ang C-LEAD para sa bagong abiso.' else 'Open C-LEAD for a new notification.' end;path='/notifications';return next;
  claimed=claimed+1;exit when claimed>=batch_size;
 end loop;
end $$;
create function public.finish_push_job(target_job uuid,claim_id uuid,outcome text) returns void language plpgsql security definer set search_path='' as $$
declare j private.push_jobs;
begin
 select * into j from private.push_jobs where id=target_job and lease_id=claim_id and state='sending' for update;
 if not found then return;end if;
 if outcome not in ('delivered','retry','invalid','failed') then raise exception 'Invalid outcome';end if;
 if outcome='invalid' then update private.push_subscriptions set disabled_at=now() where id=j.subscription_id;end if;
 update private.push_jobs set state=case when outcome='delivered' then 'delivered' when outcome='retry' and attempts<5 then 'pending' else 'failed' end,next_attempt_at=now()+make_interval(secs=>least(3600,30*power(2,attempts)::integer)),lease_until=null,finished_at=case when outcome='retry' and attempts<5 then null else now() end where id=j.id;
end $$;
create function private.send_due_reminder(source_kind text,source_id uuid,due_at timestamptz,offset_minutes integer,recipient uuid,category text,destination text) returns void language plpgsql security definer set search_path='' as $$
begin
 if due_at<=now() or due_at-make_interval(mins=>offset_minutes)>now() then return;end if;
 insert into private.reminder_sent(source_kind,source_id,due_at,minutes_before,recipient_id)values(source_kind,source_id,due_at,offset_minutes,recipient)on conflict do nothing;
 if found then perform private.notify_recipient(recipient,category,'Upcoming deadline','Paparating na takdang oras','Review the classroom calendar for details.','Tingnan ang kalendaryo ng klase para sa detalye.',destination);end if;
end $$;
create function public.process_due_notifications() returns void language plpgsql security definer set search_path='' as $$
declare p public.posts;r record;person uuid;minutes integer;
begin
 if not pg_try_advisory_xact_lock(763214) then return;end if;
 for p in select * from public.posts where kind='announcement' and state='published' and announcement_dispatched_at is null and publish_at<=now() and deleted_at is null and hidden_at is null and deletion_requested_at is null and (expires_at is null or expires_at>now()) and private.term_writable(semester_id) order by publish_at for update skip locked limit 50 loop
  update public.posts set announcement_dispatched_at=now() where id=p.id;
  for person in select id from public.profiles where active and id<>p.author_id loop perform private.notify_recipient(person,'announcements','New announcement','Bagong anunsyo',left(p.title,1000),left(p.title,1000),'/announcements/'||p.id);end loop;
  perform private.deliver_mentions(p.id,null,private.rich_text_plain(p.body),p.author_id);
 end loop;
 for r in select t.* from public.tasks t where t.status='active' and t.deleted_at is null and t.deadline>now() and t.deadline<=now()+interval '7 days' and private.subject_writable(t.subject_id) loop
  foreach minutes in array r.reminder_minutes loop
   for person in select a.student_id from public.task_assignments a left join public.task_completions c on c.task_id=a.task_id and c.student_id=a.student_id where a.task_id=r.id and a.revoked_at is null and not coalesce(c.completed,false) loop perform private.send_due_reminder('task',r.id,r.deadline,minutes,person,'tasks','/tasks/'||r.id);end loop;
  end loop;
 end loop;
 for r in select p0.id,p0.deadline from public.polls p0 where p0.closed_at is null and p0.deadline>now() and p0.deadline<=now()+interval '1 day' and private.term_writable(p0.semester_id) loop
  foreach minutes in array array[1440,60] loop for person in select id from public.profiles where active and not exists(select 1 from private.poll_ballots b where b.poll_id=r.id and b.user_id=profiles.id)loop perform private.send_due_reminder('poll',r.id,r.deadline,minutes,person,'polls','/polls/'||r.id);end loop;end loop;
 end loop;
 for r in select * from public.contributions where status='active' and deadline>now() and deadline<=now()+interval '1 day' and private.term_writable(semester_id) loop
  foreach minutes in array array[1440,60] loop for person in select student_id from public.contribution_records where contribution_id=r.id and status='unpaid' loop perform private.send_due_reminder('contribution',r.id,r.deadline,minutes,person,'contributions','/contributions/'||r.id);end loop;end loop;
 end loop;
 for r in select * from public.calendar_events where archived_at is null and starts_at>now() and starts_at<=now()+interval '1 day' and private.term_writable(semester_id) loop
  foreach minutes in array array[1440,60] loop for person in select id from public.profiles where active loop perform private.send_due_reminder('event',r.id,r.starts_at,minutes,person,'announcements','/calendar/events/'||r.id);end loop;end loop;
 end loop;
end $$;
revoke execute on function private.allowed_push_endpoint(text),private.enqueue_push(),private.send_due_reminder(text,uuid,timestamptz,integer,uuid,text,text),public.register_push(text,text,text),public.disable_push(text),public.my_push_enabled(text),public.claim_push_jobs(integer),public.finish_push_job(uuid,uuid,text),public.process_due_notifications() from public,anon,authenticated;
grant execute on function public.register_push(text,text,text),public.disable_push(text),public.my_push_enabled(text) to authenticated;
grant execute on function public.claim_push_jobs(integer),public.finish_push_job(uuid,uuid,text),public.process_due_notifications() to service_role;

create or replace function public.save_post(target_post uuid,post_kind text,term_id uuid,post_title text,content jsonb,desired_state text,publish_time timestamptz,expiry_time timestamptz,is_pinned boolean) returns uuid language plpgsql security definer set search_path='' as $$
declare p public.posts; result_id uuid; person uuid;
begin
 if not private.active_session() or not private.term_writable(term_id) or not private.valid_rich_text(content) then raise exception 'Invalid or unauthorized post'; end if;
 if post_kind='announcement' then
  if not private.has_role(array['president','vice_president']::public.app_role[]) or desired_state not in ('draft','published') then raise exception 'Official publishing denied'; end if;
 elsif post_kind='discussion' then
  if desired_state not in ('draft','pending') or is_pinned or expiry_time is not null or publish_time is not null then raise exception 'Discussion approval required'; end if;
 else raise exception 'Invalid kind'; end if;
 if target_post is not null then
  select * into strict p from public.posts where id=target_post for update;
  if not private.post_editable(target_post) or p.kind<>post_kind or p.semester_id<>term_id then raise exception 'Post is read-only'; end if;
  update public.posts set title=btrim(post_title),body=content,state=desired_state,publish_at=case when post_kind='announcement' and desired_state='published' then coalesce(publish_time,now()) else null end,expires_at=expiry_time,pinned=is_pinned,edited_at=now() where id=target_post returning id into result_id;
 else
  insert into public.posts(semester_id,author_id,kind,title,body,state,publish_at,expires_at,pinned) values(term_id,auth.uid(),post_kind,btrim(post_title),content,desired_state,case when post_kind='announcement' and desired_state='published' then coalesce(publish_time,now()) else null end,expiry_time,is_pinned) returning id into result_id;
 end if;
 if post_kind='announcement' and desired_state='published' and coalesce(publish_time,now())<=now() then
  update public.posts set announcement_dispatched_at=now() where id=result_id;
  perform private.deliver_mentions(result_id,null,private.rich_text_plain(content),auth.uid());
  if target_post is null or p.state='draft' or p.announcement_dispatched_at is null then
   for person in select id from public.profiles where active and id<>auth.uid() loop perform private.notify_recipient(person,'announcements','New announcement','Bagong anunsyo',left(post_title,1000),left(post_title,1000),'/announcements/'||result_id::text); end loop;
  end if;
 end if;
 if post_kind='announcement' and desired_state='published' and publish_time>now() then update public.posts set announcement_dispatched_at=null where id=result_id;end if;
 return result_id;
end $$;
-- Realtime delivery uses the same notification ownership RLS.
do $$begin if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='notifications') then alter publication supabase_realtime add table public.notifications;end if;end $$;
