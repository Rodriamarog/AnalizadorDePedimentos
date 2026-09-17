-- Async job tracking for POST /api/v1/pedimentos (#52). Hand-written, not
-- `db:push` — same reasoning as the other tables in this file set.
create table if not exists pedimento_jobs (
  id text primary key,
  org_id text not null references organizations(id),
  status text not null default 'pending' check (status in ('pending', 'processing', 'done', 'failed')),
  source_filename text not null,
  pedimento_id text references pedimentos(id),
  duplicate boolean not null default false,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
