alter table public.subjects add constraint subject_term_unique unique(id,semester_id);
create table public.attendance_sessions(id uuid primary key default gen_random_uuid(),semester_id uuid not null references public.semesters,subject_id uuid references public.subjects,title text not null check(length(btrim(title)) between 1 and 160),kind text not null check(kind in ('subject','meeting','seminar','event','activity')),occurred_at timestamptz not null,creator_id uuid not null references public.profiles,archived_at timestamptz,created_at timestamptz not null default now(),check((kind='subject' and subject_id is not null)or(kind<>'subject' and subject_id is null)),foreign key(subject_id,semester_id) references public.subjects(id,semester_id));
create table public.attendance_records(id uuid primary key default gen_random_uuid(),session_id uuid not null references public.attendance_sessions,student_id uuid not null references public.profiles,status text not null default 'absent' check(status in ('present','late','absent','excused')),updated_at timestamptz not null default now(),unique(session_id,student_id));
create table public.attendance_corrections(id uuid primary key default gen_random_uuid(),record_id uuid not null references public.attendance_records,requester_id uuid not null references public.profiles,previous_status text not null check(previous_status in ('present','late','absent','excused')),requested_status text not null check(requested_status in ('present','late','absent','excused')),reason text not null check(length(btrim(reason)) between 3 and 500),state text not null default 'pending' check(state in ('pending','approved','rejected')),reviewer_id uuid references public.profiles,decision_reason text check(length(btrim(decision_reason)) between 3 and 500),decided_at timestamptz,created_at timestamptz not null default now());
create unique index one_pending_attendance_correction on public.attendance_corrections(record_id)where state='pending';
create function private.attendance_writable(target_session uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.attendance_sessions s where s.id=target_session and s.archived_at is null and private.term_writable(s.semester_id) and (s.subject_id is null or private.subject_writable(s.subject_id)))$$;
create function private.attendance_visible(target_session uuid) returns boolean language sql stable security definer set search_path='' as $$select private.active_session() and (private.task_manager() or exists(select 1 from public.attendance_records r where r.session_id=target_session and r.student_id=auth.uid()))$$;
do $$declare tab text;begin foreach tab in array array['attendance_sessions','attendance_records','attendance_corrections']loop execute format('alter table public.%I enable row level security',tab);execute format('revoke all on public.%I from public,anon,authenticated',tab);execute format('grant select on public.%I to authenticated',tab);execute format('grant all on public.%I to service_role',tab);execute format('create trigger audit_changes after insert or update or delete on public.%I for each row execute function private.audit_change()',tab);end loop;end $$;
create policy attendance_sessions_read on public.attendance_sessions for select to authenticated using(private.attendance_visible(id));
create policy attendance_records_read on public.attendance_records for select to authenticated using(private.active_session() and (student_id=auth.uid() or private.task_manager()));
create policy attendance_corrections_read on public.attendance_corrections for select to authenticated using(private.active_session() and (requester_id=auth.uid() or private.task_manager() or exists(select 1 from public.attendance_records r where r.id=record_id and r.student_id=auth.uid())));
create function public.create_attendance(term_id uuid,session_subject uuid,session_title text,session_kind text,session_time timestamptz) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; person uuid;
begin
 if not private.task_manager() or not private.term_writable(term_id) or session_time is null or session_time>now() or session_time<now()-interval '7 days' then raise exception 'Session must be within the last seven days';end if;
 if session_kind='subject' and not exists(select 1 from public.subjects where id=session_subject and semester_id=term_id and private.subject_writable(id)) then raise exception 'Invalid subject';end if;
 insert into public.attendance_sessions(semester_id,subject_id,title,kind,occurred_at,creator_id)values(term_id,session_subject,btrim(session_title),session_kind,session_time,auth.uid())returning id into result;
 for person in select id from public.profiles where active loop
  insert into public.attendance_records(session_id,student_id)values(result,person);
  perform private.notify_recipient(person,'attendance','Attendance recorded','Naitala ang attendance','Review your attendance record.','Suriin ang iyong attendance record.','/attendance/sessions/'||result);
 end loop;
 return result;
end $$;
create function public.request_attendance_correction(target_record uuid,new_status text,change_reason text) returns uuid language plpgsql security definer set search_path='' as $$
declare r public.attendance_records;result uuid;
begin
 select * into strict r from public.attendance_records where id=target_record for update;
 if not private.active_session() or not private.attendance_writable(r.session_id) or not (r.student_id=auth.uid() or private.task_manager()) or new_status=r.status then raise exception 'Correction denied';end if;
 insert into public.attendance_corrections(record_id,requester_id,previous_status,requested_status,reason)values(r.id,auth.uid(),r.status,new_status,btrim(change_reason))returning id into result;
 insert into public.audit_logs(actor_id,action,target_type,target_id,reason)values(auth.uid(),'attendance_correction_requested','attendance_records',r.id::text,btrim(change_reason));
 return result;
end $$;
create function public.mark_attendance(target_record uuid,new_status text,change_reason text) returns text language plpgsql security definer set search_path='' as $$
declare r public.attendance_records;s public.attendance_sessions;
begin
 if not private.task_manager() or change_reason is null or length(btrim(change_reason)) not between 3 and 500 then raise exception 'Attendance update denied; reason required';end if;
 select * into strict r from public.attendance_records where id=target_record for update;
 select * into strict s from public.attendance_sessions where id=r.session_id for update;
 if not private.attendance_writable(s.id) then raise exception 'Attendance archived';end if;
 if s.occurred_at<now()-interval '7 days' then perform public.request_attendance_correction(r.id,new_status,change_reason);return 'pending';end if;
 if exists(select 1 from public.attendance_corrections where record_id=r.id and state='pending') then raise exception 'Review pending correction first';end if;
 update public.attendance_records set status=new_status,updated_at=now() where id=r.id;
 insert into public.audit_logs(actor_id,action,target_type,target_id,reason,metadata)values(auth.uid(),'attendance_marked','attendance_records',r.id::text,btrim(change_reason),jsonb_build_object('before',r.status,'after',new_status));
 perform private.notify_recipient(r.student_id,'attendance','Attendance updated','Na-update ang attendance','Your attendance status changed.','Nagbago ang iyong attendance status.','/attendance/sessions/'||s.id);
 return 'saved';
end $$;
create function public.review_attendance_correction(correction_id uuid,decision text,review_reason text) returns void language plpgsql security definer set search_path='' as $$
declare c public.attendance_corrections;r public.attendance_records;s public.attendance_sessions;
begin
 if not private.task_manager() or decision not in ('approved','rejected') or review_reason is null or length(btrim(review_reason)) not between 3 and 500 then raise exception 'Review denied';end if;
 -- Lock record before correction to match the marking/request order.
 select r0.* into strict r from public.attendance_records r0 join public.attendance_corrections c0 on c0.record_id=r0.id where c0.id=correction_id for update of r0;
 select * into strict c from public.attendance_corrections where id=correction_id for update;
 select * into strict s from public.attendance_sessions where id=r.session_id for update;
 if c.state<>'pending' then raise exception 'Already reviewed';end if;
 if s.occurred_at<now()-interval '7 days' and not private.has_role(array['president','vice_president']::public.app_role[]) then raise exception 'President or Vice President approval required';end if;
 if decision='approved' then
  if not private.attendance_writable(s.id) or r.status<>c.previous_status then raise exception 'Record changed or archived; reject and resubmit';end if;
  update public.attendance_records set status=c.requested_status,updated_at=now() where id=r.id;
 end if;
 update public.attendance_corrections set state=decision,reviewer_id=auth.uid(),decision_reason=btrim(review_reason),decided_at=now() where id=c.id;
 insert into public.audit_logs(actor_id,action,target_type,target_id,reason,metadata)values(auth.uid(),'attendance_correction_'||decision,'attendance_records',r.id::text,btrim(review_reason),jsonb_build_object('correction_id',c.id,'requested_status',c.requested_status));
 perform private.notify_recipient(r.student_id,'attendance_corrections','Attendance correction reviewed','Nasuri ang pagwawasto','An officer recorded a decision on your correction.','May desisyon na ang opisyal sa pagwawasto.','/attendance/sessions/'||s.id);
end $$;
create function public.archive_attendance(target_session uuid,archive_reason text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.task_manager() or not private.attendance_writable(target_session) or archive_reason is null or length(btrim(archive_reason)) not between 3 and 500 then raise exception 'Archive denied';end if;
 if exists(select 1 from public.attendance_corrections c join public.attendance_records r on r.id=c.record_id where r.session_id=target_session and c.state='pending') then raise exception 'Resolve pending corrections first';end if;
 update public.attendance_sessions set archived_at=now() where id=target_session;
 insert into public.audit_logs(actor_id,action,target_type,target_id,reason)values(auth.uid(),'attendance_archived','attendance_sessions',target_session::text,btrim(archive_reason));
end $$;
revoke execute on function private.attendance_writable(uuid),private.attendance_visible(uuid),public.create_attendance(uuid,uuid,text,text,timestamptz),public.request_attendance_correction(uuid,text,text),public.mark_attendance(uuid,text,text),public.review_attendance_correction(uuid,text,text),public.archive_attendance(uuid,text) from public,anon,authenticated;
grant execute on function private.attendance_visible(uuid) to authenticated;
grant execute on function public.create_attendance(uuid,uuid,text,text,timestamptz),public.request_attendance_correction(uuid,text,text),public.mark_attendance(uuid,text,text),public.review_attendance_correction(uuid,text,text),public.archive_attendance(uuid,text) to authenticated;
