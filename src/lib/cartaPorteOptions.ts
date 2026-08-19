// Small, finite SAT catálogos used by the Carta Porte section of the
// "Crear factura" dialog — same `[code, label] as const` tuple-array
// convention as USO_CFDI_OPTIONS/PAYMENT_FORM_OPTIONS in
// factura-form.tsx. Unlike c_ClaveProdServ/c_ClaveUnidad (thousands
// of entries, backed by sat_claves/sat_unidades + full-text search), these
// catálogos are small enough to hardcode as plain <select> options.

export const PERMISO_SCT_OPTIONS = [
  ["TPAF01", "Autotransporte Federal de Carga General"],
  ["TPAF02", "Transporte Privado de Carga"],
  ["TPAF03", "Autotransporte Federal de Carga Especializada de Materiales y Residuos Peligrosos"],
  ["TPAF04", "Transporte Privado de Materiales y Residuos Peligrosos"],
  ["TPAF05", "Autotransporte Federal de Carga de Gran Peso y/o Volumen de Extraordinarias Dimensiones"],
  ["TPAF06", "Transporte Privado de Carga de Gran Peso y/o Volumen de Extraordinarias Dimensiones"],
  ["TPAF07", "Servicio Auxiliar de Arrastre y/o Salvamento y Depósito de Vehículos en las Vías Generales de Comunicación"],
  ["TPAF08", "Servicio Auxiliar de Arrastre en Patios y Corralones de las Vías Generales de Comunicación"],
  ["TPAF09", "Grúas tipo Plataforma para el Arrastre de Vehículos"],
  ["TPAF10", "Grúas de Pluma para Arrastre y Salvamento de Vehículos"],
  ["TPAF11", "Otros"],
] as const;

export const CONFIG_VEHICULAR_OPTIONS = [
  ["VL", "Vehículo ligero de carga (2 llantas en el eje delantero y 2 llantas en el eje trasero)"],
  ["C2", "Camión Unitario (2 llantas en el eje delantero y 4 llantas en el eje trasero)"],
  ["C3", "Camión Unitario (2 llantas en el eje delantero y 6 llantas en los dos ejes traseros)"],
  ["C2R2", "Camión-Remolque (5 ejes, 6 llantas en el camión, 4 en el remolque)"],
  ["C3R2", "Camión-Remolque (5 ejes, 8 llantas en el camión, 4 en el remolque)"],
  ["C2R3", "Camión-Remolque (6 ejes, 6 llantas en el camión, 6 en el remolque)"],
  ["C3R3", "Camión-Remolque (6 ejes, 8 llantas en el camión, 6 en el remolque)"],
  ["T2S1", "Tractocamión Articulado (3 ejes, 6 llantas en el tracto, 2 en el semirremolque)"],
  ["T2S2", "Tractocamión Articulado (4 ejes, 6 llantas en el tracto, 4 en el semirremolque)"],
  ["T2S3", "Tractocamión Articulado (5 ejes, 6 llantas en el tracto, 6 en el semirremolque)"],
  ["T3S1", "Tractocamión Articulado (4 ejes, 8 llantas en el tracto, 2 en el semirremolque)"],
  ["T3S2", "Tractocamión Articulado (5 ejes, 8 llantas en el tracto, 4 en el semirremolque)"],
  ["T3S3", "Tractocamión Articulado (6 ejes, 8 llantas en el tracto, 6 en el semirremolque)"],
  ["T2S1R2", "Tractocamión Semirremolque-Remolque"],
  ["T3S2R2", "Tractocamión Semirremolque-Remolque"],
  ["T3S2R3", "Tractocamión Semirremolque-Remolque"],
  ["T3S2R4", "Tractocamión Semirremolque-Remolque"],
  ["T3S3R2", "Tractocamión Semirremolque-Remolque"],
  ["OTROEVGP", "Otro Equipo Especializado de Gran Peso y/o Volumen"],
] as const;

export const FIGURA_TRANSPORTE_OPTIONS = [
  ["01", "Operador"],
  ["02", "Propietario"],
  ["03", "Arrendador"],
  ["04", "Notificado"],
] as const;

export const TIPO_EMBALAJE_OPTIONS = [
  ["1A1", "Bidón de acero de tapa no desmontable"],
  ["1A2", "Bidón de acero de tapa desmontable"],
  ["1B1", "Bidón de aluminio de tapa no desmontable"],
  ["1B2", "Bidón de aluminio de tapa desmontable"],
  ["1D", "Bidón de madera contrachapada"],
  ["1G", "Bidón de cartón"],
  ["1H1", "Bidón de plástico de tapa no desmontable"],
  ["1H2", "Bidón de plástico de tapa desmontable"],
  ["3A1", "Bidón (jerricán) de acero de tapa no desmontable"],
  ["3A2", "Bidón (jerricán) de acero de tapa desmontable"],
  ["3H1", "Bidón (jerricán) de plástico de tapa no desmontable"],
  ["3H2", "Bidón (jerricán) de plástico de tapa desmontable"],
  ["4A", "Caja de acero"],
  ["4B", "Caja de aluminio"],
  ["4C1", "Caja de madera natural ordinaria"],
  ["4C2", "Caja de madera natural con paredes a prueba de tamices de polvos finos"],
  ["4D", "Caja de madera contrachapada"],
  ["4F", "Caja de madera reconstituida"],
  ["4G", "Caja de cartón"],
  ["4H1", "Caja de plástico expandido"],
  ["4H2", "Caja de plástico rígido"],
  ["5H1", "Saco de tejido de plástico sin forro/revestimiento"],
  ["5H2", "Saco de tejido de plástico resistente a las pulverulencias"],
  ["5H3", "Saco de tejido de plástico resistente al agua"],
  ["5H4", "Saco de película de plástico"],
  ["5L1", "Saco de textil sin forro/revestimiento"],
  ["5L2", "Saco de textil resistente a las pulverulencias"],
  ["5L3", "Saco de textil resistente al agua"],
  ["5M1", "Saco de papel de varias hojas"],
  ["5M2", "Saco de papel de varias hojas resistente al agua"],
  ["6HA1", "Envase compuesto de recipiente de plástico"],
  ["6PA1", "Envase compuesto de recipiente de metal"],
  ["ZZ", "No Especificada"],
] as const;

export const UNIDAD_PESO_OPTIONS = [
  ["KGM", "Kilogramo"],
  ["TNE", "Tonelada métrica"],
  ["LBR", "Libra"],
  ["GRM", "Gramo"],
] as const;

export const VIA_ENTRADA_SALIDA_OPTIONS = [
  ["01", "Autotransporte"],
  ["02", "Transporte Marítimo"],
  ["03", "Transporte Aéreo"],
  ["04", "Transporte Ferroviario"],
  ["05", "Ducto"],
  ["06", "Transporte Eléctrico"],
] as const;

export const ENTRADA_SALIDA_OPTIONS = [
  ["Entrada", "Entrada"],
  ["Salida", "Salida"],
] as const;
