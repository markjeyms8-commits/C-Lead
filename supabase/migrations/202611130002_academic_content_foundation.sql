create table public.academic_years (
 id uuid primary key default gen_random_uuid(), name text not null unique check(char_length(name) between 1 and 80),
 starts_on date not null, ends_on date not null, archived_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check(ends_on>starts_on)
);
create table public.semesters (
 id uuid primary key default gen_random_uuid(), academic_year_id uuid not null references public.academic_years(id),
 name text not null check(char_length(name) between 1 and 80), starts_on date not null, ends_on date not null,
 archived_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(academic_year_id,name), check(ends_on>starts_on)
);
create table public.subjects (
 id uuid primary key default gen_random_uuid(), semester_id uuid not null references public.semesters(id),
 code text not null check(char_length(code) between 1 and 30), name text not null check(char_length(name) between 1 and 160),
 archived_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),unique(semester_id,code)
);
create table public.posts (
 id uuid primary key default gen_random_uuid(), semester_id uuid not null references public.semesters(id),
 author_id uuid not null references public.profiles(id), kind text not null check(kind in ('announcement','discussion')),
 title text not null check(char_length(title) between 1 and 160), body jsonb not null default '[]' check(jsonb_typeof(body)='array'),
 state text not null default 'draft' check(state in ('draft','pending','approved','rejected','published','archived')),
 pinned boolean not null default false, publish_at timestamptz, expires_at timestamptz, deleted_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(not pinned or kind='announcement'), check(expires_at is null or (publish_at is not null and expires_at>publish_at)),
 check((kind='announcement' and state in ('draft','published','archived')) or (kind='discussion' and state in ('draft','pending','approved','rejected','archived')))
);
create index posts_feed on public.posts(kind,pinned desc,publish_at desc) where deleted_at is null;
create table public.tasks (
 id uuid primary key default gen_random_uuid(), subject_id uuid not null references public.subjects(id),
 creator_id uuid not null references public.profiles(id), title text not null check(char_length(title) between 1 and 160),
 description text not null default '' check(char_length(description)<=10000), deadline timestamptz not null,
 target_type text not null check(target_type in ('class','group','individual')), deleted_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.task_assignments (
 task_id uuid not null references public.tasks(id), student_id uuid not null references public.profiles(id),
 created_at timestamptz not null default now(), primary key(task_id,student_id)
);
create index task_assignments_student on public.task_assignments(student_id);
create table public.task_completions (
 task_id uuid not null, student_id uuid not null, completed boolean not null default false, updated_at timestamptz not null default now(),
 primary key(task_id,student_id),foreign key(task_id,student_id) references public.task_assignments(task_id,student_id)
);
create table public.notifications (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id),
 category text not null check(category in ('announcements','polls','contributions','discussions','comments','tasks','attendance','attendance_corrections','groups','reactions','mentions','discussion_decisions','security')),
 title text not null check(char_length(title) between 1 and 160), body text not null check(char_length(body)<=1000),
 path text not null check(path ~ '^/[^/]' and path !~ '[\\\r\n]'), read_at timestamptz, created_at timestamptz not null default now()
);
create index notifications_user on public.notifications(user_id,created_at desc);

create function private.term_writable(term_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.semesters s join public.academic_years y on y.id=s.academic_year_id where s.id=term_id and s.archived_at is null and y.archived_at is null);
$$;
create function private.year_writable(year_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.academic_years where id=year_id and archived_at is null);
$$;
create function private.academic_consistency() returns trigger language plpgsql set search_path='' as $$
 declare start_date date; end_date date;
 begin
 if TG_TABLE_NAME='semesters' then
 select starts_on,ends_on into start_date,end_date from public.academic_years where id=new.academic_year_id;
 if new.starts_on<start_date or new.ends_on>end_date then raise exception 'Semester must be within academic year'; end if;
 elsif exists(select 1 from public.semesters where academic_year_id=new.id and (starts_on<new.starts_on or ends_on>new.ends_on)) then raise exception 'Year dates must contain semesters';
 end if; return new;
 end $$;
create trigger year_consistency before insert or update on public.academic_years for each row execute function private.academic_consistency();
create trigger semester_consistency before insert or update on public.semesters for each row execute function private.academic_consistency();
do $$ declare tab text; begin
 foreach tab in array array['academic_years','semesters','subjects','posts','tasks','task_assignments','task_completions','notifications'] loop
 execute format('alter table public.%I enable row level security',tab);
 execute format('revoke all on public.%I from anon,authenticated',tab);
 execute format('grant select on public.%I to authenticated',tab);
 execute format('grant all on public.%I to service_role',tab);
 end loop;
 foreach tab in array array['academic_years','semesters','subjects','posts','tasks'] loop
 execute format('create trigger touch_updated before update on public.%I for each row execute function private.touch_updated()',tab);
 execute format('create trigger audit_changes after insert or update or delete on public.%I for each row execute function private.audit_change()',tab);
 end loop;
end $$;
create policy years_read on public.academic_years for select to authenticated using(private.active_session());
create policy semesters_read on public.semesters for select to authenticated using(private.active_session());
create policy subjects_read on public.subjects for select to authenticated using(private.active_session());
create policy years_insert on public.academic_years for insert to authenticated with check(private.has_role(array['president','vice_president','secretary']::public.app_role[]));
create policy years_update on public.academic_years for update to authenticated using(private.has_role(array['president','vice_president','secretary']::public.app_role[]) and archived_at is null) with check(private.has_role(array['president','vice_president','secretary']::public.app_role[]));
create policy semesters_insert on public.semesters for insert to authenticated with check(private.has_role(array['president','vice_president','secretary']::public.app_role[]) and private.year_writable(academic_year_id));
create policy semesters_update on public.semesters for update to authenticated using(private.has_role(array['president','vice_president','secretary']::public.app_role[]) and archived_at is null and private.year_writable(academic_year_id)) with check(private.has_role(array['president','vice_president','secretary']::public.app_role[]) and private.year_writable(academic_year_id));
create policy subjects_insert on public.subjects for insert to authenticated with check(private.has_role(array['president','vice_president','secretary']::public.app_role[]) and private.term_writable(semester_id));
create policy subjects_update on public.subjects for update to authenticated using(private.has_role(array['president','vice_president','secretary']::public.app_role[]) and archived_at is null and private.term_writable(semester_id)) with check(private.has_role(array['president','vice_president','secretary']::public.app_role[]) and private.term_writable(semester_id));
grant insert,update on public.academic_years,public.semesters,public.subjects to authenticated;
create policy posts_read on public.posts for select to authenticated using(private.active_session() and deleted_at is null and (author_id=auth.uid() or private.has_role(array['president','vice_president']::public.app_role[]) or ((kind='announcement' and state='published' or kind='discussion' and state='approved') and publish_at<=now() and (expires_at is null or expires_at>now()))));
create policy assignments_read on public.task_assignments for select to authenticated using(private.active_session() and (student_id=auth.uid() or private.has_role(array['president','vice_president','secretary']::public.app_role[])));
create policy tasks_read on public.tasks for select to authenticated using(private.active_session() and deleted_at is null and (private.has_role(array['president','vice_president','secretary']::public.app_role[]) or exists(select 1 from public.task_assignments a where a.task_id=tasks.id and a.student_id=auth.uid())));
create policy completions_read on public.task_completions for select to authenticated using(private.active_session() and (student_id=auth.uid() or private.has_role(array['president','vice_president','secretary']::public.app_role[])));
create policy notifications_read on public.notifications for select to authenticated using(private.active_session() and user_id=auth.uid());
create policy notifications_update on public.notifications for update to authenticated using(private.active_session() and user_id=auth.uid()) with check(private.active_session() and user_id=auth.uid());
grant update(read_at) on public.notifications to authenticated;
revoke execute on function private.term_writable(uuid),private.year_writable(uuid),private.academic_consistency() from public,anon,authenticated;
grant execute on function private.term_writable(uuid),private.year_writable(uuid) to authenticated;
-- Storage is private and closed until attachment-parent authorization is implemented.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('attachments','attachments',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.presentationml.presentation','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);
-- No storage.objects policies are granted in this foundation.
