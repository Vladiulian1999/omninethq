create table if not exists public.commitment_waitlist (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  business_type text,
  biggest_problem text,
  source text not null default 'commitment_landing',
  created_at timestamptz not null default now()
);

create unique index if not exists commitment_waitlist_email_lower_idx
  on public.commitment_waitlist (lower(email));

alter table public.commitment_waitlist enable row level security;
