-- Google-verified address support for direcciones (issue #19). Hand-written,
-- not `db:push` — same reasoning as 0011_direcciones.sql. Nullable: manual
-- free-text direcciones never get a place_id, and that's expected, not an
-- error state (Google's Mexican address coverage has real gaps).
alter table direcciones add column if not exists google_place_id text;
