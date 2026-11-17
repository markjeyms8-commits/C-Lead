-- Poll ballots are private; anonymous polls never expose voter identities through application RPCs.
create table public.polls(id uuid primary key default gen_random_uuid(),semester_id uuid not null references public.semesters,creator_id uuid not null references public.profiles,question text not null check(length(btrim(question)) between 1 and 500),multiple_choice boolean not null,anonymous boolean not null,deadline timestamptz not null,result_visibility text not null check(result_visibility in ('always','after_vote','after_close')),allow_changes boolean not null,closed_at timestamptz,created_at timestamptz not null default now());
create table public.poll_options(id uuid primary key default gen_random_uuid(),poll_id uuid not null references public.polls,label text not null check(length(btrim(label)) between 1 and 200),position integer not null check(position between 0 and 9),unique(poll_id,position),unique(poll_id,label),unique(poll_id,id));
create table private.poll_ballots(poll_id uuid not null references public.polls,user_id uuid not null references public.profiles,choices uuid[] not null check(cardinality(choices) between 1 and 10),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),primary key(poll_id,user_id));
alter table public.polls enable row level security;
alter table public.poll_options enable row level security;
alter table private.poll_ballots enable row level security;
revoke all on public.polls,public.poll_options,private.poll_ballots from public,anon,authenticated;
grant select on public.polls,public.poll_options to authenticated;
grant all on public.polls,public.poll_options,private.poll_ballots to service_role;
create policy polls_read on public.polls for select to authenticated using(private.active_session());
create policy poll_options_read on public.poll_options for select to authenticated using(private.active_session());
create trigger audit_changes after insert or update or delete on public.polls for each row execute function private.audit_change();
create function public.create_poll(term_id uuid,poll_question text,labels text[],multiple boolean,is_anonymous boolean,closes_at timestamptz,visibility text,can_change boolean) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; label text; i integer=0; recipient uuid;
begin
 if not private.has_role(array['president','vice_president']::public.app_role[]) or not private.term_writable(term_id) or closes_at is null or closes_at<=now() or labels is null or cardinality(labels) not between 2 and 10 or exists(select 1 from unnest(labels) v where v is null or length(btrim(v)) not between 1 and 200) or (select count(distinct lower(btrim(v))) from unnest(labels) v)<>cardinality(labels) then raise exception 'Poll creation denied or invalid'; end if;
 insert into public.polls(semester_id,creator_id,question,multiple_choice,anonymous,deadline,result_visibility,allow_changes)values(term_id,auth.uid(),btrim(poll_question),multiple,is_anonymous,closes_at,visibility,can_change) returning id into result;
 foreach label in array labels loop insert into public.poll_options(poll_id,label,position)values(result,btrim(label),i);i=i+1;end loop;
 for recipient in select id from public.profiles where active loop perform private.notify_recipient(recipient,'polls','New classroom poll','Bagong botohan','A new poll is open for voting.','Bukas na ang bagong botohan.','/polls/'||result);end loop;
 return result;
end $$;
create function public.vote_poll(target_poll uuid,selected_options uuid[]) returns void language plpgsql security definer set search_path='' as $$
declare p public.polls;
begin
 select * into strict p from public.polls where id=target_poll for update;
 if not private.active_session() or not private.term_writable(p.semester_id) or p.closed_at is not null or p.deadline<=now() then raise exception 'Voting closed'; end if;
 if selected_options is null or cardinality(selected_options) not between 1 and 10 or (not p.multiple_choice and cardinality(selected_options)<>1) or cardinality(selected_options)<>(select count(distinct v) from unnest(selected_options) v) or exists(select 1 from unnest(selected_options) v where v is null or not exists(select 1 from public.poll_options o where o.poll_id=p.id and o.id=v)) then raise exception 'Invalid vote';end if;
 if not p.allow_changes and exists(select 1 from private.poll_ballots where poll_id=p.id and user_id=auth.uid()) then raise exception 'Vote changes disabled';end if;
 insert into private.poll_ballots(poll_id,user_id,choices)values(p.id,auth.uid(),selected_options) on conflict(poll_id,user_id) do update set choices=excluded.choices,updated_at=now();
 -- No voter/choice event is copied into public audit records for anonymous voting.
end $$;
create function public.my_poll_vote(target_poll uuid) returns uuid[] language plpgsql security definer set search_path='' as $$
begin if not private.active_session() then raise exception 'Unauthorized';end if;return coalesce((select choices from private.poll_ballots where poll_id=target_poll and user_id=auth.uid()),'{}'::uuid[]);end $$;
create function public.poll_results(target_poll uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.polls; result jsonb;
begin
 if not private.active_session() then raise exception 'Unauthorized';end if;
 select * into strict p from public.polls where id=target_poll;
 if p.result_visibility='after_vote' and not exists(select 1 from private.poll_ballots where poll_id=p.id and user_id=auth.uid()) and p.deadline>now() and p.closed_at is null then raise exception 'Vote before viewing results';end if;
 if p.result_visibility='after_close' and p.deadline>now() and p.closed_at is null then raise exception 'Results are not open';end if;
 select jsonb_build_object('participants',(select count(*) from private.poll_ballots where poll_id=p.id),'options',coalesce(jsonb_agg(jsonb_build_object('id',o.id,'label',o.label,'votes',(select count(*) from private.poll_ballots b where b.poll_id=p.id and o.id=any(b.choices)),'voters',case when p.anonymous then null else (select coalesce(jsonb_agg(jsonb_build_object('id',b.user_id,'name',pr.full_name)),'[]'::jsonb) from private.poll_ballots b join public.profiles pr on pr.id=b.user_id where b.poll_id=p.id and o.id=any(b.choices)) end) order by o.position),'[]'::jsonb)) into result from public.poll_options o where o.poll_id=p.id;
 return result;
end $$;
create function public.close_poll(target_poll uuid,close_reason text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.has_role(array['president','vice_president']::public.app_role[]) or close_reason is null or length(btrim(close_reason)) not between 3 and 500 then raise exception 'Closure denied';end if;
 update public.polls set closed_at=coalesce(closed_at,now()) where id=target_poll;
 if not found then raise exception 'Poll not found';end if;
 insert into public.audit_logs(actor_id,action,target_type,target_id,reason)values(auth.uid(),'poll_closed','polls',target_poll::text,btrim(close_reason));
end $$;
revoke execute on function public.create_poll(uuid,text,text[],boolean,boolean,timestamptz,text,boolean),public.vote_poll(uuid,uuid[]),public.my_poll_vote(uuid),public.poll_results(uuid),public.close_poll(uuid,text) from public,anon,authenticated;
grant execute on function public.create_poll(uuid,text,text[],boolean,boolean,timestamptz,text,boolean),public.vote_poll(uuid,uuid[]),public.my_poll_vote(uuid),public.poll_results(uuid),public.close_poll(uuid,text) to authenticated;
