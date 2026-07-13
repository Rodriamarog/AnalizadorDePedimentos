-- Extra send-to emails for a cliente, beyond FacturAPI's single Customer.email
-- field. Hand-written (not `db:push`) because `db:push` also tries to diff
-- away the generated `search` tsvector columns from 0002_fts.sql, which
-- aren't tracked in schema.ts — same reasoning as 0001/0002/0003.
create table if not exists cliente_emails (
  id text primary key,
  org_id text not null references organizations(id),
  customer_id text not null,
  email text not null,
  created_at timestamptz not null default now(),
  constraint cliente_emails_org_customer_email_unique unique (org_id, customer_id, email)
);
