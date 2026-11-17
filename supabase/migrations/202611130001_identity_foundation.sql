-- Identity and session foundation. No student seeds and no client role mutation.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create type public.app_role as enum ('president','vice_president','secretary','treasurer','student');
create table public.profiles (
 id uuid primary key references auth.users(id),
 full_name text not null check (char_length(full_name) between 1 and 160),
 username text not null unique check (username ~ '^[a-z0-9._-]{3,40}$'),
 role public.app_role not null default 'student', active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index one_president on public.profiles(role) where role = 'president';
create table private.identities (
 user_id uuid primary key references public.profiles(id),
 internal_email text not null unique,
 student_number text not null unique check (char_length(student_number) between 3 and 40)
);
create table public.app_sessions (
 id uuid primary key references auth.sessions(id) on delete cascade,
 user_id uuid not null references public.profiles(id),
 created_at timestamptz not null default now(), revoked_at timestamptz,
 device_label text not null default 'Browser' check (char_length(device_label) <= 120)
);
create index app_sessions_user on public.app_sessions(user_id);
create table private.login_attempts (
 username text primary key, failures integer not null default 0 check(failures between 0 and 5),
 locked_until timestamptz, lease uuid, lease_until timestamptz,
 updated_at timestamptz not null default now()
);
create table public.policy_acceptances (
 user_id uuid not null references public.profiles(id), policy text not null check(policy in ('privacy','community')),
 version text not null, accepted_at timestamptz not null default now(), primary key(user_id,policy,version)
);
create table public.preferences (
 user_id uuid primary key references public.profiles(id),
 language text not null default 'en' check(language in ('en','fil')),
 theme text not null default 'light' check(theme in ('light','dark')),
 updated_at timestamptz not null default now()
);
create table public.audit_logs (
 id bigint generated always as identity primary key, actor_id uuid references public.profiles(id),
 action text not null, target_type text not null, target_id text, old_values jsonb, new_values jsonb,
 reason text, metadata jsonb not null default '{}', created_at timestamptz not null default now()
);
create index audit_created on public.audit_logs(created_at desc);

create function private.active_session() returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.profiles p join public.app_sessions s on s.user_id=p.id
 join auth.sessions a on a.id=s.id and a.user_id=p.id
 where p.id=auth.uid() and p.active and s.revoked_at is null and s.id::text=auth.jwt()->>'session_id');
$$;
create function private.has_role(roles public.app_role[]) returns boolean language sql stable security definer set search_path = '' as $$
 select private.active_session() and exists(select 1 from public.profiles where id=auth.uid() and role=any(roles));
$$;
create function public.is_active_session() returns boolean language sql stable security definer set search_path='' as $$ select private.active_session(); $$;
create function private.touch_updated() returns trigger language plpgsql set search_path='' as $$ begin new.updated_at=now(); return new; end $$;
create trigger profiles_updated before update on public.profiles for each row execute function private.touch_updated();
create trigger preferences_updated before update on public.preferences for each row execute function private.touch_updated();
create function private.audit_change() returns trigger language plpgsql security definer set search_path='' as $$
 declare old_row jsonb; new_row jsonb;
 begin
 if TG_OP <> 'INSERT' then old_row=to_jsonb(old); end if;
 if TG_OP <> 'DELETE' then new_row=to_jsonb(new); end if;
 insert into public.audit_logs(actor_id,action,target_type,target_id,old_values,new_values)
 values(auth.uid(),lower(TG_OP),TG_TABLE_NAME,coalesce(new_row->>'id',old_row->>'id'),old_row,new_row);
 return coalesce(new,old);
 end $$;
create trigger profiles_audit after insert or update or delete on public.profiles for each row execute function private.audit_change();
create function private.audit_immutable() returns trigger language plpgsql set search_path='' as $$ begin raise exception 'Audit logs are append-only'; end $$;
create trigger audit_immutable before update or delete on public.audit_logs for each row execute function private.audit_immutable();

alter table public.profiles enable row level security;
alter table public.app_sessions enable row level security;
alter table public.policy_acceptances enable row level security;
alter table public.preferences enable row level security;
alter table public.audit_logs enable row level security;
alter table private.identities enable row level security;
alter table private.login_attempts enable row level security;
create policy roster_read on public.profiles for select to authenticated using(private.active_session() and (active or private.has_role(array['president','vice_president']::public.app_role[])));
create policy session_read on public.app_sessions for select to authenticated using(private.active_session() and (user_id=auth.uid() or private.has_role(array['president','vice_president']::public.app_role[])));
create policy policy_read on public.policy_acceptances for select to authenticated using(private.active_session() and user_id=auth.uid());
create policy preferences_read on public.preferences for select to authenticated using(private.active_session() and user_id=auth.uid());
create policy preferences_update on public.preferences for update to authenticated using(private.active_session() and user_id=auth.uid()) with check(private.active_session() and user_id=auth.uid());
create policy audit_read on public.audit_logs for select to authenticated using(private.has_role(array['president','vice_president']::public.app_role[]));

create function public.student_number_for(student_id uuid) returns text language plpgsql stable security definer set search_path='' as $$
 declare value text;
 begin
 if not private.active_session() then raise exception 'Unauthorized'; end if;
 select student_number into value from private.identities where user_id=student_id;
 if student_id=auth.uid() or private.has_role(array['president','vice_president']::public.app_role[]) then return value; end if;
 return case when value is null then null else '••••' || right(value,2) end;
 end $$;
create function public.complete_onboarding(chosen_language text, chosen_theme text) returns void language plpgsql security definer set search_path='' as $$
 begin
 if not private.active_session() then raise exception 'Unauthorized'; end if;
 insert into public.policy_acceptances(user_id,policy,version) values(auth.uid(),'privacy','1.0'),(auth.uid(),'community','1.0') on conflict do nothing;
 insert into public.preferences(user_id,language,theme) values(auth.uid(),chosen_language,chosen_theme)
 on conflict(user_id) do update set language=excluded.language,theme=excluded.theme;
 end $$;
create function public.revoke_current_session() returns void language plpgsql security definer set search_path='' as $$
 begin
 if not private.active_session() then raise exception 'Unauthorized'; end if;
 update public.app_sessions set revoked_at=now() where id::text=auth.jwt()->>'session_id' and user_id=auth.uid();
 insert into public.audit_logs(actor_id,action,target_type,target_id) values(auth.uid(),'session_revoked','app_sessions',auth.jwt()->>'session_id');
 end $$;

-- A lease serializes attempts per normalized username; crashes count as failures.
create function public.begin_login(login_username text) returns uuid language plpgsql security definer set search_path='' as $$
 declare attempt private.login_attempts; token uuid;
 begin
 if login_username !~ '^[a-z0-9._-]{3,40}$' then return null; end if;
 insert into private.login_attempts(username) values(login_username) on conflict do nothing;
 select * into attempt from private.login_attempts where username=login_username for update;
 if attempt.locked_until>now() or attempt.lease_until>now() then return null; end if;
 if attempt.locked_until is not null and attempt.locked_until<=now() then attempt.failures=0; end if;
 token=gen_random_uuid();
 update private.login_attempts set failures=attempt.failures+1, lease=token, lease_until=now()+interval '30 seconds',
 locked_until=case when attempt.failures+1>=5 then now()+interval '15 minutes' else null end, updated_at=now() where username=login_username;
 return token;
 end $$;
create function public.resolve_login(login_username text) returns table(user_id uuid, internal_email text) language sql stable security definer set search_path='' as $$
 select i.user_id,i.internal_email from private.identities i join public.profiles p on p.id=i.user_id where p.username=login_username and p.active;
$$;
create function public.finish_login(login_username text, lease_token uuid, successful boolean) returns boolean language plpgsql security definer set search_path='' as $$
 begin
 update private.login_attempts set failures=case when successful then 0 else failures end,
 locked_until=case when successful then null else locked_until end, lease=null, lease_until=null
 where username=login_username and lease=lease_token and lease_until>now();
 return found;
 end $$;

revoke all on all tables in schema public from anon, authenticated;
grant select on public.profiles,public.app_sessions,public.policy_acceptances,public.preferences,public.audit_logs to authenticated;
grant update(language,theme) on public.preferences to authenticated;
revoke execute on all functions in schema public from public,anon,authenticated;
revoke execute on all functions in schema private from public,anon,authenticated;
grant usage on schema private to authenticated;
grant execute on function private.active_session(),private.has_role(public.app_role[]) to authenticated;
grant execute on function public.is_active_session(),public.student_number_for(uuid),public.complete_onboarding(text,text),public.revoke_current_session() to authenticated;
grant execute on function public.begin_login(text),public.resolve_login(text),public.finish_login(text,uuid,boolean) to service_role;
grant all on all tables in schema public to service_role;
grant usage,select on all sequences in schema public to service_role;
