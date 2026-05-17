create table if not exists public.operational_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  action_id uuid null references public.availability_actions(id),
  public_ref text null,
  event_type text not null,
  actor_type text null,
  actor_id uuid null,
  source text null,
  success boolean not null default true,
  correlation_id text null,
  payload jsonb not null default '{}'::jsonb
);

create index if not exists operational_events_action_id_created_at_idx
  on public.operational_events (action_id, created_at desc);

create index if not exists operational_events_public_ref_created_at_idx
  on public.operational_events (public_ref, created_at desc);

create index if not exists operational_events_event_type_created_at_idx
  on public.operational_events (event_type, created_at desc);

create index if not exists operational_events_correlation_id_created_at_idx
  on public.operational_events (correlation_id, created_at desc);

alter table public.operational_events enable row level security;
