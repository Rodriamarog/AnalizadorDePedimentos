-- Permanent Origen/Destino classification for direcciones (issue #21).
-- Hand-written, not `db:push` — same reasoning as 0011_direcciones.sql.
-- Backfills existing rows to 'origen' rather than forcing reclassification;
-- users can re-edit any that should actually be Destino addresses.
alter table direcciones add column if not exists tipo text;
update direcciones set tipo = 'origen' where tipo is null;
alter table direcciones alter column tipo set not null;
