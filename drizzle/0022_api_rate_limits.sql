-- Flat rate limit counters for the v1 API (#51). Hand-written, not
-- `db:push` — same reasoning as the other tables in this file set.
create table if not exists api_rate_limits (
  id text primary key,
  org_id text not null references organizations(id),
  window_start timestamptz not null,
  count integer not null default 0,
  constraint api_rate_limits_org_window_unique unique (org_id, window_start)
);
