create or replace function public.transition_payment_confirmed(
  p_action_id uuid,
  p_stripe_checkout_session_id text,
  p_stripe_payment_intent_id text,
  p_confirm_result jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action public.availability_actions%rowtype;
  v_session_id text := nullif(trim(coalesce(p_stripe_checkout_session_id, '')), '');
  v_payment_intent_id text := nullif(trim(coalesce(p_stripe_payment_intent_id, '')), '');
  v_confirm_result jsonb := p_confirm_result;
  v_meta jsonb;
  v_now timestamptz := now();
  v_already_confirmed boolean;
begin
  if v_session_id is null then
    raise exception 'Missing stripe checkout session id' using errcode = '22023';
  end if;

  if v_payment_intent_id is null then
    raise exception 'Missing stripe payment intent id' using errcode = '22023';
  end if;

  select *
    into v_action
  from public.availability_actions
  where id = p_action_id
  for update;

  if not found then
    raise exception 'Availability action not found' using errcode = 'P0002';
  end if;

  if v_action.stripe_checkout_session_id is not null
     and v_action.stripe_checkout_session_id <> v_session_id then
    raise exception 'Availability action has a conflicting checkout session' using errcode = '23505';
  end if;

  if v_action.stripe_payment_intent_id is not null
     and v_action.stripe_payment_intent_id <> v_payment_intent_id then
    raise exception 'Availability action has a conflicting payment intent' using errcode = '23505';
  end if;

  if v_action.action_status in ('cancelled', 'expired') then
    raise exception 'Availability action cannot be confirmed from current state' using errcode = '23514';
  end if;

  v_already_confirmed :=
    v_action.payment_status = 'paid'
    or v_action.action_status = 'confirmed'
    or v_action.status = 'confirmed';

  if not v_already_confirmed then
    select to_jsonb(r)
      into v_confirm_result
    from public.confirm_availability_action(p_action_id) as r;

    if v_confirm_result is null then
      v_confirm_result := '{}'::jsonb;
    end if;
  elsif v_confirm_result is null then
    v_confirm_result := jsonb_build_object('already_confirmed', true);
  end if;

  v_meta := coalesce(v_action.meta::jsonb, '{}'::jsonb) || jsonb_build_object(
    'stripe_session_id', v_session_id,
    'payment_intent_id', v_payment_intent_id,
    'confirmed_at', v_now,
    'confirm_result', v_confirm_result
  );

  update public.availability_actions
  set
    stripe_checkout_session_id = v_session_id,
    stripe_payment_intent_id = v_payment_intent_id,
    status = 'confirmed',
    action_status = 'confirmed',
    payment_status = 'paid',
    payment_confirmed_at = coalesce(payment_confirmed_at, v_now),
    meta = v_meta
  where id = p_action_id
  returning * into v_action;

  return jsonb_build_object(
    'ok', true,
    'idempotent', v_already_confirmed,
    'confirm_result', v_confirm_result,
    'action', to_jsonb(v_action)
  );
end;
$$;
