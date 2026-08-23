-- Repurpose `plan` to track demo vs. live FacturAPI accounts (issue: demo
-- signup / upgrade-to-live). New orgs default to "demo" and get provisioned
-- with a FacturAPI test key (no real timbrado) until they upgrade.
-- Hand-written, not `db:push`: existing orgs that already have a real key
-- provisioned (or manage their own) must be backfilled as "live", not
-- silently reclassified as demo.
alter table organizations alter column plan set default 'demo';
update organizations set plan = 'live'
  where facturapi_key_encrypted is not null or manual_facturapi_key = true;
