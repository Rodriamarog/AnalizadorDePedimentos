-- Fields needed to auto-fill the "Solicitud de Servicios de Inspección" (NOM)
-- docx per partida. Hand-written, not `db:push` — same reasoning as
-- 0004_cliente_emails.sql / 0005_partida_tipo_cambio.sql.
alter table pedimentos add column if not exists rfc text;
alter table pedimentos add column if not exists domicilio_fiscal text;
alter table pedimentos add column if not exists regimen text;
alter table pedimentos add column if not exists factura_numero text;
alter table pedimentos add column if not exists fecha_pedimento date;
alter table pedimentos add column if not exists fecha_entrada date;

alter table partidas add column if not exists subd text;
alter table partidas add column if not exists marca text;
alter table partidas add column if not exists pais_origen text;
alter table partidas add column if not exists nom_clave text;
