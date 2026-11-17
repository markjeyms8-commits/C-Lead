-- Task targeting snapshots the current roster; later group changes do not rewrite assignments.
alter table public.tasks add column target_group_id uuid references public.subject_groups,add column target_user_id uuid references public.profiles,add column status text not null default 'active' check(status in ('active','archived')),add column reminder_minutes integer[] not null default array[1440,60];
alter table public.tasks add constraint task_target_shape check((target_type='class' and target_group_id is null and target_user_id is null)or(target_type='group' and target_group_id is not null and target_user_id is null)or(target_type='individual' and target_group_id is null and target_user_id is not null));
alter table public.task_assignments add column revoked_at timestamptz;
create function private.task_manager() returns boolean language sql stable security definer set search_path='' as $$select private.has_role(array['president','vice_president','secretary']::public.app_role[])$$;
create function private.task_readable(target_task uuid) returns boolean language sql stable security definer set search_path='' as $$select private.active_session() and exists(select 1 from public.tasks t where t.id=target_task and t.deleted_at is null and (private.task_manager() or exists(select 1 from public.task_assignments a where a.task_id=t.id and a.student_id=auth.uid() and a.revoked_at is null)))$$;
create function private.task_editable(target_task uuid) returns boolean language sql stable security definer set search_path='' as $$select private.task_manager() and exists(select 1 from public.tasks t where t.id=target_task and t.deleted_at is null and t.status='active' and private.subject_writable(t.subject_id))$$;
drop policy tasks_read on public.tasks;
create policy tasks_read on public.tasks for select to authenticated using(private.task_readable(id));
drop policy assignments_read on public.task_assignments;
create policy assignments_read on public.task_assignments for select to authenticated using(private.active_session() and (private.task_manager() or student_id=auth.uid() and revoked_at is null));
drop policy completions_read on public.task_completions;
create policy completions_read on public.task_completions for select to authenticated using(private.task_readable(task_id) and (private.task_manager() or student_id=auth.uid()));
create function public.save_task(target_task uuid,task_subject uuid,task_title text,task_description text,due_at timestamptz,audience text,group_target uuid,user_target uuid,reminders integer[],change_reason text default null) returns uuid language plpgsql security definer set search_path='' as $$
declare task public.tasks; result uuid; recipients uuid[]; person uuid; previous uuid[];
begin
 if not private.task_manager() or not private.subject_writable(task_subject) or due_at is null or due_at<=now() or reminders is null or cardinality(reminders)>5 or exists(select 1 from unnest(reminders) n where n is null or n not between 1 and 10080) then raise exception 'Task denied or invalid';end if;
 if audience='class' and group_target is null and user_target is null then select array_agg(id) into recipients from public.profiles where active;
 elsif audience='group' and user_target is null then
  perform 1 from public.subject_groups where id=group_target and subject_id=task_subject and archived_at is null and deleted_at is null for update;
  if not found then raise exception 'Invalid subject group';end if;
  select array_agg(m.user_id) into recipients from public.group_members m join public.profiles p on p.id=m.user_id where m.group_id=group_target and p.active;
 elsif audience='individual' and group_target is null and exists(select 1 from public.profiles where id=user_target and active) then recipients=array[user_target];
 else raise exception 'Invalid task target';end if;
 if coalesce(cardinality(recipients),0)=0 then raise exception 'Task needs an active recipient';end if;
 if target_task is null then
  insert into public.tasks(subject_id,creator_id,title,description,deadline,target_type,target_group_id,target_user_id,reminder_minutes)values(task_subject,auth.uid(),btrim(task_title),btrim(task_description),due_at,audience,group_target,user_target,reminders) returning id into result;
 else
  select * into strict task from public.tasks where id=target_task for update;
  if not private.task_editable(task.id) or change_reason is null or length(btrim(change_reason)) not between 3 and 500 then raise exception 'Task edit denied; reason required';end if;
  result=task.id;
  update public.tasks set subject_id=task_subject,title=btrim(task_title),description=btrim(task_description),deadline=due_at,target_type=audience,target_group_id=group_target,target_user_id=user_target,reminder_minutes=reminders where id=result;
 end if;
 select coalesce(array_agg(student_id),'{}'::uuid[]) into previous from public.task_assignments where task_id=result and revoked_at is null;
 update public.task_assignments set revoked_at=now() where task_id=result and not student_id=any(recipients) and revoked_at is null;
 foreach person in array recipients loop
  insert into public.task_assignments(task_id,student_id)values(result,person)on conflict(task_id,student_id)do update set revoked_at=null;
  perform private.notify_recipient(person,'tasks','Task assigned or updated','Na-update ang gawain','Check your task details and deadline.','Tingnan ang detalye at takdang oras ng gawain.','/tasks/'||result);
 end loop;
 insert into public.audit_logs(actor_id,action,target_type,target_id,reason,metadata)values(auth.uid(),case when target_task is null then 'task_created' else 'task_updated' end,'tasks',result::text,change_reason,jsonb_build_object('previous_assignments',previous,'assignments',recipients));
 return result;
end $$;
create function public.set_task_completion(target_task uuid,is_complete boolean) returns void language plpgsql security definer set search_path='' as $$
declare task public.tasks;
begin
 select * into strict task from public.tasks where id=target_task for update;
 if not private.task_readable(task.id) or task.status<>'active' or task.deadline<=now() or not private.subject_writable(task.subject_id) or is_complete is null or not exists(select 1 from public.task_assignments where task_id=task.id and student_id=auth.uid() and revoked_at is null) then raise exception 'Task completion locked';end if;
 insert into public.task_completions(task_id,student_id,completed)values(task.id,auth.uid(),is_complete)on conflict(task_id,student_id)do update set completed=excluded.completed,updated_at=now();
 insert into public.audit_logs(actor_id,action,target_type,target_id,metadata)values(auth.uid(),'task_completion_changed','tasks',task.id::text,jsonb_build_object('completed',is_complete));
end $$;
create function public.archive_task(target_task uuid,archive_reason text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.task_editable(target_task) or archive_reason is null or length(btrim(archive_reason)) not between 3 and 500 then raise exception 'Task archive denied';end if;
 update public.tasks set status='archived' where id=target_task;
 insert into public.audit_logs(actor_id,action,target_type,target_id,reason)values(auth.uid(),'task_archived','tasks',target_task::text,btrim(archive_reason));
end $$;
create function public.task_progress(target_task uuid) returns table(student_id uuid,full_name text,completed boolean,overdue boolean,locked boolean,revoked_at timestamptz) language plpgsql security definer set search_path='' as $$
begin
 if not private.task_readable(target_task) then raise exception 'Task unavailable';end if;
 return query select a.student_id,p.full_name,coalesce(c.completed,false),not coalesce(c.completed,false) and t.deadline<=now(),t.deadline<=now() or t.status<>'active' or not private.subject_writable(t.subject_id),a.revoked_at from public.task_assignments a join public.profiles p on p.id=a.student_id join public.tasks t on t.id=a.task_id left join public.task_completions c on c.task_id=a.task_id and c.student_id=a.student_id where a.task_id=target_task and (private.task_manager() or a.student_id=auth.uid() and a.revoked_at is null) order by p.full_name,p.id;
end $$;
revoke execute on function private.task_manager(),private.task_readable(uuid),private.task_editable(uuid),public.save_task(uuid,uuid,text,text,timestamptz,text,uuid,uuid,integer[],text),public.set_task_completion(uuid,boolean),public.archive_task(uuid,text),public.task_progress(uuid) from public,anon,authenticated;
grant execute on function private.task_manager(),private.task_readable(uuid) to authenticated;
grant execute on function public.save_task(uuid,uuid,text,text,timestamptz,text,uuid,uuid,integer[],text),public.set_task_completion(uuid,boolean),public.archive_task(uuid,text),public.task_progress(uuid) to authenticated;
