-- Shipment-level total weight in kg, from the pedimento header's "PESO
-- BRUTO". Hand-written, not `db:push` — same reasoning as
-- 0005_partida_tipo_cambio.sql.
alter table pedimentos add column if not exists peso_bruto double precision;
