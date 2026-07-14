-- Per-partida T.C. override (nullable — falls back to pedimentos.tipo_cambio).
-- Hand-written, not `db:push` — same reasoning as 0004_cliente_emails.sql.
alter table partidas add column if not exists tipo_cambio double precision;
