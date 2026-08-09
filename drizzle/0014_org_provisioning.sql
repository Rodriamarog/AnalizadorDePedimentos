-- Schema prefactor for FacturAPI org auto-provisioning (issue #12).
-- Hand-written, not `db:push` — same reasoning as 0005_partida_tipo_cambio.sql:
-- the backfill below is data, not a plain column add.
alter table organizations add column if not exists facturapi_org_id text;
alter table organizations add column if not exists manual_facturapi_key boolean not null default false;
alter table organizations add column if not exists csd_uploaded_at timestamptz;

-- Protect existing manually-managed accounts from being silently
-- reprovisioned once #13/#14 ship: any org that already has a key pasted in
-- is presumed manually managed.
update organizations set manual_facturapi_key = true where facturapi_key_encrypted is not null;
