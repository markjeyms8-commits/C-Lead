-- Extend the same closed private attachment pipeline to task parents.
alter table public.post_attachments alter column post_id drop not null,add column task_id uuid references public.tasks;
alter table public.post_attachments add constraint one_attachment_parent check((post_id is not null)::integer+(task_id is not null)::integer=1);
drop policy attachments_read on public.post_attachments;
create policy attachments_read on public.post_attachments for select to authenticated using((post_id is not null and private.post_readable(post_id) and (state='ready' or uploader_id=auth.uid() or private.has_role(array['president','vice_president']::public.app_role[]))) or (task_id is not null and private.task_readable(task_id) and (state='ready' or private.task_manager())));
create function public.reserve_task_attachment(target_task uuid,file_name text,file_mime text,file_bytes integer) returns public.post_attachments language plpgsql security definer set search_path='' as $$
declare result public.post_attachments; attachment_id uuid=gen_random_uuid();
begin
 perform 1 from public.tasks where id=target_task for update;
 if not private.task_editable(target_task) or not coalesce(private.valid_attachment(file_name,file_mime,file_bytes),false) then raise exception 'Attachment denied';end if;
 if(select count(*) from public.post_attachments where task_id=target_task and state<>'deleted')>=5 then raise exception 'Five attachments maximum';end if;
 insert into public.post_attachments(id,task_id,uploader_id,storage_path,filename,mime_type,byte_size)values(attachment_id,target_task,auth.uid(),'tasks/'||target_task::text||'/'||attachment_id::text,file_name,file_mime,file_bytes)returning * into result;
 insert into public.audit_logs(actor_id,action,target_type,target_id,metadata)values(auth.uid(),'attachment_reserved','post_attachments',attachment_id::text,jsonb_build_object('task_id',target_task));return result;
end $$;
create function public.finish_task_attachment_upload(attachment_id uuid,actor uuid,operator_session uuid) returns void language plpgsql security definer set search_path='' as $$
declare a public.post_attachments;t public.tasks;
begin
 perform private.verify_active_operator(actor,operator_session);
 select * into strict a from public.post_attachments where id=attachment_id for update;
 select * into strict t from public.tasks where id=a.task_id for update;
 if a.uploader_id<>actor or a.state<>'pending' or t.deleted_at is not null or t.status<>'active' or not private.subject_writable(t.subject_id) or not exists(select 1 from public.profiles where id=actor and role in ('president','vice_president','secretary')) then raise exception 'Upload superseded';end if;
 update public.post_attachments set state='ready' where id=a.id;
 insert into public.audit_logs(actor_id,action,target_type,target_id)values(actor,'attachment_uploaded','post_attachments',a.id::text);
end $$;
create function public.task_attachment_access(attachment_id uuid,access_mode text) returns public.post_attachments language plpgsql security definer set search_path='' as $$
declare a public.post_attachments;
begin
 select * into strict a from public.post_attachments where id=attachment_id for update;
 if a.task_id is null then raise exception 'Wrong parent';end if;
 if access_mode='read' then if not private.task_readable(a.task_id) or a.state<>'ready' then raise exception 'File unavailable';end if;
 elsif access_mode='delete' then
  if not private.task_editable(a.task_id) then raise exception 'Deletion denied';end if;
  if a.state<>'deleted' then update public.post_attachments set state='deleting' where id=a.id;end if;
  insert into public.audit_logs(actor_id,action,target_type,target_id)values(auth.uid(),'attachment_deletion_started','post_attachments',a.id::text);
 else raise exception 'Invalid access';end if;
 return a;
end $$;
revoke execute on function public.reserve_task_attachment(uuid,text,text,integer),public.finish_task_attachment_upload(uuid,uuid,uuid),public.task_attachment_access(uuid,text) from public,anon,authenticated;
grant execute on function public.reserve_task_attachment(uuid,text,text,integer),public.task_attachment_access(uuid,text) to authenticated;
grant execute on function public.finish_task_attachment_upload(uuid,uuid,uuid) to service_role;
