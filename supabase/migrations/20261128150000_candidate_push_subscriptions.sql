create table if not exists public.candidate_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  festival_id uuid null,
  candidate_slug text not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_candidate_push_subscriptions_slug
  on public.candidate_push_subscriptions (candidate_slug);

create index if not exists idx_candidate_push_subscriptions_tenant_slug
  on public.candidate_push_subscriptions (tenant_id, candidate_slug);

alter table public.candidate_push_subscriptions enable row level security;
