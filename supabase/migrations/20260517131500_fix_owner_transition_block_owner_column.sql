create or replace function public.transition_owner_acknowledged(
  p_action_id uuid,
  p_owner_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action public.availability_actions%rowtype;
  v_block record;
  v_meta jsonb;
  v_now timestamptz := now();
begin
  select *
    into v_action
  from public.availability_actions
  where id = p_action_id
  for update;

  if not found then
    raise exception 'Availability action not found' using errcode = 'P0002';
  end if;

  select id, owner_id
    into v_block
  from public.availability_blocks
  where id = v_action.block_id;

  if not found then
    raise exception 'Availability block not found' using errcode = 'P0002';
  end if;

  if v_block.owner_id::text is distinct from p_owner_id::text then
    raise exception 'You do not own this availability action' using errcode = '42501';
  end if;

  v_meta := coalesce(v_action.meta::jsonb, '{}'::jsonb);

  if v_action.owner_status = 'closed' or v_meta ->> 'owner_closed' = 'true' then
    raise exception 'Closed claims cannot move backward' using errcode = '23514';
  end if;

  if v_action.owner_status in ('acknowledged', 'contacted') and v_action.owner_acknowledged_at is not null then
    return jsonb_build_object('ok', true, 'idempotent', true, 'action', to_jsonb(v_action));
  end if;

  v_meta := v_meta || jsonb_build_object(
    'owner_acknowledged', true,
    'owner_acknowledged_at', v_now,
    'owner_acknowledged_by', p_owner_id,
    'owner_action_updated_at', v_now,
    'owner_action_updated_by', p_owner_id
  );

  update public.availability_actions
  set
    owner_status = case when owner_status = 'contacted' then 'contacted' else 'acknowledged' end,
    owner_acknowledged_at = coalesce(owner_acknowledged_at, v_now),
    meta = v_meta
  where id = p_action_id
  returning * into v_action;

  return jsonb_build_object('ok', true, 'idempotent', false, 'action', to_jsonb(v_action));
end;
$$;

create or replace function public.transition_owner_contacted(
  p_action_id uuid,
  p_owner_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action public.availability_actions%rowtype;
  v_block record;
  v_meta jsonb;
  v_now timestamptz := now();
begin
  select *
    into v_action
  from public.availability_actions
  where id = p_action_id
  for update;

  if not found then
    raise exception 'Availability action not found' using errcode = 'P0002';
  end if;

  select id, owner_id
    into v_block
  from public.availability_blocks
  where id = v_action.block_id;

  if not found then
    raise exception 'Availability block not found' using errcode = 'P0002';
  end if;

  if v_block.owner_id::text is distinct from p_owner_id::text then
    raise exception 'You do not own this availability action' using errcode = '42501';
  end if;

  v_meta := coalesce(v_action.meta::jsonb, '{}'::jsonb);

  if v_action.owner_status = 'closed' or v_meta ->> 'owner_closed' = 'true' then
    raise exception 'Closed claims cannot move backward' using errcode = '23514';
  end if;

  if v_action.owner_status = 'contacted' and v_action.owner_contacted_at is not null then
    return jsonb_build_object('ok', true, 'idempotent', true, 'action', to_jsonb(v_action));
  end if;

  v_meta := v_meta || jsonb_build_object(
    'owner_contacted', true,
    'owner_contacted_at', v_now,
    'owner_action_updated_at', v_now,
    'owner_action_updated_by', p_owner_id
  );

  update public.availability_actions
  set
    owner_status = 'contacted',
    owner_contacted_at = coalesce(owner_contacted_at, v_now),
    meta = v_meta
  where id = p_action_id
  returning * into v_action;

  return jsonb_build_object('ok', true, 'idempotent', false, 'action', to_jsonb(v_action));
end;
$$;

create or replace function public.transition_owner_closed(
  p_action_id uuid,
  p_owner_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action public.availability_actions%rowtype;
  v_block record;
  v_meta jsonb;
  v_now timestamptz := now();
begin
  select *
    into v_action
  from public.availability_actions
  where id = p_action_id
  for update;

  if not found then
    raise exception 'Availability action not found' using errcode = 'P0002';
  end if;

  select id, owner_id
    into v_block
  from public.availability_blocks
  where id = v_action.block_id;

  if not found then
    raise exception 'Availability block not found' using errcode = 'P0002';
  end if;

  if v_block.owner_id::text is distinct from p_owner_id::text then
    raise exception 'You do not own this availability action' using errcode = '42501';
  end if;

  v_meta := coalesce(v_action.meta::jsonb, '{}'::jsonb);

  if v_action.owner_status = 'closed' and v_action.owner_closed_at is not null then
    return jsonb_build_object('ok', true, 'idempotent', true, 'action', to_jsonb(v_action));
  end if;

  v_meta := v_meta || jsonb_build_object(
    'owner_closed', true,
    'owner_closed_at', v_now,
    'owner_action_updated_at', v_now,
    'owner_action_updated_by', p_owner_id
  );

  update public.availability_actions
  set
    owner_status = 'closed',
    owner_closed_at = coalesce(owner_closed_at, v_now),
    meta = v_meta
  where id = p_action_id
  returning * into v_action;

  return jsonb_build_object('ok', true, 'idempotent', false, 'action', to_jsonb(v_action));
end;
$$;
