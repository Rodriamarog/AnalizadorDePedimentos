-- "CVE. PEDIMENTO" (SAT c_ClavePedimento, e.g. "C1"/"A1") from the pedimento
-- header — shown on facturas alongside régimen, aduana, fecha. Hand-written,
-- not `db:push` — same reasoning as 0013_pedimento_peso_bruto.sql.
alter table pedimentos add column if not exists cve_pedimento text;
