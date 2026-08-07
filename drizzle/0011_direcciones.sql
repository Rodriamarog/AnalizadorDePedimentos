-- Frequently-used Origen/Destino addresses for Carta Porte, org-scoped like
-- vehiculos/choferes (0009_vehiculos_choferes.sql). Hand-written, not
-- `db:push` — same reasoning as that migration. Editing a row marks it
-- inactive rather than deleting it, so historical Carta Porte invoices that
-- reference a since-removed address stay intact.
create table if not exists direcciones (
  id text primary key,
  org_id text not null references organizations(id),
  etiqueta text not null,
  rfc text not null,
  nombre text,
  calle text,
  numero_exterior text,
  numero_interior text,
  colonia text,
  municipio text,
  localidad text,
  estado text,
  pais text,
  codigo_postal text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
