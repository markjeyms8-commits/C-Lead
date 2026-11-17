-- Complete milestone 4 without changing the established identity strategy.
alter table public.preferences add column tour_completed_at timestamptz;
create table public.notification_preferences (
 user_id uuid not null references public.profiles(id),
 category text not null check(category in ('announcements','polls','contributions','discussions','comments','tasks','attendance','attendance_corrections','groups','reactions','mentions','discussion_decisions')),
 enabled boolean not null default true,
 updated_at timestamptz not null default now(), primary key(user_id,category)
);
alter table public.notification_preferences enable row level security;
revoke all on public.notification_preferences from anon,authenticated;
grant select on public.notification_preferences to authenticated;
grant all on public.notification_preferences to service_role;
create policy notification_preferences_read on public.notification_preferences for select to authenticated using(private.active_session() and user_id=auth.uid());

create function private.save_notification_choices(choices jsonb) returns void language plpgsql security definer set search_path='' as $$
declare category_name text; enabled_value jsonb;
begin
 if choices is null or jsonb_typeof(choices)<>'object' then raise exception 'Invalid notification preferences'; end if;
 for category_name,enabled_value in select * from jsonb_each(choices) loop
  if jsonb_typeof(enabled_value)<>'boolean' then raise exception 'Invalid notification preference'; end if;
  insert into public.notification_preferences(user_id,category,enabled) values(auth.uid(),category_name,enabled_value::boolean)
  on conflict(user_id,category) do update set enabled=excluded.enabled,updated_at=now();
 end loop;
end $$;
create function public.save_my_preferences(chosen_language text,chosen_theme text,notification_choices jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.active_session() then raise exception 'Unauthorized'; end if;
 insert into public.preferences(user_id,language,theme) values(auth.uid(),chosen_language,chosen_theme)
 on conflict(user_id) do update set language=excluded.language,theme=excluded.theme;
 perform private.save_notification_choices(notification_choices);
end $$;
-- Replace the earlier signature; explicit acceptance and tour completion are mandatory.
drop function public.complete_onboarding(text,text);
create function public.complete_onboarding(chosen_language text,chosen_theme text,notification_choices jsonb,privacy_accepted boolean,community_accepted boolean,tour_completed boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.active_session() then raise exception 'Unauthorized'; end if;
 if privacy_accepted is distinct from true or community_accepted is distinct from true or tour_completed is distinct from true then raise exception 'Acceptance and tour required'; end if;
 perform public.save_my_preferences(chosen_language,chosen_theme,notification_choices);
 insert into public.policy_acceptances(user_id,policy,version) values(auth.uid(),'privacy','1.0'),(auth.uid(),'community','1.0') on conflict do nothing;
 update public.preferences set tour_completed_at=coalesce(tour_completed_at,now()) where user_id=auth.uid();
end $$;

create function public.my_sessions() returns table(id uuid,device_label text,created_at timestamptz,is_current boolean) language sql stable security definer set search_path='' as $$
 select s.id,s.device_label,s.created_at,s.id::text=auth.jwt()->>'session_id'
 from public.app_sessions s join auth.sessions a on a.id=s.id and a.user_id=s.user_id
 where private.active_session() and s.user_id=auth.uid() and s.revoked_at is null order by s.created_at desc;
$$;
create function public.revoke_my_session(target_session uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.active_session() then raise exception 'Unauthorized'; end if;
 update public.app_sessions set revoked_at=now() where id=target_session and user_id=auth.uid() and revoked_at is null;
 if not found then raise exception 'Session unavailable'; end if;
 insert into public.audit_logs(actor_id,action,target_type,target_id) values(auth.uid(),'session_revoked','app_sessions',target_session::text);
end $$;

-- A monotonically increasing credential generation prevents an in-flight old
-- password login from approving a session after a password change/reset begins.
alter table private.identities add column credential_generation bigint not null default 0;
create table private.password_changes (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id),
 session_id uuid not null, completed_at timestamptz, created_at timestamptz not null default now()
);
alter table private.password_changes enable row level security;
create unique index one_pending_password_change on private.password_changes(user_id) where completed_at is null;
drop function public.resolve_login(text);
create function public.resolve_login(login_username text) returns table(user_id uuid,internal_email text,credential_generation bigint) language sql stable security definer set search_path='' as $$
 select i.user_id,i.internal_email,i.credential_generation from private.identities i join public.profiles p on p.id=i.user_id
 where p.username=login_username and p.active and not exists(select 1 from private.password_changes c where c.user_id=p.id and c.completed_at is null);
$$;
create function public.approve_login(login_username text,lease_token uuid,auth_session uuid,expected_generation bigint,device_name text) returns boolean language plpgsql security definer set search_path='' as $$
declare identity_row private.identities;
begin
 select i.* into identity_row from private.identities i join public.profiles p on p.id=i.user_id where p.username=login_username and p.active for update of i;
 if not found or identity_row.credential_generation<>expected_generation or exists(select 1 from private.password_changes where user_id=identity_row.user_id and completed_at is null) then return false; end if;
 if not exists(select 1 from auth.sessions where id=auth_session and user_id=identity_row.user_id) then return false; end if;
 if not public.finish_login(login_username,lease_token,true) then return false; end if;
 insert into public.app_sessions(id,user_id,device_label) values(auth_session,identity_row.user_id,left(coalesce(nullif(device_name,''),'Browser'),120));
 return true;
end $$;
create function public.login_retry_after(login_username text) returns integer language sql stable security definer set search_path='' as $$
 select coalesce((select greatest(0,ceil(extract(epoch from (greatest(locked_until,lease_until)-now())))::integer) from private.login_attempts where username=login_username),0);
$$;

create function public.begin_password_change() returns uuid language plpgsql security definer set search_path='' as $$
declare change_id uuid; current_session uuid=(auth.jwt()->>'session_id')::uuid;
begin
 if not private.active_session() then raise exception 'Unauthorized'; end if;
 perform 1 from private.identities where user_id=auth.uid() for update;
 select id into change_id from private.password_changes where user_id=auth.uid() and completed_at is null and session_id=current_session;
 if change_id is not null then return change_id; end if;
 insert into private.password_changes(user_id,session_id) values(auth.uid(),current_session) returning id into change_id;
 update private.identities set credential_generation=credential_generation+1 where user_id=auth.uid();
 update public.app_sessions set revoked_at=now() where user_id=auth.uid() and id<>current_session and revoked_at is null;
 insert into public.audit_logs(actor_id,action,target_type,target_id,metadata) values(auth.uid(),'password_change_started','profiles',auth.uid()::text,jsonb_build_object('operation_id',change_id));
 return change_id;
end $$;
create function public.finish_password_change(change_id uuid,actor uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 update private.password_changes set completed_at=now() where id=change_id and user_id=actor and completed_at is null;
 if not found then return; end if;
 insert into public.audit_logs(actor_id,action,target_type,target_id,metadata) values(actor,'password_changed','profiles',actor::text,jsonb_build_object('operation_id',change_id));
 insert into public.notifications(user_id,category,title,body,path) values(actor,'security','Password changed','Your password changed. Other devices were signed out.','/settings/sessions');
end $$;
-- Deactivation closes existing sessions permanently, even after reactivation.
create function private.deactivate_sessions() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.active and not new.active then
  update public.app_sessions set revoked_at=now() where user_id=new.id and revoked_at is null;
  update private.identities set credential_generation=credential_generation+1 where user_id=new.id;
 end if;
 return new;
end $$;
create trigger deactivate_sessions after update of active on public.profiles for each row execute function private.deactivate_sessions();
revoke all on private.password_changes from public,anon,authenticated;
revoke execute on function private.save_notification_choices(jsonb),private.deactivate_sessions() from public,anon,authenticated;
revoke execute on function public.save_my_preferences(text,text,jsonb),public.complete_onboarding(text,text,jsonb,boolean,boolean,boolean),public.my_sessions(),public.revoke_my_session(uuid),public.begin_password_change(),public.finish_password_change(uuid,uuid),public.resolve_login(text),public.approve_login(text,uuid,uuid,bigint,text),public.login_retry_after(text) from public,anon,authenticated;
grant execute on function public.save_my_preferences(text,text,jsonb),public.complete_onboarding(text,text,jsonb,boolean,boolean,boolean),public.my_sessions(),public.revoke_my_session(uuid),public.begin_password_change() to authenticated;
grant execute on function public.finish_password_change(uuid,uuid),public.resolve_login(text),public.approve_login(text,uuid,uuid,bigint,text),public.login_retry_after(text) to service_role;

-- Trusted first-account provisioning; not an application administration role.
create function public.bootstrap_president(auth_user_id uuid,official_name text,normalized_username text,official_student_number text,identity_email text) returns void language plpgsql security definer set search_path='' as $$
begin
 lock table public.profiles in exclusive mode;
 if exists(select 1 from public.profiles) then raise exception 'Bootstrap requires an empty roster'; end if;
 insert into public.profiles(id,full_name,username,role) values(auth_user_id,official_name,normalized_username,'president');
 insert into private.identities(user_id,internal_email,student_number) values(auth_user_id,identity_email,official_student_number);
 insert into public.audit_logs(actor_id,action,target_type,target_id) values(auth_user_id,'president_bootstrapped','profiles',auth_user_id::text);
end $$;
revoke execute on function public.bootstrap_president(uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.bootstrap_president(uuid,text,text,text,text) to service_role;
