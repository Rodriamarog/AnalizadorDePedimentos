-- Self-service starting folio for orgs migrating from another invoicing
-- system (#78, #79). Null means "use FacturAPI's normal autoincrement
-- starting at 1".
alter table organizations add column if not exists starting_folio_factura integer;
alter table organizations add column if not exists starting_folio_nota_credito integer;
