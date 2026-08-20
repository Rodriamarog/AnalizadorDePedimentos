-- Header-level "ED" (Documento digitalizado) identificadores from the
-- pedimento's IDENTIFICADORES block — VUCEM reference numbers of documents
-- annexed to the pedimento. Feeds Carta Porte's DocumentacionAduanera.
-- Hand-written, not `db:push` — same reasoning as 0013_pedimento_peso_bruto.sql.
alter table pedimentos add column if not exists identificadores_doc_aduanero jsonb not null default '[]';
