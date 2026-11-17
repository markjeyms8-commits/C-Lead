-- Service-only fixture ownership ledger. Retain tombstones and all audit referents.
create table private.hosted_test_runs (
 id uuid primary key,
 project_ref text not null check(project_ref ~ '^[a-z]{20}$'),
 user_id uuid not null unique,
 created_at timestamptz not null default now(),
 retired_at timestamptz
);
create unique index one_hosted_test_run on private.hosted_test_runs ((true)) where retired_at is null;
alter table private.hosted_test_runs enable row level security;
revoke all on private.hosted_test_runs from public,anon,authenticated;

create function public.reserve_hosted_test(run_id uuid,target_ref text,test_user uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from auth.users where id=test_user) then raise exception 'Test identity must be new'; end if;
 insert into private.hosted_test_runs(id,project_ref,user_id) values(run_id,target_ref,test_user);
end $$;

create function public.provision_hosted_test(run_id uuid,target_ref text) returns uuid language plpgsql security definer set search_path='' as $$
declare r private.hosted_test_runs; suffix text;
begin
 select * into strict r from private.hosted_test_runs where id=run_id and project_ref=target_ref and retired_at is null for update;
 suffix=replace(r.id::text,'-','');
 insert into public.profiles(id,full_name,username,role) values(r.user_id,'FICTIONAL C-LEAD Disposable Test','test_'||suffix,'student');
 insert into private.identities(user_id,internal_email,student_number) values(r.user_id,suffix||'@identity.c-lead.invalid','TEST-'||suffix);
 insert into public.audit_logs(action,target_type,target_id,metadata) values('hosted_test_created','profiles',r.user_id::text,jsonb_build_object('run_id',r.id));
 return r.user_id;
end $$;

-- First deactivate; the runner then bans this exact Auth UUID before releasing the lock.
create function public.retire_hosted_test(run_id uuid,target_ref text,release_lock boolean default false) returns uuid language plpgsql security definer set search_path='' as $$
declare r private.hosted_test_runs;
begin
 select * into strict r from private.hosted_test_runs where id=run_id and project_ref=target_ref for update;
 if r.retired_at is not null then return r.user_id; end if;
 update public.profiles set active=false where id=r.user_id and active;
 update public.app_sessions set revoked_at=now() where user_id=r.user_id and revoked_at is null;
 if release_lock then
  update private.hosted_test_runs set retired_at=now() where id=r.id;
  insert into public.audit_logs(action,target_type,target_id,metadata) values('hosted_test_retired','profiles',r.user_id::text,jsonb_build_object('run_id',r.id));
 end if;
 return r.user_id;
end $$;
revoke execute on function public.reserve_hosted_test(uuid,text,uuid),public.provision_hosted_test(uuid,text),public.retire_hosted_test(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.reserve_hosted_test(uuid,text,uuid),public.provision_hosted_test(uuid,text),public.retire_hosted_test(uuid,text,boolean) to service_role;
