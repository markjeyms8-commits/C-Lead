-- Subject-group management retains membership history and auditable officer overrides.
create table public.group_membership_history(
 id uuid primary key default gen_random_uuid(),group_id uuid not null references public.subject_groups,
 user_id uuid not null references public.profiles,actor_id uuid not null references public.profiles,
 action text not null check(action in ('added','removed')),reason text,created_at timestamptz not null default now()
);
alter table public.group_membership_history enable row level security;
revoke all on public.group_membership_history from public,anon,authenticated;
grant select on public.group_membership_history to authenticated;
grant all on public.group_membership_history to service_role;
create policy group_history_read on public.group_membership_history for select to authenticated using(private.active_session() and exists(select 1 from public.subject_groups g where g.id=group_id and (g.creator_id=auth.uid() or private.has_role(array['president','vice_president','secretary']::public.app_role[]))));
create function private.subject_writable(subject uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.subjects s where s.id=subject and s.archived_at is null and private.term_writable(s.semester_id));
$$;
create function public.save_group(target_group uuid,group_name text,group_subject uuid,members uuid[],change_reason text default null) returns uuid language plpgsql security definer set search_path='' as $$
declare g public.subject_groups; result uuid; member uuid; before_members uuid[]; officer boolean;
begin
 if not private.active_session() or group_name is null or length(btrim(group_name)) not between 1 and 100 or not private.subject_writable(group_subject) then raise exception 'Invalid group'; end if;
 if members is null or cardinality(members)>50 or exists(select 1 from unnest(members) u where u is null or not exists(select 1 from public.profiles p where p.id=u and p.active)) or cardinality(members)<>(select count(distinct u) from unnest(members) u) then raise exception 'Invalid roster membership'; end if;
 officer=private.has_role(array['president','vice_president','secretary']::public.app_role[]);
 if target_group is null then
  insert into public.subject_groups(subject_id,creator_id,name) values(group_subject,auth.uid(),btrim(group_name)) returning id into result;
 else
  select * into strict g from public.subject_groups where id=target_group for update;
  if g.deleted_at is not null or g.archived_at is not null or not private.subject_writable(g.subject_id) or (g.creator_id<>auth.uid() and not officer) then raise exception 'Group edit denied'; end if;
  if g.creator_id<>auth.uid() and (change_reason is null or length(btrim(change_reason)) not between 3 and 500) then raise exception 'Override reason required'; end if;
  if g.creator_id<>auth.uid() and not private.has_role(array['president','vice_president']::public.app_role[]) and (g.name<>btrim(group_name) or g.subject_id<>group_subject) then raise exception 'Secretary may correct membership only'; end if;
  result=g.id;
  update public.subject_groups set name=btrim(group_name),subject_id=group_subject,updated_at=now() where id=result;
 end if;
 select coalesce(array_agg(user_id),'{}'::uuid[]) into before_members from public.group_members where group_id=result;
 foreach member in array before_members loop
  if not member=any(members) then
   insert into public.group_membership_history(group_id,user_id,actor_id,action,reason) values(result,member,auth.uid(),'removed',change_reason);
   delete from public.group_members where group_id=result and user_id=member;
   perform private.notify_recipient(member,'groups','Group membership updated','Na-update ang grupo','Your subject-group membership changed.','Nagbago ang iyong pagiging miyembro ng grupo.','/groups/'||result);
  end if;
 end loop;
 foreach member in array members loop
  if not member=any(before_members) then
   insert into public.group_members(group_id,user_id) values(result,member);
   insert into public.group_membership_history(group_id,user_id,actor_id,action,reason) values(result,member,auth.uid(),'added',change_reason);
   perform private.notify_recipient(member,'groups','Added to a group','Idinagdag sa grupo','You were added to a subject group.','Idinagdag ka sa isang grupo ng asignatura.','/groups/'||result);
  end if;
 end loop;
 insert into public.audit_logs(actor_id,action,target_type,target_id,reason,metadata) values(auth.uid(),case when target_group is null then 'group_created' when g.creator_id<>auth.uid() then 'group_overridden' else 'group_updated' end,'subject_groups',result::text,change_reason,jsonb_build_object('previous_members',before_members,'members',members));
 return result;
end $$;
create function public.moderate_group(target_group uuid,decision text,change_reason text) returns void language plpgsql security definer set search_path='' as $$
declare g public.subject_groups; member uuid;
begin
 if not private.has_role(array['president','vice_president']::public.app_role[]) or decision not in ('archive','remove') or change_reason is null or length(btrim(change_reason)) not between 3 and 500 then raise exception 'Group moderation denied'; end if;
 select * into strict g from public.subject_groups where id=target_group for update;
 if g.deleted_at is not null then raise exception 'Group removed'; end if;
 update public.subject_groups set archived_at=coalesce(archived_at,now()),deleted_at=case when decision='remove' then now() else deleted_at end,updated_at=now() where id=g.id;
 insert into public.audit_logs(actor_id,action,target_type,target_id,reason) values(auth.uid(),'group_'||decision,'subject_groups',g.id::text,btrim(change_reason));
 for member in select distinct user_id from public.group_members where group_id=g.id union select g.creator_id loop
  perform private.notify_recipient(member,'groups','Group archived or removed','Na-archive o inalis ang grupo','An officer updated your subject group.','Na-update ng opisyal ang iyong grupo.','/groups');
 end loop;
end $$;
revoke execute on function private.subject_writable(uuid),public.save_group(uuid,text,uuid,uuid[],text),public.moderate_group(uuid,text,text) from public,anon,authenticated;
grant execute on function public.save_group(uuid,text,uuid,uuid[],text),public.moderate_group(uuid,text,text) to authenticated;
