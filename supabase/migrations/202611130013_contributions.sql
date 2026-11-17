create table public.contributions(id uuid primary key default gen_random_uuid(),semester_id uuid not null references public.semesters,creator_id uuid not null references public.profiles,title text not null check(length(btrim(title)) between 1 and 160),purpose text not null check(length(btrim(purpose)) between 1 and 5000),amount_cent integer not null check(amount_cent between 1 and 100000000),deadline timestamptz not null,status text not null default 'active' check(status in ('active','archived')),last_reminded_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table public.contribution_records(id uuid primary key default gen_random_uuid(),contribution_id uuid not null references public.contributions,student_id uuid not null references public.profiles,status text not null default 'unpaid' check(status in ('paid','unpaid')),updated_at timestamptz not null default now(),updated_by uuid references public.profiles,unique(contribution_id,student_id));
create function private.finance_manager() returns boolean language sql stable security definer set search_path='' as $$select private.has_role(array['president','vice_president','treasurer']::public.app_role[])$$;
create function private.contribution_readable(target_contribution uuid) returns boolean language sql stable security definer set search_path='' as $$select private.active_session() and (private.finance_manager() or exists(select 1 from public.contribution_records r where r.contribution_id=target_contribution and r.student_id=auth.uid()))$$;
create function private.contribution_writable(target_contribution uuid) returns boolean language sql stable security definer set search_path='' as $$select private.finance_manager() and exists(select 1 from public.contributions c where c.id=target_contribution and c.status='active' and private.term_writable(c.semester_id))$$;
do $$declare tab text;begin foreach tab in array array['contributions','contribution_records']loop execute format('alter table public.%I enable row level security',tab);execute format('revoke all on public.%I from public,anon,authenticated',tab);execute format('grant select on public.%I to authenticated',tab);execute format('grant all on public.%I to service_role',tab);execute format('create trigger audit_changes after insert or update or delete on public.%I for each row execute function private.audit_change()',tab);end loop;end $$;
create policy contributions_read on public.contributions for select to authenticated using(private.contribution_readable(id));
create policy contribution_records_read on public.contribution_records for select to authenticated using(private.active_session() and (student_id=auth.uid() or private.finance_manager()));
create function public.save_contribution(target_contribution uuid,term_id uuid,contribution_title text,contribution_purpose text,required_cent integer,due_at timestamptz,change_reason text default null) returns uuid language plpgsql security definer set search_path='' as $$
declare c public.contributions;result uuid;person uuid;
begin
 if not private.finance_manager() or not private.term_writable(term_id) or due_at is null or due_at<=now() then raise exception 'Contribution denied or invalid';end if;
 if target_contribution is null then
  insert into public.contributions(semester_id,creator_id,title,purpose,amount_cent,deadline)values(term_id,auth.uid(),btrim(contribution_title),btrim(contribution_purpose),required_cent,due_at)returning id into result;
  for person in select id from public.profiles where active loop
   insert into public.contribution_records(contribution_id,student_id)values(result,person);
   perform private.notify_recipient(person,'contributions','New contribution','Bagong kontribusyon','Review the amount, purpose and deadline.','Tingnan ang halaga, layunin at takdang oras.','/contributions/'||result);
  end loop;
 else
  select * into strict c from public.contributions where id=target_contribution for update;
  if not private.contribution_writable(c.id) or c.semester_id<>term_id or change_reason is null or length(btrim(change_reason)) not between 3 and 500 then raise exception 'Contribution edit denied';end if;
  if c.amount_cent<>required_cent and exists(select 1 from public.contribution_records where contribution_id=c.id and status='paid') then raise exception 'Amount is locked after payment';end if;
  result=c.id;
  update public.contributions set title=btrim(contribution_title),purpose=btrim(contribution_purpose),amount_cent=required_cent,deadline=due_at,updated_at=now() where id=c.id;
 end if;
 insert into public.audit_logs(actor_id,action,target_type,target_id,reason)values(auth.uid(),case when target_contribution is null then 'contribution_created' else 'contribution_updated' end,'contributions',result::text,change_reason);
 return result;
end $$;
create function public.mark_contribution(target_record uuid,new_status text,change_reason text) returns void language plpgsql security definer set search_path='' as $$
declare r public.contribution_records;c public.contributions;
begin
 if not private.finance_manager() or new_status not in ('paid','unpaid') or change_reason is null or length(btrim(change_reason)) not between 3 and 500 then raise exception 'Payment update denied';end if;
 select c0.* into strict c from public.contributions c0 join public.contribution_records r0 on r0.contribution_id=c0.id where r0.id=target_record for update of c0;
 select * into strict r from public.contribution_records where id=target_record for update;
 if not private.contribution_writable(c.id) then raise exception 'Contribution archived';end if;
 update public.contribution_records set status=new_status,updated_at=now(),updated_by=auth.uid() where id=r.id;
 insert into public.audit_logs(actor_id,action,target_type,target_id,reason,metadata)values(auth.uid(),'payment_status_changed','contribution_records',r.id::text,btrim(change_reason),jsonb_build_object('before',r.status,'after',new_status));
 perform private.notify_recipient(r.student_id,'contributions','Payment status updated','Na-update ang bayad','An authorized officer updated your contribution status.','Na-update ng awtorisadong opisyal ang status ng iyong kontribusyon.','/contributions/'||c.id);
end $$;
create function public.contribution_summary(target_contribution uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.contributions;total bigint;paid bigint;
begin
 if not private.contribution_readable(target_contribution) then raise exception 'Contribution unavailable';end if;
 select * into strict c from public.contributions where id=target_contribution;
 select count(*),count(*)filter(where status='paid') into total,paid from public.contribution_records where contribution_id=c.id;
 return jsonb_build_object('members',total,'paid_count',paid,'target_cent',total*c.amount_cent,'collected_cent',paid*c.amount_cent,'outstanding_cent',(total-paid)*c.amount_cent);
end $$;
create function public.remind_contribution(target_contribution uuid,reminder_reason text) returns integer language plpgsql security definer set search_path='' as $$
declare c public.contributions;person uuid;recipients integer=0;
begin
 select * into strict c from public.contributions where id=target_contribution for update;
 if not private.contribution_writable(c.id) or reminder_reason is null or length(btrim(reminder_reason)) not between 3 and 500 then raise exception 'Reminder denied';end if;
 if c.last_reminded_at>now()-interval '24 hours' then raise exception 'Wait 24 hours before reminding again';end if;
 for person in select r.student_id from public.contribution_records r join public.profiles p on p.id=r.student_id where r.contribution_id=c.id and r.status='unpaid' and p.active loop
  perform private.notify_recipient(person,'contributions','Contribution reminder','Paalala sa kontribusyon','Review your unpaid contribution and deadline.','Tingnan ang hindi pa nababayarang kontribusyon at takdang oras.','/contributions/'||c.id);recipients=recipients+1;
 end loop;
 update public.contributions set last_reminded_at=now() where id=c.id;
 insert into public.audit_logs(actor_id,action,target_type,target_id,reason,metadata)values(auth.uid(),'contribution_reminded','contributions',c.id::text,btrim(reminder_reason),jsonb_build_object('eligible_recipients',recipients));return recipients;
end $$;
create function public.archive_contribution(target_contribution uuid,archive_reason text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.contribution_writable(target_contribution) or archive_reason is null or length(btrim(archive_reason)) not between 3 and 500 then raise exception 'Archive denied';end if;
 update public.contributions set status='archived',updated_at=now() where id=target_contribution;
 insert into public.audit_logs(actor_id,action,target_type,target_id,reason)values(auth.uid(),'contribution_archived','contributions',target_contribution::text,btrim(archive_reason));
end $$;
revoke execute on function private.finance_manager(),private.contribution_readable(uuid),private.contribution_writable(uuid),public.save_contribution(uuid,uuid,text,text,integer,timestamptz,text),public.mark_contribution(uuid,text,text),public.contribution_summary(uuid),public.remind_contribution(uuid,text),public.archive_contribution(uuid,text) from public,anon,authenticated;
grant execute on function private.finance_manager(),private.contribution_readable(uuid) to authenticated;
grant execute on function public.save_contribution(uuid,uuid,text,text,integer,timestamptz,text),public.mark_contribution(uuid,text,text),public.contribution_summary(uuid),public.remind_contribution(uuid,text),public.archive_contribution(uuid,text) to authenticated;
