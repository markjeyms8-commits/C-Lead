create table public.calendar_events(id uuid primary key default gen_random_uuid(),semester_id uuid not null references public.semesters,creator_id uuid not null references public.profiles,title text not null check(length(btrim(title)) between 1 and 160),description text not null default '' check(length(description)<=5000),starts_at timestamptz not null,ends_at timestamptz not null,archived_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),check(ends_at>starts_at));
alter table public.calendar_events enable row level security;
revoke all on public.calendar_events from public,anon,authenticated;
grant select on public.calendar_events to authenticated;
grant all on public.calendar_events to service_role;
create policy calendar_events_read on public.calendar_events for select to authenticated using(private.active_session());
create trigger audit_changes after insert or update or delete on public.calendar_events for each row execute function private.audit_change();
create function public.save_calendar_event(target_event uuid,term_id uuid,event_title text,event_description text,start_time timestamptz,end_time timestamptz,change_reason text default null) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;e public.calendar_events;
begin
 if not private.has_role(array['president','vice_president']::public.app_role[]) or not private.term_writable(term_id) or start_time is null or start_time<=now() then raise exception 'Event denied or invalid';end if;
 if target_event is null then insert into public.calendar_events(semester_id,creator_id,title,description,starts_at,ends_at)values(term_id,auth.uid(),btrim(event_title),btrim(event_description),start_time,end_time)returning id into result;
 else
  select * into strict e from public.calendar_events where id=target_event for update;
  if e.archived_at is not null or not private.term_writable(e.semester_id) or change_reason is null or length(btrim(change_reason)) not between 3 and 500 then raise exception 'Event edit denied';end if;
  result=e.id;update public.calendar_events set semester_id=term_id,title=btrim(event_title),description=btrim(event_description),starts_at=start_time,ends_at=end_time,updated_at=now() where id=e.id;
 end if;
 insert into public.audit_logs(actor_id,action,target_type,target_id,reason)values(auth.uid(),case when target_event is null then 'event_created' else 'event_updated' end,'calendar_events',result::text,change_reason);return result;
end $$;
create function public.archive_calendar_event(target_event uuid,archive_reason text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.has_role(array['president','vice_president']::public.app_role[]) or archive_reason is null or length(btrim(archive_reason)) not between 3 and 500 then raise exception 'Event archive denied';end if;
 update public.calendar_events set archived_at=now(),updated_at=now() where id=target_event and archived_at is null;
 if not found then raise exception 'Event unavailable';end if;
 insert into public.audit_logs(actor_id,action,target_type,target_id,reason)values(auth.uid(),'event_archived','calendar_events',target_event::text,btrim(archive_reason));
end $$;
create function public.calendar_feed(range_start timestamptz,range_end timestamptz) returns table(id uuid,kind text,title text,starts_at timestamptz,ends_at timestamptz,path text) language plpgsql security invoker set search_path='' as $$
begin
 if not private.active_session() or range_start is null or range_end is null or range_end<=range_start or range_end-range_start>interval '93 days' then raise exception 'Invalid calendar range';end if;
 return query
 select q.id,q.kind,q.title,q.starts_at,q.ends_at,q.path from (
 select t.id,'task'::text kind,t.title,t.deadline starts_at,t.deadline ends_at,'/tasks/'||t.id::text path from public.tasks t join public.subjects s on s.id=t.subject_id where t.status='active' and private.term_writable(s.semester_id)
 union all select p.id,'poll',p.question,p.deadline,p.deadline,'/polls/'||p.id::text from public.polls p where p.closed_at is null and private.term_writable(p.semester_id)
 union all select c.id,'contribution',c.title,c.deadline,c.deadline,'/contributions/'||c.id::text from public.contributions c where c.status='active' and private.term_writable(c.semester_id)
 union all select a.id,'announcement',a.title,a.publish_at,a.publish_at,'/announcements/'||a.id::text from public.posts a where a.kind='announcement' and a.state='published' and a.hidden_at is null and a.deletion_requested_at is null and private.term_writable(a.semester_id)
 union all select e.id,'event',e.title,e.starts_at,e.ends_at,'/calendar/events/'||e.id::text from public.calendar_events e where e.archived_at is null and private.term_writable(e.semester_id)
 )q where q.starts_at<range_end and q.ends_at>=range_start order by q.starts_at,q.kind,q.id;
end $$;
revoke execute on function public.save_calendar_event(uuid,uuid,text,text,timestamptz,timestamptz,text),public.archive_calendar_event(uuid,text),public.calendar_feed(timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.save_calendar_event(uuid,uuid,text,text,timestamptz,timestamptz,text),public.archive_calendar_event(uuid,text),public.calendar_feed(timestamptz,timestamptz) to authenticated;
