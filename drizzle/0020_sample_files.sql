-- Client-submitted sample pedimentos/facturas for custom-parser onboarding
-- (issue #32), org-scoped like productos. Hand-written, not `db:push` — same
-- reasoning as 0009_vehiculos_choferes.sql, plus drizzle-kit push doesn't
-- reliably diff the `bytea` customType. One row per file; rows from the same
-- upload submission share a batch_id so batches accumulate and nothing is
-- ever overwritten or deleted by a later upload.
create table if not exists sample_files (
  id text primary key,
  org_id text not null references organizations(id),
  batch_id text not null,
  filename text not null,
  data bytea not null,
  created_at timestamptz not null default now()
);
