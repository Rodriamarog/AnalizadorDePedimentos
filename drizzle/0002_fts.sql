-- Full-text search for the global SAT catalogs, replacing the old SQLite
-- FTS5 virtual tables. Generated tsvector column + GIN index per table.
alter table sat_claves add column if not exists search tsvector
  generated always as (to_tsvector('spanish', coalesce(description, '') || ' ' || key)) stored;
create index if not exists sat_claves_search_idx on sat_claves using gin (search);

alter table sat_unidades add column if not exists search tsvector
  generated always as (to_tsvector('spanish', coalesce(description, '') || ' ' || key)) stored;
create index if not exists sat_unidades_search_idx on sat_unidades using gin (search);
