-- Communication workflows; existing post and academic foundations remain authoritative.
alter table public.posts add column edited_at timestamptz, add column hidden_at timestamptz, add column deletion_requested_at timestamptz;
create table public.discussion_decisions(id uuid primary key default gen_random_uuid(),post_id uuid not null references public.posts,reviewer_id uuid not null references public.profiles,decision text not null check(decision in ('approved','rejected')),reason text not null check(length(reason) between 3 and 500),created_at timestamptz not null default now());
-- Subject-group foundations are needed for mentions; management RPCs follow in milestone 7.
create table public.subject_groups(id uuid primary key default gen_random_uuid(),mention_handle text not null unique default ('group-'||left(replace(gen_random_uuid()::text,'-',''),8)) check(mention_handle ~ '^[a-z0-9._-]{3,40}$'),subject_id uuid not null references public.subjects,creator_id uuid not null references public.profiles,name text not null check(length(name) between 1 and 100),archived_at timestamptz,deleted_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table public.group_members(group_id uuid not null references public.subject_groups,user_id uuid not null references public.profiles,created_at timestamptz not null default now(),primary key(group_id,user_id));
create table public.comments(id uuid primary key default gen_random_uuid(),post_id uuid not null references public.posts,author_id uuid not null references public.profiles,parent_id uuid references public.comments,body text not null check(length(body)<=3000),edited_at timestamptz,hidden_at timestamptz,deleted_at timestamptz,created_at timestamptz not null default now(),unique(post_id,id));
create table public.reactions(id uuid primary key default gen_random_uuid(),post_id uuid not null references public.posts,comment_id uuid,user_id uuid not null references public.profiles,reaction text not null check(reaction in ('like','love','laugh','surprised','sad','support')),created_at timestamptz not null default now(),foreign key(post_id,comment_id) references public.comments(post_id,id));
create unique index one_reaction on public.reactions(user_id,post_id,coalesce(comment_id,'00000000-0000-0000-0000-000000000000'::uuid));
create table public.content_reports(id uuid primary key default gen_random_uuid(),post_id uuid not null references public.posts,comment_id uuid,reporter_id uuid not null references public.profiles,reason text not null check(length(reason) between 3 and 1000),state text not null default 'pending' check(state in ('pending','hidden','removed','rejected','restored')),moderator_id uuid references public.profiles,decision_reason text check(length(decision_reason) between 3 and 1000),decided_at timestamptz,created_at timestamptz not null default now(),foreign key(post_id,comment_id) references public.comments(post_id,id));
create unique index one_pending_content_report on public.content_reports(reporter_id,post_id,coalesce(comment_id,'00000000-0000-0000-0000-000000000000'::uuid)) where state='pending';
create table private.content_mentions(post_id uuid not null references public.posts,comment_id uuid,recipient_id uuid not null references public.profiles,created_at timestamptz not null default now(),foreign key(post_id,comment_id) references public.comments(post_id,id));
create unique index one_content_mention on private.content_mentions(post_id,coalesce(comment_id,'00000000-0000-0000-0000-000000000000'::uuid),recipient_id);
create table public.announcement_views(post_id uuid not null references public.posts,user_id uuid not null references public.profiles,viewed_at timestamptz not null default now(),primary key(post_id,user_id));
create index comments_post on public.comments(post_id,created_at);
create index reports_pending on public.content_reports(state,created_at);
create function private.valid_rich_text(content jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare block jsonb; key text; total integer=0;
begin
 if content is null or jsonb_typeof(content)<>'array' or jsonb_array_length(content) not between 1 and 50 then return false; end if;
 for block in select * from jsonb_array_elements(content) loop
  if jsonb_typeof(block)<>'object' or coalesce(block->>'type','') not in ('paragraph','bullet','number') or jsonb_typeof(block->'text') is distinct from 'string' or length(block->>'text') not between 1 and 2000 then return false; end if;
  for key in select jsonb_object_keys(block) loop if key not in ('type','text','bold','italic','url') then return false; end if; end loop;
  if (block ? 'bold' and jsonb_typeof(block->'bold')<>'boolean') or (block ? 'italic' and jsonb_typeof(block->'italic')<>'boolean') then return false; end if;
  if block ? 'url' and (jsonb_typeof(block->'url')<>'string' or length(block->>'url')>2000 or block->>'url' !~ '^https?://[A-Za-z0-9][^[:space:]<>"\\]*$') then return false; end if;
  total=total+length(block->>'text');
 end loop;
 return total<=20000;
end $$;
-- Existing drafts may have an empty initial body; the save RPC requires nonempty validated blocks.
alter table public.posts add constraint safe_post_body check(body='[]'::jsonb or private.valid_rich_text(body));
create function private.post_readable(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.active_session() and exists(select 1 from public.posts p where p.id=target and p.deleted_at is null and (private.has_role(array['president','vice_president']::public.app_role[]) or p.author_id=auth.uid() or (p.hidden_at is null and p.deletion_requested_at is null and p.publish_at<=now() and ((p.kind='announcement' and p.state in ('published','archived')) or (p.kind='discussion' and (p.state='approved' or (p.state='archived' and exists(select 1 from public.discussion_decisions d where d.post_id=p.id and d.decision='approved'))))))));
$$;
create function private.post_interactable(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.post_readable(target) and exists(select 1 from public.posts p where p.id=target and p.hidden_at is null and p.deletion_requested_at is null and private.term_writable(p.semester_id) and p.publish_at<=now() and (p.expires_at is null or p.expires_at>now()) and p.state in ('published','approved'));
$$;
create function private.post_editable(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.active_session() and exists(select 1 from public.posts p where p.id=target and p.deleted_at is null and p.deletion_requested_at is null and p.state<>'archived' and private.term_writable(p.semester_id) and ((p.kind='announcement' and private.has_role(array['president','vice_president']::public.app_role[])) or (p.kind='discussion' and p.author_id=auth.uid())));
$$;
create function private.notify_recipient(recipient uuid,category_name text,title_en text,title_fil text,body_en text,body_fil text,destination text) returns void language plpgsql security definer set search_path='' as $$
declare filipino boolean;
begin
 if not exists(select 1 from public.profiles where id=recipient and active) or (category_name<>'security' and exists(select 1 from public.notification_preferences where user_id=recipient and category=category_name and not enabled)) then return; end if;
 select language='fil' into filipino from public.preferences where user_id=recipient;
 insert into public.notifications(user_id,category,title,body,path) values(recipient,category_name,case when filipino then title_fil else title_en end,case when filipino then body_fil else body_en end,destination);
end $$;
create function private.deliver_mentions(target_post uuid,target_comment uuid,content text,content_author uuid) returns void language plpgsql security definer set search_path='' as $$
declare recipient uuid;
begin
 for recipient in
  select distinct p.id from public.profiles p where p.active and p.id<>content_author and (
   p.username in (select lower(m[2]) from regexp_matches(content,'(^|[[:space:]])@([A-Za-z0-9._-]{3,40})(?![A-Za-z0-9._:-])','g') m)
   or exists(select 1 from public.group_members gm join public.subject_groups g on g.id=gm.group_id where gm.user_id=p.id and g.deleted_at is null and g.archived_at is null and g.mention_handle in (select lower(m[2]) from regexp_matches(content,'(^|[[:space:]])@group:([A-Za-z0-9._-]{3,40})(?![A-Za-z0-9._-])','g') m)))
 loop
  insert into private.content_mentions(post_id,comment_id,recipient_id) values(target_post,target_comment,recipient) on conflict do nothing;
  if found then perform private.notify_recipient(recipient,'mentions','You were mentioned','Nabanggit ka','Open the classroom conversation.','Buksan ang usapan ng klase.','/announcements/'||target_post::text); end if;
 end loop;
end $$;
create function private.rich_text_plain(content jsonb) returns text language sql immutable set search_path='' as $$ select string_agg(value->>'text',E'\n') from jsonb_array_elements(content); $$;
revoke execute on function private.rich_text_plain(jsonb) from public,anon,authenticated;
create function public.save_post(target_post uuid,post_kind text,term_id uuid,post_title text,content jsonb,desired_state text,publish_time timestamptz,expiry_time timestamptz,is_pinned boolean) returns uuid language plpgsql security definer set search_path='' as $$
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
  perform private.deliver_mentions(result_id,null,private.rich_text_plain(content),auth.uid());
  if target_post is null or p.state='draft' then
   for person in select id from public.profiles where active and id<>auth.uid() loop perform private.notify_recipient(person,'announcements','New announcement','Bagong anunsyo',left(post_title,1000),left(post_title,1000),'/announcements/'||result_id::text); end loop;
  end if;
 end if;
 return result_id;
end $$;
create function public.archive_post(target_post uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.post_editable(target_post) then raise exception 'Post is read-only'; end if;
 update public.posts set state='archived',pinned=false where id=target_post;
end $$;
create function public.review_discussion(target_post uuid,decision text,decision_reason text) returns void language plpgsql security definer set search_path='' as $$
declare p public.posts;
begin
 if not private.has_role(array['president','vice_president']::public.app_role[]) or decision not in ('approved','rejected') or decision_reason is null or length(btrim(decision_reason)) not between 3 and 500 then raise exception 'Invalid review'; end if;
 select * into strict p from public.posts where id=target_post for update;
 if p.kind<>'discussion' or p.state<>'pending' or p.deleted_at is not null or p.deletion_requested_at is not null or not private.term_writable(p.semester_id) then raise exception 'Discussion unavailable'; end if;
 insert into public.discussion_decisions(post_id,reviewer_id,decision,reason) values(p.id,auth.uid(),decision,btrim(decision_reason));
 update public.posts set state=decision,publish_at=case when decision='approved' then now() else null end where id=p.id;
 perform private.notify_recipient(p.author_id,'discussion_decisions','Discussion reviewed','Nasuri ang talakayan',decision||': '||decision_reason,case when decision='approved' then 'Inaprubahan: ' else 'Tinanggihan: ' end||decision_reason,'/announcements/'||p.id::text);
 if decision='approved' and p.hidden_at is null then perform private.deliver_mentions(p.id,null,private.rich_text_plain(p.body),p.author_id); end if;
 insert into public.audit_logs(actor_id,action,target_type,target_id,reason) values(auth.uid(),'discussion_'||decision,'posts',p.id::text,decision_reason);
end $$;
create function public.save_comment(target_comment uuid,target_post uuid,parent_comment uuid,comment_body text) returns uuid language plpgsql security definer set search_path='' as $$
declare c public.comments; parent public.comments; result_id uuid; post_author uuid;
begin
 if not private.post_interactable(target_post) or comment_body is null or length(btrim(comment_body)) not between 1 and 3000 then raise exception 'Comment unavailable'; end if;
 if parent_comment is not null then select * into strict parent from public.comments where id=parent_comment; if parent.post_id<>target_post or parent.parent_id is not null or parent.deleted_at is not null or parent.hidden_at is not null then raise exception 'Only one reply level'; end if; end if;
 if target_comment is not null then
  select * into strict c from public.comments where id=target_comment for update;
  if c.author_id<>auth.uid() or c.post_id<>target_post or c.parent_id is distinct from parent_comment or c.deleted_at is not null or c.hidden_at is not null then raise exception 'Comment edit denied'; end if;
  update public.comments set body=btrim(comment_body),edited_at=now() where id=c.id returning id into result_id;
 else
  insert into public.comments(post_id,author_id,parent_id,body) values(target_post,auth.uid(),parent_comment,btrim(comment_body)) returning id into result_id;
  select author_id into post_author from public.posts where id=target_post;
  if post_author<>auth.uid() then perform private.notify_recipient(post_author,'comments','New comment','Bagong komento',left(comment_body,1000),left(comment_body,1000),'/announcements/'||target_post::text); end if;
  if parent_comment is not null and parent.author_id<>auth.uid() and parent.author_id<>post_author then perform private.notify_recipient(parent.author_id,'comments','New reply','Bagong sagot',left(comment_body,1000),left(comment_body,1000),'/announcements/'||target_post::text); end if;
 end if;
 perform private.deliver_mentions(target_post,result_id,comment_body,auth.uid());return result_id;
end $$;
create function public.delete_comment(target_comment uuid) returns void language plpgsql security definer set search_path='' as $$
declare c public.comments;
begin
 select * into strict c from public.comments where id=target_comment for update;
 if c.author_id<>auth.uid() or not private.post_interactable(c.post_id) then raise exception 'Comment deletion denied'; end if;
 update public.comments set body='',deleted_at=now() where id=c.id and deleted_at is null;
end $$;
create function public.set_reaction(target_post uuid,target_comment uuid,chosen_reaction text) returns void language plpgsql security definer set search_path='' as $$
declare recipient uuid;
begin
 if not private.post_interactable(target_post) then raise exception 'Reaction denied'; end if;
 perform 1 from public.posts where id=target_post for update;
 if target_comment is not null then select author_id into recipient from public.comments where id=target_comment and post_id=target_post and deleted_at is null and hidden_at is null; if not found then raise exception 'Comment unavailable'; end if; else select author_id into recipient from public.posts where id=target_post; end if;
 delete from public.reactions where user_id=auth.uid() and post_id=target_post and comment_id is not distinct from target_comment;
 if chosen_reaction is not null then
  insert into public.reactions(post_id,comment_id,user_id,reaction) values(target_post,target_comment,auth.uid(),chosen_reaction);
  if recipient<>auth.uid() then perform private.notify_recipient(recipient,'reactions','New reaction','Bagong reaksyon','Someone reacted to your content.','May nagbigay ng reaksyon sa nilalaman mo.','/announcements/'||target_post::text); end if;
 end if;
end $$;
create function public.report_content(target_post uuid,target_comment uuid,report_reason text) returns uuid language plpgsql security definer set search_path='' as $$
declare result_id uuid;
begin
 if not private.post_readable(target_post) then raise exception 'Report denied'; end if;
 if target_comment is not null and not exists(select 1 from public.comments where id=target_comment and post_id=target_post and deleted_at is null and hidden_at is null) then raise exception 'Comment unavailable'; end if;
 insert into public.content_reports(post_id,comment_id,reporter_id,reason) values(target_post,target_comment,auth.uid(),btrim(report_reason)) returning id into result_id; return result_id;
end $$;
create function public.moderate_report(report_id uuid,decision text,moderation_reason text) returns void language plpgsql security definer set search_path='' as $$
declare r public.content_reports;
begin
 if not private.has_role(array['president','vice_president']::public.app_role[]) or decision not in ('hidden','rejected','restored') or moderation_reason is null or length(btrim(moderation_reason)) not between 3 and 1000 then raise exception 'Moderation denied'; end if;
 select * into strict r from public.content_reports where id=report_id for update;
 if r.state='removed' or exists(select 1 from public.posts where id=r.post_id and (deleted_at is not null or deletion_requested_at is not null)) or exists(select 1 from public.comments where id=r.comment_id and deleted_at is not null) then raise exception 'Removed content cannot be moderated'; end if;
 if decision='hidden' then if r.comment_id is null then update public.posts set hidden_at=now() where id=r.post_id; else update public.comments set hidden_at=now() where id=r.comment_id; end if; end if;
 if decision='restored' then if r.comment_id is null then update public.posts set hidden_at=null where id=r.post_id and deleted_at is null; else update public.comments set hidden_at=null where id=r.comment_id and deleted_at is null; end if; end if;
 update public.content_reports set state=decision,moderator_id=auth.uid(),decision_reason=btrim(moderation_reason),decided_at=now() where id=r.id;
 insert into public.audit_logs(actor_id,action,target_type,target_id,reason,metadata) values(auth.uid(),'moderation_'||decision,'content_reports',r.id::text,btrim(moderation_reason),jsonb_build_object('post_id',r.post_id,'comment_id',r.comment_id));
end $$;
create function public.record_announcement_view(target_post uuid) returns void language plpgsql security definer set search_path='' as $$
begin if not private.post_readable(target_post) then raise exception 'Unavailable'; end if; insert into public.announcement_views(post_id,user_id) select target_post,auth.uid() where exists(select 1 from public.posts where id=target_post and kind='announcement') on conflict do nothing; end $$;
do $$ declare tab text;begin
 foreach tab in array array['discussion_decisions','subject_groups','group_members','comments','reactions','content_reports','announcement_views'] loop
  execute format('alter table public.%I enable row level security',tab);execute format('revoke all on public.%I from public,anon,authenticated',tab);execute format('grant select on public.%I to authenticated',tab);execute format('grant all on public.%I to service_role',tab);
 end loop;
 foreach tab in array array['comments','content_reports','subject_groups'] loop execute format('create trigger audit_changes after insert or update or delete on public.%I for each row execute function private.audit_change()',tab);end loop;
end $$;
alter table private.content_mentions enable row level security;
revoke all on private.content_mentions from public,anon,authenticated;
drop policy posts_read on public.posts;
create policy posts_read on public.posts for select to authenticated using(private.post_readable(id));
create policy decisions_read on public.discussion_decisions for select to authenticated using(private.active_session() and (private.has_role(array['president','vice_president']::public.app_role[]) or exists(select 1 from public.posts p where p.id=post_id and p.author_id=auth.uid())));
create policy comments_read on public.comments for select to authenticated using(private.post_readable(post_id) and (hidden_at is null or author_id=auth.uid() or private.has_role(array['president','vice_president']::public.app_role[])));
create policy reactions_read on public.reactions for select to authenticated using(private.post_readable(post_id) and (comment_id is null or exists(select 1 from public.comments c where c.id=comment_id and c.deleted_at is null and c.hidden_at is null)));
create policy reports_read on public.content_reports for select to authenticated using(private.active_session() and (reporter_id=auth.uid() or private.has_role(array['president','vice_president']::public.app_role[])));
create policy groups_read on public.subject_groups for select to authenticated using(private.active_session() and deleted_at is null);
create policy group_members_read on public.group_members for select to authenticated using(private.active_session() and exists(select 1 from public.subject_groups g where g.id=group_id and g.deleted_at is null));
create policy views_read on public.announcement_views for select to authenticated using(private.active_session() and (user_id=auth.uid() or private.has_role(array['president','vice_president']::public.app_role[])));
revoke execute on function private.valid_rich_text(jsonb),private.post_readable(uuid),private.post_interactable(uuid),private.post_editable(uuid),private.notify_recipient(uuid,text,text,text,text,text,text),private.deliver_mentions(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function private.post_readable(uuid),private.post_interactable(uuid),private.post_editable(uuid) to authenticated;
revoke execute on function public.save_post(uuid,text,uuid,text,jsonb,text,timestamptz,timestamptz,boolean),public.archive_post(uuid),public.review_discussion(uuid,text,text),public.save_comment(uuid,uuid,uuid,text),public.delete_comment(uuid),public.set_reaction(uuid,uuid,text),public.report_content(uuid,uuid,text),public.moderate_report(uuid,text,text),public.record_announcement_view(uuid) from public,anon,authenticated;
grant execute on function public.save_post(uuid,text,uuid,text,jsonb,text,timestamptz,timestamptz,boolean),public.archive_post(uuid),public.review_discussion(uuid,text,text),public.save_comment(uuid,uuid,uuid,text),public.delete_comment(uuid),public.set_reaction(uuid,uuid,text),public.report_content(uuid,uuid,text),public.moderate_report(uuid,text,text),public.record_announcement_view(uuid) to authenticated;
-- Supabase owns its Realtime publication; PGlite does not provide it.
do $$ declare tab text;begin if exists(select 1 from pg_publication where pubname='supabase_realtime') then foreach tab in array array['posts','comments','reactions','content_reports'] loop if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=tab) then execute format('alter publication supabase_realtime add table public.%I',tab);end if;end loop;end if;end $$;
create function private.comment_shape() returns trigger language plpgsql set search_path='' as $$
declare parent public.comments;
begin
 if new.parent_id is not null then select * into strict parent from public.comments where id=new.parent_id; if parent.parent_id is not null or parent.post_id<>new.post_id or parent.id=new.id then raise exception 'Only one reply level in same post'; end if; end if; return new;
end $$;
create trigger comment_shape before insert or update on public.comments for each row execute function private.comment_shape();
revoke execute on function private.comment_shape() from public,anon,authenticated;
create function public.remove_reported_comment(report_id uuid,moderation_reason text) returns void language plpgsql security definer set search_path='' as $$
declare r public.content_reports;
begin
 if not private.has_role(array['president','vice_president']::public.app_role[]) or moderation_reason is null or length(btrim(moderation_reason)) not between 3 and 1000 then raise exception 'Moderation denied'; end if;
 select * into strict r from public.content_reports where id=report_id for update;
 if r.comment_id is null then raise exception 'Use attachment-aware post removal'; end if;
 update public.comments set body='',deleted_at=now() where id=r.comment_id;
 update public.content_reports set state='removed',moderator_id=auth.uid(),decision_reason=btrim(moderation_reason),decided_at=now() where id=r.id;
 insert into public.audit_logs(actor_id,action,target_type,target_id,reason) values(auth.uid(),'moderation_removed','comments',r.comment_id::text,btrim(moderation_reason));
end $$;
revoke execute on function public.remove_reported_comment(uuid,text) from public,anon,authenticated;
grant execute on function public.remove_reported_comment(uuid,text) to authenticated;
create function public.communication_feed(feed_mode text,post_kind text,page_offset integer default 0) returns setof public.posts language sql stable security invoker set search_path='' as $$
 select p.* from public.posts p where (post_kind='all' or p.kind=post_kind) and (
 (feed_mode='mine' and p.author_id=auth.uid()) or
 (feed_mode='review' and private.has_role(array['president','vice_president']::public.app_role[]) and p.kind='discussion' and p.state='pending') or
 (p.hidden_at is null and p.deletion_requested_at is null and p.publish_at<=now() and (
 (feed_mode='active' and p.state in ('published','approved') and (p.expires_at is null or p.expires_at>now()) and private.term_writable(p.semester_id)) or
 (feed_mode='archive' and p.state in ('published','approved','archived') and (p.state='archived' or p.expires_at<=now() or not private.term_writable(p.semester_id))))))
 order by p.kind,p.pinned desc,p.publish_at desc nulls last,p.created_at desc,p.id limit 20 offset greatest(0,least(page_offset,100000));
$$;
create function public.post_permissions(target_post uuid) returns jsonb language sql stable security definer set search_path='' as $$ select jsonb_build_object('readable',private.post_readable(target_post),'editable',private.post_editable(target_post),'interactable',private.post_interactable(target_post)); $$;
revoke execute on function public.communication_feed(text,text,integer),public.post_permissions(uuid) from public,anon,authenticated;
grant execute on function public.communication_feed(text,text,integer),public.post_permissions(uuid) to authenticated;
