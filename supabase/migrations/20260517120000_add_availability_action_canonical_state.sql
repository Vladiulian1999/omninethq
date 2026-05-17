alter table public.availability_actions
  add column if not exists action_status text,
  add column if not exists payment_status text,
  add column if not exists owner_status text,
  add column if not exists owner_acknowledged_at timestamptz,
  add column if not exists owner_contacted_at timestamptz,
  add column if not exists owner_closed_at timestamptz,
  add column if not exists fulfilled_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists expired_at timestamptz,
  add column if not exists payment_confirmed_at timestamptz;

update public.availability_actions aa
set
  owner_acknowledged_at = coalesce(
    aa.owner_acknowledged_at,
    case
      when aa.meta ->> 'owner_acknowledged_at' ~ '^\d{4}-\d{2}-\d{2}T'
      then (aa.meta ->> 'owner_acknowledged_at')::timestamptz
      when aa.meta ->> 'owner_confirmed_at' ~ '^\d{4}-\d{2}-\d{2}T'
      then (aa.meta ->> 'owner_confirmed_at')::timestamptz
      else null
    end
  ),
  owner_contacted_at = coalesce(
    aa.owner_contacted_at,
    case
      when aa.meta ->> 'owner_contacted_at' ~ '^\d{4}-\d{2}-\d{2}T'
      then (aa.meta ->> 'owner_contacted_at')::timestamptz
      else null
    end
  ),
  owner_closed_at = coalesce(
    aa.owner_closed_at,
    case
      when aa.meta ->> 'owner_closed_at' ~ '^\d{4}-\d{2}-\d{2}T'
      then (aa.meta ->> 'owner_closed_at')::timestamptz
      else null
    end
  ),
  payment_confirmed_at = coalesce(
    aa.payment_confirmed_at,
    case
      when aa.meta ->> 'confirmed_at' ~ '^\d{4}-\d{2}-\d{2}T'
      then (aa.meta ->> 'confirmed_at')::timestamptz
      else null
    end
  ),
  owner_status = coalesce(
    aa.owner_status,
    case
      when lower(coalesce(aa.meta ->> 'owner_closed', '')) = 'true' then 'closed'
      when lower(coalesce(aa.meta ->> 'owner_contacted', '')) = 'true' then 'contacted'
      when lower(coalesce(aa.meta ->> 'owner_acknowledged', '')) = 'true' then 'acknowledged'
      when lower(coalesce(aa.meta ->> 'owner_confirmed', '')) = 'true' then 'acknowledged'
      else 'new'
    end
  );

update public.availability_actions aa
set
  payment_status = coalesce(
    aa.payment_status,
    case
      when aa.stripe_payment_intent_id is not null
        or aa.status = 'confirmed'
        or coalesce(aa.meta ->> 'payment_intent_id', '') <> ''
      then 'paid'
      when aa.stripe_checkout_session_id is not null
        or coalesce(aa.meta ->> 'stripe_session_id', '') <> ''
      then 'checkout_created'
      when b.action_type in ('pay', 'order') then 'pending'
      else 'not_required'
    end
  ),
  action_status = coalesce(
    aa.action_status,
    case
      when aa.status = 'cancelled' then 'cancelled'
      when aa.status = 'expired' then 'expired'
      when aa.stripe_payment_intent_id is not null
        or aa.status = 'confirmed'
        or coalesce(aa.meta ->> 'payment_intent_id', '') <> ''
      then 'confirmed'
      when aa.stripe_checkout_session_id is not null
        or coalesce(aa.meta ->> 'stripe_session_id', '') <> ''
      then 'awaiting_payment'
      when b.action_type in ('pay', 'order') then 'awaiting_payment'
      else 'claimed'
    end
  )
from public.availability_blocks b
where aa.block_id = b.id;

update public.availability_actions
set
  owner_status = coalesce(owner_status, 'new'),
  payment_status = coalesce(payment_status, 'not_required'),
  action_status = coalesce(
    action_status,
    case
      when status = 'confirmed' then 'confirmed'
      when status = 'cancelled' then 'cancelled'
      when status = 'expired' then 'expired'
      else 'claimed'
    end
  )
where action_status is null
   or payment_status is null
   or owner_status is null;
