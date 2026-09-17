-- Outbound webhooks for CFDI status changes (#70).
create table if not exists webhook_subscriptions (
  id text primary key,
  org_id text not null references organizations(id),
  url text not null,
  secret text not null,
  created_at timestamptz not null default now()
);

create table if not exists webhook_deliveries (
  id text primary key,
  org_id text not null references organizations(id),
  subscription_id text not null references webhook_subscriptions(id),
  event_type text not null,
  payload jsonb not null,
  status text not null default 'pending',
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  delivered_at timestamptz
);

create index if not exists webhook_subscriptions_org_id_idx on webhook_subscriptions (org_id);
create index if not exists webhook_deliveries_org_id_idx on webhook_deliveries (org_id);
create index if not exists webhook_deliveries_subscription_id_idx on webhook_deliveries (subscription_id);
