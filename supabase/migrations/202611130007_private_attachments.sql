-- Private post attachments: no browser Storage grants; Edge Function performs I/O.
alter table public.posts add column deletion_reason text, add column deletion_actor uuid references public.profiles;
create table public.post_attachments(
 id uuid primary key default gen_random_uuid(),post_id uuid not null references public.posts,uploader_id uuid not null references public.profiles,
 storage_path text not null unique,filename text not null check(length(filename) between 1 and 160 and filename !~ '[/\\\r\n]'),mime_type text not null,byte_size integer not null check(byte_size between 1 and 10485760),
 state text not null default 'pending' check(state in ('pending','ready','deleting','deleted')),created_at timestamptz not null default now(),deleted_at timestamptz
);
alter table public.post_attachments enable row level security;
revoke all on public.post_attachments from public,anon,authenticated;
grant select on public.post_attachments to authenticated;
grant all on public.post_attachments to service_role;
create policy attachments_read on public.post_attachments for select to authenticated using(private.post_readable(post_id) and (state='ready' or uploader_id=auth.uid() or private.has_role(array['president','vice_president']::public.app_role[])));
create function private.valid_attachment(filename text,mime text,bytes integer) returns boolean language sql immutable set search_path='' as $$
 select bytes>0 and bytes<=case when mime like 'image/%' then 5242880 else 10485760 end and length(filename) between 1 and 160 and filename !~ '[/\\\r\n]' and (
 (lower(filename) ~ '\.jpe?g$' and mime='image/jpeg') or (lower(filename) ~ '\.png$' and mime='image/png') or (lower(filename) ~ '\.webp$' and mime='image/webp') or (lower(filename) ~ '\.pdf$' and mime='application/pdf') or
 (lower(filename) ~ '\.docx$' and mime='application/vnd.openxmlformats-officedocument.wordprocessingml.document') or (lower(filename) ~ '\.pptx$' and mime='application/vnd.openxmlformats-officedocument.presentationml.presentation') or (lower(filename) ~ '\.xlsx$' and mime='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'));
$$;
alter table public.post_attachments add constraint attachment_type_size check(private.valid_attachment(filename,mime_type,byte_size));
create function public.reserve_attachment(target_post uuid,file_name text,file_mime text,file_bytes integer) returns public.post_attachments language plpgsql security definer set search_path='' as $$
declare result public.post_attachments; attachment_id uuid=gen_random_uuid();
begin
 perform 1 from public.posts where id=target_post for update;
 if not private.post_editable(target_post) or not coalesce(private.valid_attachment(file_name,file_mime,file_bytes),false) then raise exception 'Attachment denied'; end if;
 if (select count(*) from public.post_attachments where post_id=target_post and state<>'deleted')>=5 then raise exception 'Five attachments maximum'; end if;
 insert into public.post_attachments(id,post_id,uploader_id,storage_path,filename,mime_type,byte_size) values(attachment_id,target_post,auth.uid(),target_post::text||'/'||attachment_id::text,file_name,file_mime,file_bytes) returning * into result;
 insert into public.audit_logs(actor_id,action,target_type,target_id,metadata) values(auth.uid(),'attachment_reserved','post_attachments',attachment_id::text,jsonb_build_object('post_id',target_post));
 return result;
end $$;
create function private.verify_active_operator(actor uuid,operator_session uuid) returns void language plpgsql security definer set search_path='' as $$
begin if not exists(select 1 from public.profiles p join public.app_sessions s on s.user_id=p.id join auth.sessions a on a.id=s.id and a.user_id=p.id where p.id=actor and p.active and s.id=operator_session and s.revoked_at is null) then raise exception 'Unauthorized'; end if;end $$;
create function public.finish_attachment_upload(attachment_id uuid,actor uuid,operator_session uuid) returns void language plpgsql security definer set search_path='' as $$
declare attachment public.post_attachments; p public.posts;
begin
 perform private.verify_active_operator(actor,operator_session);
 select * into strict attachment from public.post_attachments where id=attachment_id for update;
 select * into strict p from public.posts where id=attachment.post_id for update;
 if attachment.uploader_id<>actor or attachment.state<>'pending' or p.deleted_at is not null or p.deletion_requested_at is not null or not private.term_writable(p.semester_id) or p.state='archived' then raise exception 'Upload superseded'; end if;
 if not (p.kind='discussion' and p.author_id=actor) and not exists(select 1 from public.profiles where id=actor and role in ('president','vice_president')) then raise exception 'Upload denied'; end if;
 update public.post_attachments set state='ready' where id=attachment.id;
 insert into public.audit_logs(actor_id,action,target_type,target_id) values(actor,'attachment_uploaded','post_attachments',attachment.id::text);
end $$;
create function public.attachment_access(attachment_id uuid,access_mode text) returns public.post_attachments language plpgsql security definer set search_path='' as $$
declare attachment public.post_attachments;
begin
 select * into strict attachment from public.post_attachments where id=attachment_id for update;
 if access_mode='read' then if not private.post_readable(attachment.post_id) or attachment.state<>'ready' then raise exception 'Attachment unavailable'; end if;
 elsif access_mode='delete' then
  if not private.post_editable(attachment.post_id) then raise exception 'Deletion denied'; end if;
  if attachment.state<>'deleted' then update public.post_attachments set state='deleting' where id=attachment.id; end if;
  insert into public.audit_logs(actor_id,action,target_type,target_id) values(auth.uid(),'attachment_deletion_started','post_attachments',attachment.id::text);
 else raise exception 'Invalid access'; end if;
 return attachment;
end $$;
create function public.finish_attachment_delete(attachment_id uuid,actor uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 update public.post_attachments set state='deleted',deleted_at=now() where id=attachment_id and state<>'deleted';
 if found then insert into public.audit_logs(actor_id,action,target_type,target_id) values(actor,'attachment_deleted','post_attachments',attachment_id::text); end if;
end $$;
create function public.prepare_post_deletion(target_post uuid,removal_reason text,report_id uuid default null) returns setof public.post_attachments language plpgsql security definer set search_path='' as $$
declare p public.posts; privileged boolean;
begin
 if not private.active_session() or removal_reason is null or length(btrim(removal_reason)) not between 3 and 500 then raise exception 'Reason required'; end if;
 select * into strict p from public.posts where id=target_post for update;
 privileged=private.has_role(array['president','vice_president']::public.app_role[]);
 if not privileged and not (p.kind='discussion' and p.author_id=auth.uid() and private.term_writable(p.semester_id) and p.state<>'archived') then raise exception 'Post deletion denied'; end if;
 if report_id is not null and (not privileged or not exists(select 1 from public.content_reports where id=report_id and post_id=target_post and comment_id is null)) then raise exception 'Invalid report'; end if;
 if p.deleted_at is not null then return; end if;
 if exists(select 1 from public.post_attachments where post_id=p.id and state='pending' and created_at>now()-interval '2 minutes') then raise exception 'Upload in progress; retry deletion later'; end if;
 update public.posts set deletion_requested_at=coalesce(deletion_requested_at,now()),deletion_reason=btrim(removal_reason),deletion_actor=auth.uid() where id=p.id;
 update public.post_attachments set state='deleting' where post_id=p.id and state<>'deleted';
 insert into public.audit_logs(actor_id,action,target_type,target_id,reason) values(auth.uid(),'post_deletion_started','posts',p.id::text,btrim(removal_reason));
 return query select * from public.post_attachments where post_id=p.id and state='deleting';
end $$;
create function public.finish_post_deletion(target_post uuid,actor uuid,operator_session uuid,report_id uuid default null) returns void language plpgsql security definer set search_path='' as $$
declare p public.posts;
begin
 perform private.verify_active_operator(actor,operator_session);
 select * into strict p from public.posts where id=target_post for update;
 if p.deleted_at is not null then return; end if;
 if p.deletion_requested_at is null or not (p.author_id=actor or exists(select 1 from public.profiles where id=actor and role in ('president','vice_president'))) then raise exception 'Deletion unavailable'; end if;
 if exists(select 1 from public.post_attachments where post_id=target_post and state<>'deleted') then raise exception 'Storage cleanup incomplete'; end if;
 update public.posts set deleted_at=now(),pinned=false where id=p.id;
 if report_id is not null then
  if not exists(select 1 from public.profiles where id=actor and role in ('president','vice_president')) then raise exception 'Moderation denied'; end if;
  update public.content_reports set state='removed',moderator_id=actor,decision_reason=p.deletion_reason,decided_at=now() where id=report_id and post_id=p.id and comment_id is null;
 end if;
 insert into public.audit_logs(actor_id,action,target_type,target_id,reason) values(actor,'post_deleted','posts',p.id::text,p.deletion_reason);
end $$;
revoke execute on function private.valid_attachment(text,text,integer),private.verify_active_operator(uuid,uuid) from public,anon,authenticated;
revoke execute on function public.reserve_attachment(uuid,text,text,integer),public.attachment_access(uuid,text),public.prepare_post_deletion(uuid,text,uuid),public.finish_attachment_upload(uuid,uuid,uuid),public.finish_attachment_delete(uuid,uuid),public.finish_post_deletion(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.reserve_attachment(uuid,text,text,integer),public.attachment_access(uuid,text),public.prepare_post_deletion(uuid,text,uuid) to authenticated;
grant execute on function public.finish_attachment_upload(uuid,uuid,uuid),public.finish_attachment_delete(uuid,uuid),public.finish_post_deletion(uuid,uuid,uuid,uuid) to service_role;
