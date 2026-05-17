# OmniNet Micro-Pilot Support Playbook

Purpose: manual/operator support for small real-world pilots. This is not a dashboard, analytics system, or automation plan. Use these queries from Supabase SQL editor with service/admin access only.

## Support Rules

- Use `public_ref` for customer/public references.
- Treat `availability_actions.id` as internal.
- Do not expose `customer_contact`, owner IDs, Stripe IDs, provider response bodies, or metadata blobs to public users.
- Prefer read-only inspection first.
- Manual recovery should be small, explicit, and recorded in support notes.

## Key Tables

- `availability_actions`: canonical claim/action row.
- `availability_blocks`: owner availability block and capacity.
- `operational_events`: append-only operational diagnostic trail.
- `notification_logs`: notification-specific delivery trail.
- `messages`: tag records.
- `donations`: Stripe donation/payment records.

## Find A Claim By Public Reference

```sql
select
  aa.id as action_id,
  aa.public_ref,
  aa.block_id,
  aa.tag_id,
  aa.status as legacy_status,
  aa.action_status,
  aa.payment_status,
  aa.owner_status,
  aa.quantity,
  aa.created_at,
  aa.payment_confirmed_at,
  aa.owner_acknowledged_at,
  aa.owner_contacted_at,
  aa.owner_closed_at
from availability_actions aa
where aa.public_ref = 'clm_REPLACE_ME';
```

## Inspect Claim With Block And Tag

```sql
select
  aa.id as action_id,
  aa.public_ref,
  aa.action_status,
  aa.payment_status,
  aa.owner_status,
  aa.quantity,
  aa.created_at as claim_created_at,
  ab.id as block_id,
  ab.title as block_title,
  ab.status as block_status,
  ab.action_type,
  ab.capacity_total,
  ab.capacity_remaining,
  ab.start_at,
  ab.end_at,
  m.id as tag_id,
  m.title as tag_title
from availability_actions aa
left join availability_blocks ab on ab.id = aa.block_id
left join messages m on m.id = aa.tag_id
where aa.public_ref = 'clm_REPLACE_ME';
```

## Inspect Operational Events

```sql
select
  created_at,
  event_type,
  success,
  actor_type,
  source,
  correlation_id,
  payload
from operational_events
where public_ref = 'clm_REPLACE_ME'
order by created_at asc;
```

If you only have the internal action id:

```sql
select
  created_at,
  event_type,
  success,
  actor_type,
  source,
  correlation_id,
  payload
from operational_events
where action_id = 'ACTION_UUID_REPLACE_ME'
order by created_at asc;
```

## Inspect Notification Logs

```sql
select
  nl.id,
  nl.created_at,
  nl.type,
  nl.status,
  nl.action_id,
  nl.response
from notification_logs nl
join availability_actions aa on aa.id = nl.action_id
where aa.public_ref = 'clm_REPLACE_ME'
order by nl.created_at desc;
```

Read `response->>'stage'` first. Common stages:

- `before_send`: notification attempt started.
- `resend_send`: provider send attempted.
- `owner_lookup`: owner user lookup failed.
- `owner_email`: owner email missing.
- `load_action`: action lookup failed.
- `load_block`: block lookup failed.
- `catch`: edge function catch path.

## Inspect Payment State

```sql
select
  aa.id as action_id,
  aa.public_ref,
  aa.action_status,
  aa.payment_status,
  aa.status as legacy_status,
  aa.stripe_checkout_session_id,
  aa.stripe_payment_intent_id,
  aa.payment_confirmed_at,
  aa.created_at,
  aa.meta ->> 'checkout_created_at' as checkout_created_at
from availability_actions aa
where aa.public_ref = 'clm_REPLACE_ME';
```

Check Stripe by `stripe_checkout_session_id` or `stripe_payment_intent_id` in the Stripe dashboard. The database is operational truth for OmniNet state, Stripe is payment-provider truth.

## Identify Stale Open Claims

Open claims older than 15 minutes are aging. Open claims older than 1 hour are stale.

```sql
select
  aa.public_ref,
  aa.id as action_id,
  aa.block_id,
  aa.tag_id,
  aa.action_status,
  aa.owner_status,
  aa.created_at,
  now() - aa.created_at as age
from availability_actions aa
where coalesce(aa.owner_status, 'new') not in ('contacted', 'closed')
  and aa.owner_contacted_at is null
  and aa.owner_closed_at is null
  and aa.created_at < now() - interval '15 minutes'
order by aa.created_at asc;
```

## Identify Abandoned Payment Flows

Payment waiting starts at 15 minutes. Payment stale starts at 1 hour.

```sql
select
  aa.public_ref,
  aa.id as action_id,
  aa.block_id,
  aa.tag_id,
  aa.action_status,
  aa.payment_status,
  aa.stripe_checkout_session_id,
  aa.stripe_payment_intent_id,
  aa.created_at,
  now() - aa.created_at as age
from availability_actions aa
where aa.payment_status in ('pending', 'checkout_created')
  and aa.payment_confirmed_at is null
  and aa.stripe_payment_intent_id is null
  and aa.created_at < now() - interval '15 minutes'
order by aa.created_at asc;
```

## Verify Owner Workflow State

```sql
select
  aa.public_ref,
  aa.id as action_id,
  aa.owner_status,
  aa.owner_acknowledged_at,
  aa.owner_contacted_at,
  aa.owner_closed_at,
  aa.meta ->> 'owner_acknowledged' as legacy_owner_acknowledged,
  aa.meta ->> 'owner_contacted' as legacy_owner_contacted,
  aa.meta ->> 'owner_closed' as legacy_owner_closed
from availability_actions aa
where aa.public_ref = 'clm_REPLACE_ME';
```

Owner workflow meaning:

- `new`: no owner action recorded.
- `acknowledged`: owner saw it and intends to handle it.
- `contacted`: owner reached the customer.
- `closed`: no more owner action is needed.

## Retry Notification

Preferred path:

1. Owner opens `/tag/{tag_id}/availability`.
2. Find claim with `NOTIFY FAILED`.
3. Click `Retry notification`.
4. Re-check `notification_logs` and `operational_events`.

Manual inspection after retry:

```sql
select
  oe.created_at,
  oe.event_type,
  oe.success,
  oe.payload
from operational_events oe
join availability_actions aa on aa.id = oe.action_id
where aa.public_ref = 'clm_REPLACE_ME'
  and oe.event_type like 'notification_retry_%'
order by oe.created_at desc;
```

## Manual Recovery Patterns

### Claim exists but owner did not receive email

1. Confirm claim exists by `public_ref`.
2. Check latest `notification_logs`.
3. If status is `failed`, ask owner to retry from availability dashboard.
4. If retry still fails, manually send owner the claim details from trusted admin context only.
5. Do not send customer contact to anyone except the verified owner.

### Customer has proof but owner cannot see claim

1. Query by `public_ref`.
2. Confirm `block_id` and `tag_id`.
3. Check owner dashboard block filters and RLS suspicion.
4. Inspect `operational_events` for `claim_created`.
5. If action exists but block relation is broken, escalate before manual mutation.

### Payment says paid in Stripe but action is unpaid

1. Confirm Stripe checkout session/payment intent in Stripe dashboard.
2. Query `operational_events` for `payment_confirmed` or `payment_confirm_failed`.
3. Query action payment fields.
4. If webhook failed, replay the Stripe webhook event if available.
5. Do not manually set paid unless Stripe truth is verified and the mutation is approved.

### Payment checkout abandoned

1. Verify `payment_status` is `pending` or `checkout_created`.
2. Verify no Stripe payment intent succeeded.
3. Treat as unresolved until pilot policy says whether to expire, close, or contact.
4. Do not restore capacity manually unless the owner confirms the claim should be released.

### Owner clicked wrong workflow button

1. Inspect current owner fields.
2. If accidentally acknowledged/contacted, usually leave it and add support note.
3. If accidentally closed, reopening is not currently a normal flow. Escalate before DB mutation.

## Daily Pilot Checks

```sql
select event_type, success, count(*)
from operational_events
where created_at >= now() - interval '24 hours'
group by event_type, success
order by event_type, success;
```

```sql
select status, count(*)
from notification_logs
where created_at >= now() - interval '24 hours'
group by status
order by status;
```

```sql
select action_status, payment_status, owner_status, count(*)
from availability_actions
where created_at >= now() - interval '24 hours'
group by action_status, payment_status, owner_status
order by count(*) desc;
```

## Escalation Triggers

- Claim created but no `public_ref`.
- Public claim page cannot find a valid `clm_...` reference.
- Duplicate payment confirmation with conflicting Stripe IDs.
- Capacity is negative or visibly inconsistent.
- Owner cannot see claims for a block they own.
- Notification retry repeatedly returns provider failure.
- Payment succeeded in Stripe but `payment_status` remains unpaid after webhook replay.
