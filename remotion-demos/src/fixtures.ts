// Fake but realistic Mexican-customs sample data shared across the demo
// compositions. No real pedimento data or API calls involved anywhere.

export const FAKE_PARTIDAS = [
  {
    fraccion: "8471.30.01",
    descripcion: "COMPUTADORAS PORTATILES TIPO LAPTOP CON PANTALLA",
    cantidad: 120,
    valAduana: 842_400,
    valComercial: 842_400,
    precioUnitario: 7020,
    tieneIncrementables: false,
    umc: "9",
    claveProdServ: "43211508",
    unitKey: "H87",
    descripcionSat: "Computadoras portátiles",
    confidence: "medium" as const,
  },
  {
    fraccion: "3926.90.99",
    descripcion: "ARTICULOS DIVERSOS DE PLASTICO PARA EMPAQUE",
    cantidad: 4800,
    valAduana: 96_000,
    valComercial: 96_000,
    precioUnitario: 20,
    tieneIncrementables: true,
    umc: "1",
    claveProdServ: "24111503",
    unitKey: "KGM",
    descripcionSat: "Envases y empaques de plástico",
    confidence: "medium" as const,
  },
  {
    fraccion: "8517.62.01",
    descripcion: "ROUTERS INALAMBRICOS DE RED, USO DOMESTICO",
    cantidad: 600,
    valAduana: 210_000,
    valComercial: 210_000,
    precioUnitario: 350,
    tieneIncrementables: false,
    umc: "9",
    claveProdServ: "43222612",
    unitKey: "H87",
    descripcionSat: "Enrutadores de red (routers)",
    confidence: null,
  },
  {
    fraccion: "9403.70.01",
    descripcion: "MUEBLES DE PLASTICO PARA OFICINA",
    cantidad: 350,
    valAduana: 175_000,
    valComercial: 175_000,
    precioUnitario: 500,
    tieneIncrementables: false,
    umc: "9",
    claveProdServ: "56101700",
    unitKey: "H87",
    descripcionSat: "Muebles de oficina",
    confidence: "low" as const,
  },
];

export const FAKE_PEDIMENTO = {
  id: "demo-pedimento-1",
  pedimentoNum: "25 47 3891 7000123",
  importador: "IMPORTADORA NEUROCROW SA DE CV",
  tipoCambio: 18.42,
  dta: 4210,
  igi: 18_600,
  prv: 0,
  partidas: FAKE_PARTIDAS.map((p) => ({
    fraccion: p.fraccion,
    descripcion: p.descripcion,
    cantidad: p.cantidad,
    precioUnitario: p.precioUnitario,
    umc: p.umc,
  })),
};

export const FAKE_CLIENTES = [
  { id: "cli-1", legal_name: "GRUPO COMERCIAL DEL NORTE SA DE CV", tax_id: "GCN950314AB1" },
  { id: "cli-2", legal_name: "DISTRIBUIDORA FRONTERIZA SA DE CV", tax_id: "DFR870622K9" },
];

export const FAKE_FACTURA = {
  folio: "A-1042",
  cliente: "GRUPO COMERCIAL DEL NORTE SA DE CV",
  rfc: "GCN950314AB1",
  total: 1_249_530.4,
  moneda: "MXN",
  metodoPago: "PUE" as const,
  fecha: "04/07/2026",
  uuid: "3F2A9C10-8B7E-4E51-9C2D-6A1F0B7E3D42",
};
