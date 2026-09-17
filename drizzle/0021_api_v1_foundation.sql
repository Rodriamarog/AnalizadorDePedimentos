-- API v1 foundation (issue #50): api_keys for bearer-token auth (#35) and
-- idempotency_keys for Idempotency-Key dedup (#41). Hand-written, not
-- `db:push` — same reasoning as the other tables in this file set.
create table if not exists api_keys (
  id text primary key,
  org_id text not null references organizations(id),
  key_hash text not null unique,
  mode text not null check (mode in ('test', 'live')),
  label text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create table if not exists idempotency_keys (
  id text primary key,
  org_id text not null references organizations(id),
  key text not null,
  request_hash text not null,
  response_status integer not null,
  response_body jsonb not null,
  created_at timestamptz not null default now(),
  constraint idempotency_keys_org_key_unique unique (org_id, key)
);
