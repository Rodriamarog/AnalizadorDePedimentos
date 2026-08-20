import { umcToUnitKey } from "./umc";

// Wire-shape types for FacturAPI's Complemento Carta Porte 3.1 (`docs/facturapi/api-es.yaml`,
// schema `CartaPorteDataInput`/`CartaPorteDataProperties`). Field names/casing mirror the SAT
// schema exactly (PascalCase) since these objects are serialized as-is in the invoice request
// body — see buildComplemento.ts's `complementBody` for the same "plain literal matching the
// wire shape" convention used elsewhere in this codebase.

export interface CartaPorteDomicilio {
  Estado: string;
  Pais: string;
  CodigoPostal: string;
  Calle?: string;
  NumeroExterior?: string;
  NumeroInterior?: string;
  Colonia?: string;
  Localidad?: string;
  Referencia?: string;
  Municipio?: string;
}

export interface CartaPorteUbicacion {
  TipoUbicacion: "Origen" | "Destino";
  RFCRemitenteDestinatario: string;
  FechaHoraSalidaLlegada: string; // AAAA-MM-DDThh:mm:ss
  IDUbicacion?: string;
  NombreRemitenteDestinatario?: string;
  Domicilio?: CartaPorteDomicilio;
  // Distance, in km, traveled to reach this ubicación from the previous one —
  // only meaningful on Destino (Origen has no preceding leg). Required by SAT
  // whenever Autotransporte data is present, which this app always sends.
  DistanciaRecorrida?: number;
}

export interface CartaPorteRemolque {
  SubTipoRem?: string;
  Placa?: string;
}

export interface CartaPorteIdentificacionVehicular {
  ConfigVehicular?: string;
  PesoBrutoVehicular?: number;
  PlacaVM?: string;
  // FacturAPI's schema types AnioModeloVM as a string (see
  // docs/facturapi/api-es.yaml), unlike every other numeric field here.
  AnioModeloVM?: string;
}

export interface CartaPorteSeguros {
  AseguraRespCivil?: string;
  PolizaRespCivil?: string;
  AseguraMedAmbiente?: string;
  PolizaMedAmbiente?: string;
  AseguraCarga?: string;
  PolizaCarga?: string;
  PrimaSeguro?: number;
}

export interface CartaPorteAutotransporte {
  PermSCT?: string;
  NumPermisoSCT?: string;
  IdentificacionVehicular?: CartaPorteIdentificacionVehicular;
  Seguros?: CartaPorteSeguros;
  Remolques?: CartaPorteRemolque[];
}

export interface CartaPorteDocumentacionAduanera {
  TipoDocumento: string;
  NumPedimento?: string;
  IdentDocAduanero?: string;
  RFCImpo?: string;
}

export interface CartaPorteMercancia {
  BienesTransp: string;
  Descripcion: string;
  Cantidad: number;
  ClaveUnidad: string;
  PesoEnKg: number;
  Unidad?: string;
  MaterialPeligroso?: "Sí" | "No";
  CveMaterialPeligroso?: string;
  Embalaje?: string;
  DescripEmbalaje?: string;
  ValorMercancia?: number;
  Moneda?: string;
  FraccionArancelaria?: string;
  DocumentacionAduanera?: CartaPorteDocumentacionAduanera[];
}

export interface CartaPorteMercancias {
  PesoBrutoTotal: number;
  UnidadPeso: string;
  NumTotalMercancias: number;
  Mercancia: CartaPorteMercancia[];
  Autotransporte?: CartaPorteAutotransporte;
}

export interface CartaPorteFiguraTransporte {
  TipoFigura: string;
  NombreFigura: string;
  RFCFigura?: string;
  NumLicencia?: string;
}

export interface CartaPorteDataInput {
  IdCCP: string;
  TranspInternac: "Sí" | "No";
  Ubicaciones: CartaPorteUbicacion[];
  Mercancias: CartaPorteMercancias;
  EntradaSalidaMerc?: string;
  PaisOrigenDestino?: string;
  ViaEntradaSalida?: string;
  // Total distance, in km, of the whole haul — required by SAT whenever
  // Autotransporte data is present, which this app always sends.
  TotalDistRec?: number;
  FiguraTransporte?: CartaPorteFiguraTransporte[];
}

export interface CartaPorteComplement {
  type: "carta_porte";
  // Wrapper key is `data`, not `carta_porte` — see `CartaPorteInput`/
  // `CartaPorteOrCustomComplementInput` (required: [type, data]) in
  // docs/facturapi/api-es.yaml. The complement's discriminated `type` field
  // already says "carta_porte"; the payload key is the generic `data` shared
  // by every complement type (pago, comercio_exterior, custom, ...).
  data: CartaPorteDataInput;
}

// SAT's required IdCCP format: the literal prefix "CCC" replacing the first
// 3 hex characters of a UUID, keeping the UUID's dash grouping — i.e.
// CCC + 5-4-4-4-12 hex groups, 36 chars total (matches
// [C]{3}[a-f0-9A-F]{5}-[a-f0-9A-F]{4}-[a-f0-9A-F]{4}-[a-f0-9A-F]{4}-[a-f0-9A-F]{12}).
export function generateIdCCP(): string {
  return `CCC${crypto.randomUUID().slice(3)}`;
}

export interface UbicacionInput {
  rfc: string;
  nombre?: string;
  fechaHoraSalidaLlegada: string;
  idUbicacion?: string;
  domicilio: CartaPorteDomicilio;
}

export interface DocumentacionAduaneraInput {
  tipoDocumento: string;
  numPedimento?: string;
  identDocAduanero?: string;
  rfcImpo?: string;
}

export interface MercanciaInput {
  bienesTransp: string;
  descripcion: string;
  cantidad: number;
  claveUnidad: string;
  pesoEnKg: number;
  unidad?: string;
  materialPeligroso?: boolean;
  cveMaterialPeligroso?: string;
  embalaje?: string;
  descripEmbalaje?: string;
  valorMercancia?: number;
  moneda?: string;
  fraccionArancelaria?: string;
  documentacionAduanera?: DocumentacionAduaneraInput[];
}

export interface AutotransporteInput {
  permisoSct?: string;
  numeroPermisoSct?: string;
  configVehicular?: string;
  pesoBrutoVehicular?: number;
  placa?: string;
  anioModeloVehiculo?: string;
  aseguradoraCarga?: string;
  polizaCarga?: string;
  aseguradoraRespCivil?: string;
  polizaRespCivil?: string;
  remolques?: { subTipoRemolque: string; placa: string }[];
}

export interface FiguraTransporteInput {
  tipoFigura: string;
  nombreFigura: string;
  rfc?: string;
  numeroLicencia?: string;
}

// International-transport fields only get built (and only get validated as
// required by SAT) when the user has actually toggled international transport
// on — a purely domestic haul must not carry TranspInternac's sibling fields.
export interface InternacionalInput {
  entradaSalidaMerc: "Entrada" | "Salida";
  paisOrigenDestino: string;
  viaEntradaSalida: string;
}

export interface CartaPorteComplementInput {
  ubicacionOrigen: UbicacionInput;
  ubicacionDestino: UbicacionInput;
  mercancias: MercanciaInput[];
  pesoBrutoTotal: number;
  unidadPeso: string;
  autotransporte: AutotransporteInput;
  figurasTransporte: FiguraTransporteInput[];
  numTotalMercancias?: number; // defaults to mercancias.length
  internacional?: InternacionalInput;
  // Total distance, in km, traveled from ubicacionOrigen to ubicacionDestino —
  // feeds both the top-level TotalDistRec and Destino's DistanciaRecorrida
  // (they're the same single-leg haul in this app's Origen/Destino model).
  distanciaRecorridaKm: number;
}

function buildUbicacion(
  tipo: "Origen" | "Destino",
  u: UbicacionInput,
  distanciaRecorrida?: number
): CartaPorteUbicacion {
  return {
    TipoUbicacion: tipo,
    RFCRemitenteDestinatario: u.rfc,
    FechaHoraSalidaLlegada: u.fechaHoraSalidaLlegada,
    IDUbicacion: u.idUbicacion,
    NombreRemitenteDestinatario: u.nombre,
    Domicilio: u.domicilio,
    DistanciaRecorrida: distanciaRecorrida,
  };
}

function buildDocumentacionAduanera(d: DocumentacionAduaneraInput): CartaPorteDocumentacionAduanera {
  return {
    TipoDocumento: d.tipoDocumento,
    NumPedimento: d.numPedimento,
    IdentDocAduanero: d.identDocAduanero,
    RFCImpo: d.rfcImpo,
  };
}

function buildMercancia(m: MercanciaInput): CartaPorteMercancia {
  return {
    BienesTransp: m.bienesTransp,
    Descripcion: m.descripcion,
    Cantidad: m.cantidad,
    ClaveUnidad: m.claveUnidad,
    PesoEnKg: m.pesoEnKg,
    Unidad: m.unidad,
    MaterialPeligroso: m.materialPeligroso === undefined ? undefined : m.materialPeligroso ? "Sí" : "No",
    CveMaterialPeligroso: m.cveMaterialPeligroso,
    Embalaje: m.embalaje,
    DescripEmbalaje: m.descripEmbalaje,
    ValorMercancia: m.valorMercancia,
    Moneda: m.moneda,
    FraccionArancelaria: m.fraccionArancelaria,
    DocumentacionAduanera:
      m.documentacionAduanera && m.documentacionAduanera.length > 0
        ? m.documentacionAduanera.map(buildDocumentacionAduanera)
        : undefined,
  };
}

function buildAutotransporte(a: AutotransporteInput): CartaPorteAutotransporte {
  return {
    PermSCT: a.permisoSct,
    NumPermisoSCT: a.numeroPermisoSct,
    IdentificacionVehicular: {
      ConfigVehicular: a.configVehicular,
      PesoBrutoVehicular: a.pesoBrutoVehicular,
      PlacaVM: a.placa,
      AnioModeloVM: a.anioModeloVehiculo,
    },
    Seguros: {
      AseguraCarga: a.aseguradoraCarga,
      PolizaCarga: a.polizaCarga,
      AseguraRespCivil: a.aseguradoraRespCivil,
      PolizaRespCivil: a.polizaRespCivil,
    },
    Remolques: a.remolques?.map((r) => ({ SubTipoRem: r.subTipoRemolque, Placa: r.placa })),
  };
}

function buildFiguraTransporte(f: FiguraTransporteInput): CartaPorteFiguraTransporte {
  return {
    TipoFigura: f.tipoFigura,
    NombreFigura: f.nombreFigura,
    RFCFigura: f.rfc,
    NumLicencia: f.numeroLicencia,
  };
}

// Pure transformation (no fetch, no crypto side effects beyond IdCCP
// generation) — mirrors mapPedimentoToItems's "exercisable with a fixture"
// shape so both "Vista previa PDF" and "Timbrar factura" can call this same
// function and get an identical complement.
export function buildCartaPorteComplement(input: CartaPorteComplementInput): CartaPorteComplement {
  const {
    ubicacionOrigen,
    ubicacionDestino,
    mercancias,
    pesoBrutoTotal,
    unidadPeso,
    autotransporte,
    figurasTransporte,
    numTotalMercancias,
    internacional,
    distanciaRecorridaKm,
  } = input;

  const cartaPorte: CartaPorteDataInput = {
    IdCCP: generateIdCCP(),
    TranspInternac: internacional ? "Sí" : "No",
    Ubicaciones: [
      buildUbicacion("Origen", ubicacionOrigen),
      buildUbicacion("Destino", ubicacionDestino, distanciaRecorridaKm),
    ],
    TotalDistRec: distanciaRecorridaKm,
    Mercancias: {
      PesoBrutoTotal: pesoBrutoTotal,
      UnidadPeso: unidadPeso,
      NumTotalMercancias: numTotalMercancias ?? mercancias.length,
      Mercancia: mercancias.map(buildMercancia),
      Autotransporte: buildAutotransporte(autotransporte),
    },
    FiguraTransporte: figurasTransporte.length > 0 ? figurasTransporte.map(buildFiguraTransporte) : undefined,
  };

  if (internacional) {
    cartaPorte.EntradaSalidaMerc = internacional.entradaSalidaMerc;
    cartaPorte.PaisOrigenDestino = internacional.paisOrigenDestino;
    cartaPorte.ViaEntradaSalida = internacional.viaEntradaSalida;
  }

  return { type: "carta_porte", data: cartaPorte };
}

// ── Pedimento → mercancías prefill ──────────────────────────────────────

export interface PedimentoPartidaForCartaPorte {
  fraccion: string;
  descripcion: string;
  cantidad: number;
  umc: string | null;
  paisOrigen: string | null;
  pesoKg: number | null;
}

export interface PedimentoForCartaPorte {
  pedimentoNum: string;
  rfc: string | null;
  // "ED" (Documento digitalizado) identificadores from the pedimento header
  // (Anexo 22 Apéndice 8) — each is a VUCEM reference number for one document
  // annexed to the pedimento (factura, certificado de origen, dictamen NOM,
  // the carta porte contract itself, etc.). Feeds DocumentacionAduanera's
  // IdentDocAduanero, one entry per value (see mapPedimentoToMercancias).
  identificadoresDocAduanero: string[];
  partidas: PedimentoPartidaForCartaPorte[];
  pesoBruto: number | null;
}

// SAT's expected wire format for a pedimento number: the stored 15 raw
// digits (año + aduana + patente + folio) grouped 2-2-4-7 — same grouping
// used for a CFDI item's customs_keys and Carta Porte's NumPedimento.
export function formatPedimentoNumber(pedNum: string): string {
  const digits = pedNum.replace(/\D/g, "");
  if (digits.length !== 15) return pedNum;
  return `${digits.slice(0, 2)}  ${digits.slice(2, 4)}  ${digits.slice(4, 8)}  ${digits.slice(8, 15)}`;
}

export interface BienesTranspLookup {
  fraccion: string;
  bienesTransp: string;
}

export interface PedimentoMercanciasResult {
  mercancias: MercanciaInput[];
  // The first partida carrying a país de origen, uppercased to match SAT's
  // c_Pais key format — pedimento país codes are already that catalog's
  // alpha-3 codes (see paisOrigen.ts), so no further mapping is needed. Only
  // meaningful when the caller is building an international-transport haul.
  paisOrigenDestino?: string;
  // The pedimento header's total PESO BRUTO, passed through as-is to prefill
  // PesoBrutoTotal — this is the actual shipment total, more reliable than
  // summing the (sometimes-null, per-fracción) per-mercancía pesoEnKg.
  pesoBrutoTotal?: number;
}

// Pure transformation (no fetch), mirroring mapPedimentoToItems: exercisable
// directly with a fixture pedimento. `bienesTransp` is an optional fracción ->
// SAT c_BienesTransp lookup, following the same shape as the existing
// fracción -> ClaveProdServ `productos` registry (issue #3's "reusing the
// existing product lookup where applicable") — callers without a populated
// lookup get an empty BienesTransp that the user fills in manually. `PesoEnKg`
// prefills from the partida's UMT-derived weight when the pedimento's tariff
// unit is kilograms (see Partida.pesoKg); otherwise it's left at 0, same as
// any other prefilled-but-editable field.
export function mapPedimentoToMercancias(
  pedimento: PedimentoForCartaPorte,
  bienesTransp: BienesTranspLookup[] = []
): PedimentoMercanciasResult {
  const lookup = new Map(bienesTransp.map((b) => [b.fraccion, b.bienesTransp]));

  // c_TipoDocumentoAduanero "01" = Pedimento — the only kind this app deals
  // with. Same DocumentacionAduanera applies to every partida: it describes
  // the pedimento itself and its annexed documents, not anything
  // partida-specific.
  const numPedimento = formatPedimentoNumber(pedimento.pedimentoNum);
  const documentacionAduanera: DocumentacionAduaneraInput[] =
    pedimento.identificadoresDocAduanero.length > 0
      ? pedimento.identificadoresDocAduanero.map((identDocAduanero) => ({
          tipoDocumento: "01",
          numPedimento,
          identDocAduanero,
          rfcImpo: pedimento.rfc ?? undefined,
        }))
      : [{ tipoDocumento: "01", numPedimento, rfcImpo: pedimento.rfc ?? undefined }];

  const mercancias: MercanciaInput[] = pedimento.partidas.map((p) => ({
    bienesTransp: lookup.get(p.fraccion) ?? "",
    descripcion: p.descripcion,
    cantidad: p.cantidad,
    claveUnidad: umcToUnitKey(p.umc),
    pesoEnKg: p.pesoKg ?? 0,
    documentacionAduanera,
  }));

  const paisOrigenDestino = pedimento.partidas.find((p) => p.paisOrigen)?.paisOrigen?.toUpperCase();

  return { mercancias, paisOrigenDestino, pesoBrutoTotal: pedimento.pesoBruto ?? undefined };
}
