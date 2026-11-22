-- Add native Android FCM tokens beside existing browser Web Push subscriptions.
alter table private.push_subscriptions
  alter column endpoint drop not null,
  alter column p256dh drop not null,
  alter column auth_secret drop not null;

alter table private.push_subscriptions
  add column provider text not null default 'web' check (provider in ('web', 'fcm')),
  add column device_token text,
  add constraint push_subscriptions_provider_shape check (
    (provider = 'web' and endpoint is not null and p256dh is not null and auth_secret is not null and device_token is null)
    or
    (provider = 'fcm' and endpoint is null and p256dh is null and auth_secret is null and device_token is not null and length(device_token) between 20 and 4096 and device_token ~ '^[A-Za-z0-9:_-]+$')
  );

create unique index one_active_fcm_token
  on private.push_subscriptions(device_token)
  where provider = 'fcm' and disabled_at is null;

create function public.register_native_push(device_token text)
returns uuid
language plpgsql security definer set search_path=''
as $$
declare result uuid; current_session uuid=(auth.jwt()->>'session_id')::uuid;
begin
  if not private.active_session()
    or length(device_token) not between 20 and 4096
    or device_token !~ '^[A-Za-z0-9:_-]+$'
  then raise exception 'Push subscription denied'; end if;
  if (select count(*) from private.push_subscriptions where user_id=auth.uid() and disabled_at is null and not (provider='fcm' and private.push_subscriptions.device_token=register_native_push.device_token)) >= 10
  then raise exception 'Ten push devices maximum'; end if;
  perform pg_advisory_xact_lock(hashtext(device_token));
  update private.push_subscriptions set disabled_at=now()
    where provider='fcm' and private.push_subscriptions.device_token=register_native_push.device_token and disabled_at is null;
  insert into private.push_subscriptions(user_id,session_id,provider,device_token)
    values(auth.uid(),current_session,'fcm',device_token) returning id into result;
  insert into public.audit_logs(actor_id,action,target_type,target_id)
    values(auth.uid(),'push_enabled','push_subscriptions',result::text);
  return result;
end $$;

create function public.disable_native_push()
returns void
language plpgsql security definer set search_path=''
as $$
begin
  if not private.active_session() then raise exception 'Unauthorized'; end if;
  update private.push_subscriptions set disabled_at=now()
    where user_id=auth.uid() and session_id=(auth.jwt()->>'session_id')::uuid and provider='fcm' and disabled_at is null;
  insert into public.audit_logs(actor_id,action,target_type,target_id)
    values(auth.uid(),'push_disabled','push_subscriptions',auth.uid()::text);
end $$;

create function public.my_native_push_enabled()
returns boolean
language sql stable security definer set search_path=''
as $$
  select private.active_session() and exists(
    select 1 from private.push_subscriptions
    where user_id=auth.uid() and session_id=(auth.jwt()->>'session_id')::uuid
      and provider='fcm' and disabled_at is null
  )
$$;

drop function public.claim_push_jobs(integer);
create function public.claim_push_jobs(batch_size integer default 10, provider_filter text default null)
returns table(job_id uuid,claim_id uuid,subscription_id uuid,provider text,endpoint text,device_token text,p256dh text,auth_secret text,title text,body text,path text)
language plpgsql security definer set search_path=''
as $$
declare j private.push_jobs;s private.push_subscriptions;n public.notifications;token uuid;fil boolean;claimed integer=0;
begin
  if batch_size not between 1 and 10 or (provider_filter is not null and provider_filter not in ('web','fcm')) then raise exception 'Invalid batch'; end if;
  for j in select q.* from private.push_jobs q join private.push_subscriptions ps on ps.id=q.subscription_id where (q.state='pending' and q.next_attempt_at<=now() or q.state='sending' and q.lease_until<=now()) and (provider_filter is null or ps.provider=provider_filter) order by q.created_at for update of q skip locked limit 100 loop
    select * into strict s from private.push_subscriptions where id=j.subscription_id;
    select * into strict n from public.notifications where id=j.notification_id;
    if j.attempts>=5 or j.created_at<now()-interval '7 days' or s.disabled_at is not null
      or not exists(select 1 from public.profiles p join public.app_sessions a on a.user_id=p.id join auth.sessions h on h.id=a.id where p.id=s.user_id and p.active and a.id=s.session_id and a.revoked_at is null)
      or (n.category<>'security' and exists(select 1 from public.notification_preferences where user_id=s.user_id and category=n.category and not enabled)) then
      update private.push_jobs set state='skipped',finished_at=now() where id=j.id; continue;
    end if;
    token=gen_random_uuid();
    update private.push_jobs set state='sending',attempts=attempts+1,lease_id=token,lease_until=now()+interval '2 minutes' where id=j.id;
    select language='fil' into fil from public.preferences where user_id=s.user_id;
    job_id=j.id;claim_id=token;subscription_id=s.id;provider=s.provider;endpoint=s.endpoint;device_token=s.device_token;p256dh=s.p256dh;auth_secret=s.auth_secret;title='C-LEAD';body=case when fil then 'Buksan ang C-LEAD para sa bagong abiso.' else 'Open C-LEAD for a new notification.' end;path='/notifications';return next;
    claimed=claimed+1; exit when claimed>=batch_size;
  end loop;
end $$;

revoke execute on function public.register_native_push(text),public.disable_native_push(),public.my_native_push_enabled(),public.claim_push_jobs(integer,text) from public,anon,authenticated;
grant execute on function public.register_native_push(text),public.disable_native_push(),public.my_native_push_enabled() to authenticated;
grant execute on function public.claim_push_jobs(integer,text) to service_role;
