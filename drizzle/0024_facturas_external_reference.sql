-- #68: caller-supplied trip/operation reference on facturas (and, by
-- extension, cartas porte, which are just facturas with a Carta Porte
-- complement).
alter table facturas add column if not exists external_reference text;
create index if not exists facturas_org_external_reference_idx on facturas (org_id, external_reference);
