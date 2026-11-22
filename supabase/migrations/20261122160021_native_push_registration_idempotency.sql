create or replace function public.register_native_push(device_token text)
returns uuid
language plpgsql security definer set search_path=''
as $$
declare
  result uuid;
  current_session uuid=(auth.jwt()->>'session_id')::uuid;
begin
  if not private.active_session()
    or length(device_token) not between 20 and 4096
    or device_token !~ '^[A-Za-z0-9:_-]+$'
  then raise exception 'Push subscription denied'; end if;

  perform pg_advisory_xact_lock(hashtext(device_token));

  select ps.id into result
    from private.push_subscriptions ps
    where ps.user_id=auth.uid()
      and ps.session_id=current_session
      and ps.provider='fcm'
      and ps.device_token=register_native_push.device_token
      and ps.disabled_at is null
    for update;
  if found then return result; end if;

  if (select count(*) from private.push_subscriptions
      where user_id=auth.uid() and disabled_at is null
        and not (provider='fcm' and private.push_subscriptions.device_token=register_native_push.device_token)) >= 10
  then raise exception 'Ten push devices maximum'; end if;

  update private.push_subscriptions set disabled_at=now()
    where provider='fcm'
      and private.push_subscriptions.device_token=register_native_push.device_token
      and disabled_at is null;
  insert into private.push_subscriptions(user_id,session_id,provider,device_token)
    values(auth.uid(),current_session,'fcm',device_token) returning id into result;
  insert into public.audit_logs(actor_id,action,target_type,target_id)
    values(auth.uid(),'push_enabled','push_subscriptions',result::text);
  return result;
end $$;
