-- The `pedimentos` role (POSTGRES_USER from docker-compose) is a
-- superuser, and superusers always bypass RLS — FORCE ROW LEVEL SECURITY
-- has no effect on them. The app must connect as a separate, non-superuser
-- role so RLS policies are actually enforced.
do $$
begin
  if not exists (select from pg_roles where rolname = 'app_user') then
    create role app_user login password 'app_user_dev_password' nosuperuser nobypassrls;
  end if;
end $$;

grant usage on schema public to app_user;
grant select, insert, update, delete on
  organizations, pedimentos, partidas, productos, facturas, complementos_pago,
  sat_claves, sat_unidades
  to app_user;
