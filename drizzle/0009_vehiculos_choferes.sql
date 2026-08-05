-- New Transportistas registries: the business's own fleet and drivers, org-
-- scoped like productos. Hand-written, not `db:push` — same reasoning as
-- 0004_cliente_emails.sql (db:push also tries to diff away the generated
-- search tsvector columns from 0002_fts.sql, which aren't tracked in
-- schema.ts). Editing a row marks it inactive rather than deleting it, so
-- historical Carta Porte invoices that reference a since-retired
-- vehiculo/chofer stay intact (see issue #3/#4).
create table if not exists vehiculos (
  id text primary key,
  org_id text not null references organizations(id),
  placa text not null,
  config_vehicular text,
  permiso_sct text,
  numero_permiso text,
  aseguradora text,
  poliza text,
  remolques jsonb not null default '[]',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists choferes (
  id text primary key,
  org_id text not null references organizations(id),
  nombre text not null,
  rfc text not null,
  numero_licencia text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
