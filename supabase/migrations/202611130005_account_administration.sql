-- Account administration: private durable operations, no client Auth privileges.
create table private.account_creations (
 id uuid primary key, user_id uuid not null unique default gen_random_uuid(), actor_id uuid not null references public.profiles,
 full_name text not null check(length(full_name) between 1 and 160), username text not null unique check(username ~ '^[a-z0-9._-]{3,40}$'),
 student_number text not null unique check(length(student_number) between 3 and 40), completed_at timestamptz, created_at timestamptz not null default now()
);
create table private.account_resets (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles, actor_id uuid not null references public.profiles,
 reason text not null check(length(reason) between 3 and 500), completed_at timestamptz, created_at timestamptz not null default now()
);
create unique index one_pending_reset on private.account_resets(user_id) where completed_at is null;
create table private.credential_leases(user_id uuid primary key references public.profiles, token uuid not null, expires_at timestamptz not null);
alter table private.account_creations enable row level security;
alter table private.account_resets enable row level security;
alter table private.credential_leases enable row level security;
revoke all on private.account_creations,private.account_resets,private.credential_leases from public,anon,authenticated;
create function private.require_account_admin() returns void language plpgsql security definer set search_path='' as $$
begin if not private.has_role(array['president','vice_president']::public.app_role[]) then raise exception 'Unauthorized'; end if; end $$;
create function private.verify_account_operator(actor uuid,session_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.profiles p join public.app_sessions s on s.user_id=p.id join auth.sessions a on a.id=s.id and a.user_id=p.id where p.id=actor and p.active and p.role in ('president','vice_president') and s.id=session_id and s.revoked_at is null) then raise exception 'Unauthorized'; end if;
end $$;
create function public.account_roster() returns table(id uuid,full_name text,username text,role public.app_role,active boolean,student_number text) language sql stable security definer set search_path='' as $$
 select p.id,p.full_name,p.username,p.role,p.active,
 case when p.id=auth.uid() or private.has_role(array['president','vice_president']::public.app_role[]) then i.student_number else '••••'||right(i.student_number,2) end
 from public.profiles p join private.identities i on i.user_id=p.id
 where private.active_session() and (p.active or private.has_role(array['president','vice_president']::public.app_role[])) order by p.full_name,p.id;
$$;
create function public.prepare_account(operation_id uuid,official_name text,login_username text,official_number text) returns uuid language plpgsql security definer set search_path='' as $$
declare existing private.account_creations;
begin
 perform private.require_account_admin();
 lock table private.account_creations in exclusive mode;
 official_name=btrim(official_name); login_username=lower(btrim(login_username)); official_number=btrim(official_number);
 select * into existing from private.account_creations where id=operation_id;
 if found then
  if existing.full_name<>official_name or existing.username<>login_username or existing.student_number<>official_number then raise exception 'Operation mismatch'; end if;
  return existing.id;
 end if;
 if exists(select 1 from public.profiles where username=login_username) or exists(select 1 from private.identities where student_number=official_number) then raise exception 'Duplicate identity'; end if;
 if (select count(*) from public.profiles where active)+(select count(*) from private.account_creations where completed_at is null)>=50 then raise exception 'Class capacity reached'; end if;
 insert into private.account_creations(id,actor_id,full_name,username,student_number) values(operation_id,auth.uid(),official_name,login_username,official_number);
 insert into public.audit_logs(actor_id,action,target_type,target_id) values(auth.uid(),'account_creation_started','account_operations',operation_id::text);
 return operation_id;
end $$;
create function public.account_creation_details(operation_id uuid,actor uuid,operator_session uuid) returns table(user_id uuid,full_name text,username text,student_number text,completed boolean) language plpgsql security definer set search_path='' as $$
begin
 perform private.verify_account_operator(actor,operator_session);
 return query select c.user_id,c.full_name,c.username,c.student_number,c.completed_at is not null from private.account_creations c where c.id=operation_id;
end $$;
create function public.finish_account_creation(operation_id uuid,actor uuid,operator_session uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare c private.account_creations;
begin
 perform private.verify_account_operator(actor,operator_session);
 select * into strict c from private.account_creations where id=operation_id for update;
 if c.completed_at is not null then return c.user_id; end if;
 insert into public.profiles(id,full_name,username) values(c.user_id,c.full_name,c.username);
 insert into private.identities(user_id,internal_email,student_number) values(c.user_id,c.user_id::text||'@identity.c-lead.invalid',c.student_number);
 update private.account_creations set completed_at=now() where id=c.id;
 insert into public.audit_logs(actor_id,action,target_type,target_id,metadata) values(actor,'account_created','profiles',c.user_id::text,jsonb_build_object('operation_id',c.id));
 return c.user_id;
end $$;
create function public.pending_account_creations() returns table(operation_id uuid,full_name text,username text,student_number text) language plpgsql security definer set search_path='' as $$
begin perform private.require_account_admin(); return query select c.id,c.full_name,c.username,c.student_number from private.account_creations c where c.completed_at is null order by c.created_at; end $$;
create function public.edit_account(target_user uuid,official_name text,login_username text,official_number text,assigned_role public.app_role,is_active boolean,change_reason text) returns void language plpgsql security definer set search_path='' as $$
declare p public.profiles; old_number text;
begin
 perform private.require_account_admin();
 if change_reason is null or length(btrim(change_reason)) not between 3 and 500 then raise exception 'Reason required'; end if;
 lock table private.account_creations in exclusive mode;
 select * into strict p from public.profiles where id=target_user for update;
 if (p.role='president' and (assigned_role<>'president' or not is_active)) or (p.role<>'president' and assigned_role='president') then raise exception 'President requires controlled process'; end if;
 if target_user=auth.uid() and (assigned_role<>p.role or not is_active) then raise exception 'Cannot remove own administrative access'; end if;
 if exists(select 1 from private.account_resets where user_id=target_user and completed_at is null) then raise exception 'Complete pending password reset first'; end if;
 if not p.active and is_active and (select count(*) from public.profiles where active)+(select count(*) from private.account_creations where completed_at is null)>=50 then raise exception 'Class capacity reached'; end if;
 if exists(select 1 from private.account_creations where completed_at is null and (username=lower(btrim(login_username)) or student_number=btrim(official_number))) then raise exception 'Identity reserved'; end if;
 select student_number into old_number from private.identities where user_id=target_user for update;
 update public.profiles set full_name=btrim(official_name),username=lower(btrim(login_username)),role=assigned_role,active=is_active where id=target_user;
 update private.identities set student_number=btrim(official_number) where user_id=target_user;
 if p.role<>assigned_role or p.username<>lower(btrim(login_username)) then
  update public.app_sessions set revoked_at=now() where user_id=target_user and revoked_at is null;
  update private.identities set credential_generation=credential_generation+1 where user_id=target_user;
 end if;
 insert into public.audit_logs(actor_id,action,target_type,target_id,reason,metadata) values(auth.uid(),'account_edited','profiles',target_user::text,btrim(change_reason),jsonb_build_object('student_number_changed',old_number<>btrim(official_number)));
end $$;
create function public.prepare_account_reset(target_user uuid,reset_reason text) returns uuid language plpgsql security definer set search_path='' as $$
declare operation_id uuid;
begin
 perform private.require_account_admin();
 if target_user=auth.uid() then raise exception 'Use own password change'; end if;
 if length(btrim(reset_reason)) not between 3 and 500 then raise exception 'Reason required'; end if;
 perform 1 from private.identities where user_id=target_user for update;
 if not found then raise exception 'Unknown account'; end if;
 if exists(select 1 from private.credential_leases where user_id=target_user and expires_at>now()) then raise exception 'Credential operation in progress; retry later'; end if;
 select id into operation_id from private.account_resets where user_id=target_user and completed_at is null;
 if operation_id is not null then return operation_id; end if;
 insert into private.account_resets(user_id,actor_id,reason) values(target_user,auth.uid(),btrim(reset_reason)) returning id into operation_id;
 update public.app_sessions set revoked_at=now() where user_id=target_user and revoked_at is null;
 update private.identities set credential_generation=credential_generation+1 where user_id=target_user;
 insert into public.audit_logs(actor_id,action,target_type,target_id,reason,metadata) values(auth.uid(),'password_reset_started','profiles',target_user::text,btrim(reset_reason),jsonb_build_object('operation_id',operation_id));
 return operation_id;
end $$;
create function public.account_reset_details(operation_id uuid,actor uuid,operator_session uuid) returns table(user_id uuid,student_number text,completed boolean) language plpgsql security definer set search_path='' as $$
begin perform private.verify_account_operator(actor,operator_session); return query select r.user_id,i.student_number,r.completed_at is not null from private.account_resets r join private.identities i on i.user_id=r.user_id where r.id=operation_id; end $$;
create function public.claim_credential_write(target_user uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare claim uuid=gen_random_uuid();
begin
 insert into private.credential_leases(user_id,token,expires_at) values(target_user,claim,now()+interval '2 minutes') on conflict(user_id) do update set token=excluded.token,expires_at=excluded.expires_at where private.credential_leases.expires_at<=now();
 if not found then raise exception 'Credential write busy'; end if; return claim;
end $$;
create function public.release_credential_write(target_user uuid,claim uuid) returns void language sql security definer set search_path='' as $$ delete from private.credential_leases where user_id=target_user and token=claim; $$;
create function public.finish_account_reset(operation_id uuid,actor uuid,operator_session uuid) returns void language plpgsql security definer set search_path='' as $$
declare r private.account_resets;
begin
 perform private.verify_account_operator(actor,operator_session);
 select * into strict r from private.account_resets where id=operation_id for update;
 if r.completed_at is not null then return; end if;
 update private.password_changes set completed_at=now() where user_id=r.user_id and completed_at is null;
 update private.account_resets set completed_at=now() where id=r.id;
 delete from private.login_attempts where username=(select username from public.profiles where id=r.user_id);
 insert into public.audit_logs(actor_id,action,target_type,target_id,reason,metadata) values(actor,'password_reset_completed','profiles',r.user_id::text,r.reason,jsonb_build_object('operation_id',r.id,'interrupted_change_resolved',true));
 insert into public.notifications(user_id,category,title,body,path) values(r.user_id,'security',case when (select language from public.preferences where user_id=r.user_id)='fil' then 'Na-reset ang password' else 'Password reset' end,case when (select language from public.preferences where user_id=r.user_id)='fil' then 'Ni-reset ng administrador ang password mo. Mag-sign in gamit ang student number.' else 'An administrator reset your password. Sign in with your student number.' end,'/settings/password');
end $$;
-- Pending reset blocks the existing login resolver and password-change function without duplicating their logic.
create or replace function public.resolve_login(login_username text) returns table(user_id uuid,internal_email text,credential_generation bigint) language sql stable security definer set search_path='' as $$
 select i.user_id,i.internal_email,i.credential_generation from private.identities i join public.profiles p on p.id=i.user_id where p.username=login_username and p.active and not exists(select 1 from private.password_changes c where c.user_id=p.id and c.completed_at is null) and not exists(select 1 from private.account_resets r where r.user_id=p.id and r.completed_at is null);
$$;
-- A reset always revokes all approved sessions, so begin_password_change's active-session check rejects the target.
revoke execute on function private.require_account_admin(),private.verify_account_operator(uuid,uuid) from public,anon,authenticated;
revoke execute on function public.account_roster(),public.prepare_account(uuid,text,text,text),public.pending_account_creations(),public.edit_account(uuid,text,text,text,public.app_role,boolean,text),public.prepare_account_reset(uuid,text),public.account_creation_details(uuid,uuid,uuid),public.finish_account_creation(uuid,uuid,uuid),public.account_reset_details(uuid,uuid,uuid),public.finish_account_reset(uuid,uuid,uuid),public.claim_credential_write(uuid),public.release_credential_write(uuid,uuid) from public,anon,authenticated;
grant execute on function public.account_roster(),public.prepare_account(uuid,text,text,text),public.pending_account_creations(),public.edit_account(uuid,text,text,text,public.app_role,boolean,text),public.prepare_account_reset(uuid,text) to authenticated;
grant execute on function public.account_creation_details(uuid,uuid,uuid),public.finish_account_creation(uuid,uuid,uuid),public.account_reset_details(uuid,uuid,uuid),public.finish_account_reset(uuid,uuid,uuid),public.claim_credential_write(uuid),public.release_credential_write(uuid,uuid) to service_role;
create table private.president_bootstrap (
 singleton boolean primary key default true check(singleton), user_id uuid not null unique,
 full_name text not null check(length(full_name) between 1 and 160),username text not null check(username ~ '^[a-z0-9._-]{3,40}$'),student_number text not null check(length(student_number) between 3 and 40),created_at timestamptz not null default now()
);
alter table private.president_bootstrap enable row level security;
revoke all on private.president_bootstrap from public,anon,authenticated;
create function public.reserve_president(auth_user_id uuid,official_name text,normalized_username text,official_student_number text) returns void language plpgsql security definer set search_path='' as $$
declare b private.president_bootstrap;
begin
 lock table public.profiles in exclusive mode;
 select * into b from private.president_bootstrap where singleton;
 if found then
  if b.user_id<>auth_user_id or b.full_name<>official_name or b.username<>normalized_username or b.student_number<>official_student_number then raise exception 'Bootstrap already reserved'; end if;
  return;
 end if;
 if exists(select 1 from public.profiles p where not exists(select 1 from private.hosted_test_runs r where r.user_id=p.id and r.retired_at is not null and not p.active)) then raise exception 'Bootstrap requires an empty roster'; end if;
 if exists(select 1 from auth.users where id=auth_user_id) then raise exception 'Bootstrap identity must be new'; end if;
 insert into private.president_bootstrap(user_id,full_name,username,student_number) values(auth_user_id,official_name,normalized_username,official_student_number);
end $$;
create or replace function public.bootstrap_president(auth_user_id uuid,official_name text,normalized_username text,official_student_number text,identity_email text) returns void language plpgsql security definer set search_path='' as $$
declare b private.president_bootstrap;
begin
 lock table public.profiles in exclusive mode;
 select * into b from private.president_bootstrap where singleton;
 if not found then raise exception 'Bootstrap requires an empty roster and a reserved operation'; end if;
 if b.user_id<>auth_user_id or b.full_name<>official_name or b.username<>normalized_username or b.student_number<>official_student_number or identity_email<>auth_user_id::text||'@identity.c-lead.invalid' then raise exception 'Bootstrap mismatch'; end if;
 if exists(select 1 from public.profiles where id=auth_user_id and role='president') then return; end if;
 if exists(select 1 from public.profiles p where not exists(select 1 from private.hosted_test_runs r where r.user_id=p.id and r.retired_at is not null and not p.active)) then raise exception 'Bootstrap requires an empty roster'; end if;
 insert into public.profiles(id,full_name,username,role) values(auth_user_id,official_name,normalized_username,'president');
 insert into private.identities(user_id,internal_email,student_number) values(auth_user_id,identity_email,official_student_number);
 insert into public.audit_logs(actor_id,action,target_type,target_id) values(auth_user_id,'president_bootstrapped','profiles',auth_user_id::text);
end $$;
revoke execute on function public.reserve_president(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.reserve_president(uuid,text,text,text) to service_role;
-- Defense against a delayed external Auth write arriving after a later reset:
-- the username gateway also checks a private SHA-256 fingerprint of the expected
-- HMAC credential. A stale Auth write can cause a retryable failure, never revive
-- an old visible password. No raw visible password or HMAC credential is stored.
alter table private.identities add column password_fingerprint text check(password_fingerprint ~ '^[0-9a-f]{64}$');
create function public.set_password_fingerprint(target_user uuid,fingerprint text,claim uuid,operation_id uuid,operation_kind text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from private.identities where user_id=target_user for update;
 if not exists(select 1 from private.credential_leases where user_id=target_user and token=claim and expires_at>now()) then raise exception 'Credential lease expired'; end if;
 if operation_kind='change' then
  if not exists(select 1 from private.password_changes where id=operation_id and user_id=target_user and completed_at is null) or exists(select 1 from private.account_resets where user_id=target_user and completed_at is null) then raise exception 'Change superseded'; end if;
 elsif operation_kind='reset' then
  if not exists(select 1 from private.account_resets where id=operation_id and user_id=target_user and completed_at is null) then raise exception 'Reset unavailable'; end if;
 else raise exception 'Invalid operation'; end if;
 if fingerprint is null or fingerprint !~ '^[0-9a-f]{64}$' then raise exception 'Invalid fingerprint'; end if;
 update private.identities set password_fingerprint=fingerprint where user_id=target_user;
end $$;
drop function public.resolve_login(text);
create function public.resolve_login(login_username text) returns table(user_id uuid,internal_email text,credential_generation bigint,password_fingerprint text) language sql stable security definer set search_path='' as $$
 select i.user_id,i.internal_email,i.credential_generation,i.password_fingerprint from private.identities i join public.profiles p on p.id=i.user_id where p.username=login_username and p.active and not exists(select 1 from private.password_changes c where c.user_id=p.id and c.completed_at is null) and not exists(select 1 from private.account_resets r where r.user_id=p.id and r.completed_at is null);
$$;
revoke execute on function public.resolve_login(text),public.set_password_fingerprint(uuid,text,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.resolve_login(text),public.set_password_fingerprint(uuid,text,uuid,uuid,text) to service_role;
create function public.admin_revoke_sessions(target_user uuid,revocation_reason text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.require_account_admin();
 if revocation_reason is null or length(btrim(revocation_reason)) not between 3 and 500 then raise exception 'Reason required'; end if;
 perform 1 from private.identities where user_id=target_user for update;
 if not found then raise exception 'Unknown account'; end if;
 update public.app_sessions set revoked_at=now() where user_id=target_user and revoked_at is null;
 update private.identities set credential_generation=credential_generation+1 where user_id=target_user;
 insert into public.audit_logs(actor_id,action,target_type,target_id,reason) values(auth.uid(),'admin_sessions_revoked','profiles',target_user::text,btrim(revocation_reason));
end $$;
revoke execute on function public.admin_revoke_sessions(uuid,text) from public,anon,authenticated;
grant execute on function public.admin_revoke_sessions(uuid,text) to authenticated;
