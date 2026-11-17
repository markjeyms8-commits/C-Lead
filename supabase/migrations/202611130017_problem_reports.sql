create table public.problem_reports(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles,description text not null check(length(btrim(description)) between 10 and 2000),route text not null check(route ~ '^/[a-zA-Z0-9/_-]*$' and length(route)<=160),app_version text not null check(length(app_version)<=40),device_type text not null check(device_type in ('mobile','desktop')),browser_type text not null check(browser_type in ('Chrome','Edge','Firefox','Safari','Other')),created_at timestamptz not null default now(),resolved_at timestamptz,resolved_by uuid references public.profiles,resolution text check(length(btrim(resolution)) between 3 and 500));
alter table public.problem_reports enable row level security;
revoke all on public.problem_reports from public,anon,authenticated;
grant select on public.problem_reports to authenticated;grant all on public.problem_reports to service_role;
create policy problem_reports_read on public.problem_reports for select to authenticated using(private.active_session() and(user_id=auth.uid() or private.has_role(array['president','vice_president']::public.app_role[])));
create function public.report_problem(problem_description text,problem_route text,version text,device text,browser text)returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if not private.active_session() then raise exception 'Session required';end if;
 perform pg_advisory_xact_lock(hashtext('problem:'||auth.uid()::text));
 if(select count(*)from public.problem_reports where user_id=auth.uid() and created_at>now()-interval '1 hour')>=3 then raise exception 'Report limit reached';end if;
 if problem_description ~* '(bearer[[:space:]]|eyJ[A-Za-z0-9_-]{10}|[0-9]{7,}|(password|student.?number|token)[[:space:]]*[:=])' then raise exception 'Remove sensitive values';end if;
 insert into public.problem_reports(user_id,description,route,app_version,device_type,browser_type)values(auth.uid(),btrim(problem_description),problem_route,version,device,browser)returning id into result;
 insert into public.audit_logs(actor_id,action,target_type,target_id)values(auth.uid(),'problem_reported','problem_reports',result::text);return result;
end $$;
create function public.resolve_problem(target_report uuid,resolution_reason text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.has_role(array['president','vice_president']::public.app_role[]) or resolution_reason is null or length(btrim(resolution_reason))not between 3 and 500 then raise exception 'Resolution denied';end if;
 update public.problem_reports set resolved_at=now(),resolved_by=auth.uid(),resolution=btrim(resolution_reason)where id=target_report and resolved_at is null;if not found then raise exception 'Report unavailable';end if;
 insert into public.audit_logs(actor_id,action,target_type,target_id,reason)values(auth.uid(),'problem_resolved','problem_reports',target_report::text,btrim(resolution_reason));
end $$;
revoke execute on function public.report_problem(text,text,text,text,text),public.resolve_problem(uuid,text) from public,anon,authenticated;
grant execute on function public.report_problem(text,text,text,text,text),public.resolve_problem(uuid,text) to authenticated;
