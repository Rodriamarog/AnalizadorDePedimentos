-- CFDI type and related-invoice UUID, needed to create and later distinguish
-- notas de crédito. Hand-written, not `db:push` — same reasoning as
-- 0004_cliente_emails.sql / 0006_inspeccion_fields.sql / 0007_pago_aduana_fields.sql.
alter table facturas add column if not exists cfdi_type text not null default 'I';
alter table facturas add column if not exists related_uuid text;
