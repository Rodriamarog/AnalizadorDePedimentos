-- Per-partida weight in kg, derived from the pedimento's UMT (unidad de
-- tarifa) columns. Hand-written, not `db:push` — same reasoning as
-- 0005_partida_tipo_cambio.sql.
alter table partidas add column if not exists peso_kg double precision;
