-- Row-level security for tenant-scoped tables. Not managed by drizzle-kit
-- push (it only diffs table/column shape), so this is applied by hand via
-- `npm run db:rls`. Re-running is safe (CREATE POLICY is guarded by DROP).
--
-- Policies read `app.org_id`, which must be set per-transaction via
-- `select set_config('app.org_id', $orgId, true)` — see src/lib/db/withOrg.ts.
-- If `app.org_id` is unset, `current_setting(..., true)` returns NULL and
-- every row is excluded (fail closed, not fail open).
--
-- FORCE ROW LEVEL SECURITY is required because the app connects as the same
-- role that owns these tables (`pedimentos`), and Postgres exempts table
-- owners from RLS by default — without FORCE, these policies would be a
-- no-op for every query the app actually makes.

do $$
declare
  t text;
begin
  foreach t in array array['pedimentos', 'partidas', 'productos', 'facturas', 'complementos_pago']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format(
      $f$create policy tenant_isolation on %I
         using (org_id = current_setting('app.org_id', true))
         with check (org_id = current_setting('app.org_id', true))$f$,
      t
    );
  end loop;
end $$;
