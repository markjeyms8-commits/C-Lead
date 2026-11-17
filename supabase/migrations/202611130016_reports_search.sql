-- Reporting returns a consistent authorized snapshot and audits every export request.
create function public.export_report(report_kind text, export_format text, term_id uuid default null, subject_filter uuid default null, event_filter uuid default null, student_filter uuid default null, date_from date default null, date_to date default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare rows_data jsonb; officer text; total bigint;
begin
 if export_format is null or report_kind is null or export_format not in ('pdf','xlsx') or report_kind not in ('attendance','contributions') or not private.active_session() then raise exception 'Invalid report';end if;
 if (report_kind='attendance' and not private.task_manager()) or (report_kind='contributions' and not private.finance_manager()) then raise exception 'Report denied';end if;
 if date_from is not null and date_to is not null and date_to<date_from then raise exception 'Invalid dates';end if;
 select full_name into officer from public.profiles where id=auth.uid();
 if report_kind='attendance' then
 select coalesce(jsonb_agg(to_jsonb(q) order by q.occurred_at,q.event,q.student),'[]') into rows_data from (
 select s.id event_id,s.title event,s.occurred_at,p.full_name student,r.status,sub.name subject,sem.name term,r.updated_at
 from public.attendance_records r join public.attendance_sessions s on s.id=r.session_id join public.profiles p on p.id=r.student_id join public.semesters sem on sem.id=s.semester_id left join public.subjects sub on sub.id=s.subject_id
 where (term_id is null or s.semester_id=term_id) and(subject_filter is null or s.subject_id=subject_filter)and(event_filter is null or s.id=event_filter)and(student_filter is null or r.student_id=student_filter)and(date_from is null or (s.occurred_at at time zone 'Asia/Manila')::date>=date_from)and(date_to is null or (s.occurred_at at time zone 'Asia/Manila')::date<=date_to)
 )q;
 else
 select coalesce(jsonb_agg(to_jsonb(q) order by q.deadline,q.event,q.student),'[]') into rows_data from (
 select c.id event_id,c.title event,p.full_name student,r.status,c.amount_cent,c.deadline,c.created_at,r.updated_at,sem.name term
 from public.contribution_records r join public.contributions c on c.id=r.contribution_id join public.profiles p on p.id=r.student_id join public.semesters sem on sem.id=c.semester_id
 where (term_id is null or c.semester_id=term_id)and(event_filter is null or c.id=event_filter)and(student_filter is null or r.student_id=student_filter)and(date_from is null or (c.deadline at time zone 'Asia/Manila')::date>=date_from)and(date_to is null or (c.deadline at time zone 'Asia/Manila')::date<=date_to)
 )q;
 end if;
 total=jsonb_array_length(rows_data);
 if total>10000 then raise exception 'Narrow report filters';end if;
 insert into public.audit_logs(actor_id,action,target_type,metadata)values(auth.uid(),'report_export','reports',jsonb_build_object('kind',report_kind,'format',export_format,'rows',total,'term',term_id,'subject',subject_filter,'event',event_filter,'student',student_filter,'from',date_from,'to',date_to));
 return jsonb_build_object('kind',report_kind,'generated_at',now(),'officer',officer,'rows',rows_data);
end $$;
-- Invoker execution preserves every underlying table's RLS, including archived visibility.
create function public.global_search(search_text text, include_archive boolean default false, page_offset integer default 0) returns table(id uuid,kind text,title text,path text) language plpgsql security invoker set search_path='' as $$
begin
 if not private.active_session() or search_text is null or page_offset is null or include_archive is null or length(btrim(search_text)) not between 2 and 100 or page_offset<0 or page_offset>10000 then raise exception 'Invalid search';end if;
 return query select q.id,q.kind,q.title,q.path from (
 select p.id,'post'::text kind,p.title,'/announcements/'||p.id::text path from public.posts p where (include_archive or private.term_writable(p.semester_id))and p.hidden_at is null and p.deletion_requested_at is null and position(lower(btrim(search_text)) in lower(p.title||' '||coalesce((select string_agg(b.value->>'text',' ')from jsonb_array_elements(p.body)b),'')))>0
 union all select t.id,'task',t.title,'/tasks/'||t.id::text from public.tasks t join public.subjects s on s.id=t.subject_id where(include_archive or (t.status='active' and s.archived_at is null and private.term_writable(s.semester_id)))and position(lower(btrim(search_text)) in lower(t.title||' '||t.description))>0
 union all select p.id,'member',p.full_name,'/members?search='||p.username from public.profiles p where p.active and position(lower(btrim(search_text)) in lower(p.full_name||' '||p.username))>0
 union all select g.id,'group',g.name,'/groups/'||g.id::text from public.subject_groups g join public.subjects gs on gs.id=g.subject_id where g.deleted_at is null and(include_archive or(g.archived_at is null and gs.archived_at is null and private.term_writable(gs.semester_id)))and position(lower(btrim(search_text)) in lower(g.name))>0
 )q order by q.kind,q.title,q.id limit 20 offset page_offset;
end $$;
create function public.internal_analytics() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not private.has_role(array['president','vice_president']::public.app_role[])then raise exception 'Analytics denied';end if;
 return jsonb_build_object('active_users',(select count(*) from public.profiles where active),'announcement_views',(select count(*) from public.announcement_views),'poll_ballots',(select count(*) from private.poll_ballots),'task_assigned',(select count(*) from public.task_assignments where revoked_at is null),'task_completed',(select count(*) from public.task_assignments a join public.task_completions c using(task_id,student_id) where a.revoked_at is null and c.completed),'attendance',coalesce((select jsonb_object_agg(status,n)from(select status,count(*) n from public.attendance_records group by status)x),'{}'),'contributions',coalesce((select jsonb_object_agg(status,n)from(select r.status,sum(c.amount_cent) n from public.contribution_records r join public.contributions c on c.id=r.contribution_id group by r.status)x),'{}'));
end $$;
revoke execute on function public.export_report(text,text,uuid,uuid,uuid,uuid,date,date),public.global_search(text,boolean,integer),public.internal_analytics() from public,anon,authenticated;
grant execute on function public.export_report(text,text,uuid,uuid,uuid,uuid,date,date),public.global_search(text,boolean,integer),public.internal_analytics() to authenticated;
