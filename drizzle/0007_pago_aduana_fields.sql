-- Fecha de pago and the 3-digit aduana/sección code, needed to show
-- "Pedimento / Fecha / Aduana" on facturas linked to a pedimento. Hand-written,
-- not `db:push` — same reasoning as 0004_cliente_emails.sql / 0006_inspeccion_fields.sql.
alter table pedimentos add column if not exists fecha_pago date;
alter table pedimentos add column if not exists clave_aduana text;
