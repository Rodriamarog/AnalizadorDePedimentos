-- Rounds out the vehiculos registry so a Carta Porte's Autotransporte block
-- can be fully autofilled from a selected vehículo instead of retyped per
-- factura: renames the ambiguous aseguradora/poliza pair to *_carga (there's
-- now a second, resp.-civil pair alongside it) and adds peso bruto vehicular
-- and año modelo, which previously had nowhere to live.
alter table vehiculos rename column aseguradora to aseguradora_carga;
alter table vehiculos rename column poliza to poliza_carga;
alter table vehiculos add column if not exists aseguradora_resp_civil text;
alter table vehiculos add column if not exists poliza_resp_civil text;
alter table vehiculos add column if not exists peso_bruto_vehicular text;
alter table vehiculos add column if not exists anio_modelo_vehiculo text;
