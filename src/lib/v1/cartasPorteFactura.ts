import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { withOrg } from "@/lib/db/withOrg";
import { pedimentos, partidas, direcciones, vehiculos, choferes, productos, satClaves } from "@/lib/db/schema";
import { umcToUnitKey } from "@/lib/umc";
import { productosByFraccion } from "./productosLookup";
import { runAutomap, runAutomapDescripciones } from "@/lib/automap";
import {
  buildCartaPorteComplement,
  mapPedimentoToMercancias,
  FRACCION_ARANCELARIA_PATTERN,
  type BienesTranspLookup,
  type PedimentoForCartaPorte,
  type MercanciaInput,
} from "@/lib/buildCartaPorte";
import { FacturapiError, type FacturapiClient } from "@/lib/facturapi";
import { apiError } from "./envelope";
import {
  resolveReference,
  direccionRowToUbicacionInput,
  vehiculoRowToAutotransporteInput,
  choferRowToFiguraTransporteInput,
} from "./cartaPorte";
import { createClienteRecord, createDireccionRecord, createVehiculoRecord, createChoferRecord } from "./createReference";
import type { FacturapiCustomer } from "./referenceData";

// Inline/id-reference input shapes shared by POST /cartas-porte (#62, #63).
// Each `*_id`/inline pair is validated exclusive-or by the caller
// (src/app/api/v1/cartas-porte/route.ts) before this runs.

export interface ClienteInlineInput {
  legal_name: string;
  tax_id: string;
  tax_system: string;
  zip?: string;
  email?: string;
  emails?: string[];
}

export interface DireccionInlineInput {
  etiqueta: string;
  rfc: string;
  nombre?: string;
  calle?: string;
  numero_exterior?: string;
  numero_interior?: string;
  colonia?: string;
  municipio?: string;
  localidad?: string;
  estado?: string;
  pais?: string;
  codigo_postal?: string;
}

export interface VehiculoInlineInput {
  placa: string;
  config_vehicular?: string;
  permiso_sct?: string;
  numero_permiso?: string;
  aseguradora_carga?: string;
  poliza_carga?: string;
  aseguradora_resp_civil?: string;
  poliza_resp_civil?: string;
  peso_bruto_vehicular?: string;
  anio_modelo_vehiculo?: string;
  remolques?: { sub_tipo_remolque: string; placa: string }[];
}

export interface ChoferInlineInput {
  nombre: string;
  rfc: string;
  numero_licencia?: string;
}

// Inline mercancía (#64): an alternative to `pedimento_id` for shipments
// that never went through pedimento upload/parsing at all. `clave_prod_serv`
// (reused as BienesTransp, same convention as the pedimento path) and
// `bienes_transp` are optional — see resolveInlineMercancias.
export interface MercanciaInlineInput {
  descripcion: string;
  cantidad: number;
  peso_kg: number;
  clave_unidad?: string;
  fraccion?: string;
  clave_prod_serv?: string;
  bienes_transp?: string;
  valor_mercancia?: number;
  moneda?: string;
}

export interface CreateCartaPorteInput {
  cliente_id?: string;
  cliente?: ClienteInlineInput;
  direccion_origen_id?: string;
  direccion_origen?: DireccionInlineInput;
  direccion_destino_id?: string;
  direccion_destino?: DireccionInlineInput;
  vehiculo_id?: string;
  vehiculo?: VehiculoInlineInput;
  chofer_id?: string;
  chofer?: ChoferInlineInput;
  pedimento_id?: string;
  mercancias?: MercanciaInlineInput[];
  auto_classify?: boolean;
  tipo_figura: string;
  fecha_hora_salida: string;
  fecha_hora_llegada: string;
  distancia_recorrida_km: number;
}

export interface BuiltCartaPorteInvoice {
  invoiceBody: Record<string, unknown>;
  pedimentoId: string | null;
}

interface CartaPorteItem {
  quantity: number;
  product: {
    description: string;
    product_key?: string;
    unit_key: string;
  };
}

// Shared shape both the pedimento-sourced and inline mercancía paths resolve
// into, so buildCartaPorteFacturaBody can assign the branch's result in one
// step regardless of which path ran.
interface MercanciasBuild {
  mercancias: MercanciaInput[];
  items: CartaPorteItem[];
  pesoBrutoTotal: number;
  pedimentoId: string | null;
}

// Classifies inline mercancía items missing a resolvable SAT code (#65),
// keyed by fraccion via the same Gemini automap pipeline (and productos
// caching) POST /pedimentos's auto_classify uses, or — for items with no
// fraccion at all — by descripcion via runAutomapDescripciones. Only the
// fraccion-keyed results get persisted into productos, since there's no
// fraccion to cache against for the descripcion-only path.
async function classifyInlineMercancias(
  orgId: string,
  facturapi: FacturapiClient,
  candidates: { index: number; fraccion?: string; descripcion: string }[]
): Promise<Map<number, string>> {
  const resolved = new Map<number, string>();
  if (candidates.length === 0) return resolved;

  const withFraccion = candidates.filter((c) => c.fraccion);
  const withoutFraccion = candidates.filter((c) => !c.fraccion);

  if (withFraccion.length > 0) {
    const toClassify = withFraccion.map((c) => ({ fraccion: c.fraccion!, descripcion: c.descripcion }));
    const { classifications } = await runAutomap(toClassify, new Set(), facturapi);

    await withOrg(orgId, async (tx) => {
      for (const c of classifications) {
        if (!c.key) continue;
        const candidate = withFraccion.find((w) => w.fraccion === c.fraccion);
        if (!candidate) continue;
        resolved.set(candidate.index, c.key);

        const [catalogRow] = await tx
          .select({ description: satClaves.description })
          .from(satClaves)
          .where(eq(satClaves.key, c.key))
          .limit(1);
        const confirmedDesc = catalogRow?.description ?? c.description ?? "";
        let confidence: string = c.confidence;
        if (!catalogRow && confidence === "high") confidence = "medium";

        await tx
          .insert(productos)
          .values({
            orgId,
            fraccion: c.fraccion,
            descripcion: candidate.descripcion,
            claveProdServ: c.key,
            descripcionSat: confirmedDesc,
            confidence,
          })
          .onConflictDoUpdate({
            target: [productos.orgId, productos.fraccion],
            set: { claveProdServ: c.key, descripcionSat: confirmedDesc, confidence },
          });
      }
    });
  }

  if (withoutFraccion.length > 0) {
    const toClassify = withoutFraccion.map((c) => ({ id: String(c.index), descripcion: c.descripcion }));
    const { classifications } = await runAutomapDescripciones(toClassify);
    for (const c of classifications) {
      if (c.key) resolved.set(Number(c.id), c.key);
    }
  }

  return resolved;
}

// FacturAPI rejects both a missing items[].product.product_key and a blank
// Mercancia.BienesTransp, even in draft mode, so a genuinely unresolved code
// falls back to this SAT c_ClaveProdServ placeholder ("No existe en el
// catálogo") rather than an empty string — reused for both, same convention
// mapPedimentoToMercancias's BienesTransp lookup already follows. Real AI
// resolution of unmapped codes is #66, not this function's job.
const UNRESOLVED_CLAVE_PROD_SERV = "01010101";

// Builds Mercancias + CFDI items from inline mercancía data (#64). The CFDI
// concept's product_key (c_ClaveProdServ) is resolved from (in order) an
// explicit clave_prod_serv, the org's productos mapping by fraccion, and —
// only when auto_classify is set and clave_prod_serv is still missing
// (#65's trigger condition) — the Gemini automap pipeline. Mercancia's
// BienesTransp (c_BienesTransp, a distinct catalog) is an explicit
// bienes_transp if the caller gave one, else the resolved product_key reused
// as-is (#65's "reuse the resolved code as BienesTransp" — never the other
// way around, since a c_BienesTransp code isn't necessarily valid as a CFDI
// product_key). Either falls back to UNRESOLVED_CLAVE_PROD_SERV.
async function resolveInlineMercancias(
  orgId: string,
  facturapi: FacturapiClient,
  input: CreateCartaPorteInput
): Promise<MercanciasBuild> {
  const inline = input.mercancias!;

  const fracciones = [...new Set(inline.filter((m) => m.fraccion).map((m) => m.fraccion!))];
  const productoRows = await withOrg(orgId, (tx) => productosByFraccion(tx, orgId, fracciones));
  const productoByFraccion = new Map(productoRows.map((p) => [p.fraccion, p]));

  const resolvedProductKeys = new Map<number, string>();
  inline.forEach((m, index) => {
    if (m.clave_prod_serv) {
      resolvedProductKeys.set(index, m.clave_prod_serv);
      return;
    }
    const mapped = m.fraccion ? productoByFraccion.get(m.fraccion)?.claveProdServ : undefined;
    if (mapped) resolvedProductKeys.set(index, mapped);
  });

  if (input.auto_classify) {
    const candidates = inline
      .map((m, index) => ({ index, fraccion: m.fraccion, descripcion: m.descripcion }))
      .filter((c) => !resolvedProductKeys.has(c.index));
    const classified = await classifyInlineMercancias(orgId, facturapi, candidates);
    for (const [index, code] of classified) resolvedProductKeys.set(index, code);
  }

  const mercancias: MercanciaInput[] = inline.map((m, index) => ({
    bienesTransp: m.bienes_transp ?? resolvedProductKeys.get(index) ?? UNRESOLVED_CLAVE_PROD_SERV,
    descripcion: m.descripcion,
    cantidad: m.cantidad,
    claveUnidad: m.clave_unidad ?? "H87",
    pesoEnKg: m.peso_kg,
    valorMercancia: m.valor_mercancia,
    moneda: m.valor_mercancia !== undefined ? (m.moneda ?? "MXN") : m.moneda,
    // `fraccion` is documented (and used elsewhere in this file) as the bare
    // 8-digit fracción, but SAT's Carta Porte FraccionArancelaria catalog
    // only accepts the 10-digit fraccion+NICO key (see
    // buildFraccionArancelaria in buildCartaPorte.ts) — sending the bare
    // 8-digit value gets rejected by FacturAPI at stamp time. There's no
    // NICO available for an inline caller-supplied fraccion, so only pass
    // it through when it already looks like the full 10-digit key.
    fraccionArancelaria: m.fraccion && FRACCION_ARANCELARIA_PATTERN.test(m.fraccion) ? m.fraccion : undefined,
  }));

  const items: CartaPorteItem[] = inline.map((m, index) => ({
    quantity: m.cantidad,
    product: {
      description: m.descripcion,
      product_key: resolvedProductKeys.get(index) ?? UNRESOLVED_CLAVE_PROD_SERV,
      unit_key: m.clave_unidad ?? "H87",
    },
  }));

  const pesoBrutoTotal = inline.reduce((sum, m) => sum + m.peso_kg, 0);

  return { mercancias, items, pesoBrutoTotal, pedimentoId: null };
}

async function resolveCliente(
  facturapi: FacturapiClient,
  orgId: string,
  input: CreateCartaPorteInput
): Promise<string | NextResponse> {
  if (input.cliente_id) {
    try {
      const customer = await facturapi.get<FacturapiCustomer>(`customers/${input.cliente_id}`);
      return customer.id;
    } catch (e) {
      if (e instanceof FacturapiError) {
        return apiError(400, "invalid_parameter", "cliente_id does not reference an existing record", [
          { field: "cliente_id", issue: "not_found" },
        ]);
      }
      throw e;
    }
  }

  const created = await createClienteRecord(facturapi, orgId, input.cliente!);
  return created.id;
}

async function resolveDireccion(orgId: string, id: string | undefined, inline: DireccionInlineInput | undefined, field: string, tipo: "origen" | "destino") {
  if (id) {
    return resolveReference("dir", field, id, (rowId) =>
      withOrg(orgId, async (tx) => {
        const [r] = await tx.select().from(direcciones).where(eq(direcciones.id, rowId)).limit(1);
        return r ?? null;
      })
    );
  }
  return createDireccionRecord(orgId, { ...inline!, tipo });
}

// Optional on POST /vehiculos (a placa-only record is a valid standalone
// vehículo), but SAT requires all of these on the Complemento Carta Porte's
// Autotransporte node — reject here, by name, rather than letting FacturAPI
// surface an opaque facturapi_error once the invoice is already assembled.
const REQUIRED_VEHICULO_CARTA_PORTE_FIELDS = [
  ["configVehicular", "config_vehicular"],
  ["permisoSct", "permiso_sct"],
  ["numeroPermiso", "numero_permiso"],
  ["pesoBrutoVehicular", "peso_bruto_vehicular"],
  ["anioModeloVehiculo", "anio_modelo_vehiculo"],
] as const;

function validateVehiculoForCartaPorte(row: { [K in (typeof REQUIRED_VEHICULO_CARTA_PORTE_FIELDS)[number][0]]: unknown }): NextResponse | null {
  const missing = REQUIRED_VEHICULO_CARTA_PORTE_FIELDS.filter(([rowKey]) => row[rowKey] == null).map(([, field]) => field);
  if (missing.length === 0) return null;
  return apiError(
    400,
    "invalid_parameter",
    "The vehículo is missing fields required for a Complemento Carta Porte",
    missing.map((field) => ({ field: `vehiculo.${field}`, issue: "missing" }))
  );
}

async function resolveVehiculo(orgId: string, id: string | undefined, inline: VehiculoInlineInput | undefined) {
  const row = id
    ? await resolveReference("veh", "vehiculo_id", id, (rowId) =>
        withOrg(orgId, async (tx) => {
          const [r] = await tx.select().from(vehiculos).where(eq(vehiculos.id, rowId)).limit(1);
          return r ?? null;
        })
      )
    : await createVehiculoRecord(orgId, inline!);
  if (row instanceof NextResponse) return row;
  return validateVehiculoForCartaPorte(row) ?? row;
}

async function resolveChofer(orgId: string, id: string | undefined, inline: ChoferInlineInput | undefined) {
  if (id) {
    return resolveReference("chf", "chofer_id", id, (rowId) =>
      withOrg(orgId, async (tx) => {
        const [r] = await tx.select().from(choferes).where(eq(choferes.id, rowId)).limit(1);
        return r ?? null;
      })
    );
  }
  return createChoferRecord(orgId, inline!);
}

// Resolves `input.pedimento_id` into Mercancias/CFDI items via the same
// mapPedimentoToMercancias/productos lookup the internal UI uses for its
// "Mercancias" prefill (#62). Returns a NextResponse (400 invalid_parameter)
// if the pedimento doesn't exist or has no mapped partidas.
async function resolvePedimentoMercancias(
  orgId: string,
  input: CreateCartaPorteInput
): Promise<MercanciasBuild | NextResponse> {
  const pedimentoId = input.pedimento_id!;
  const pedimentoData = await withOrg(orgId, async (tx) => {
    const [pedimento] = await tx.select().from(pedimentos).where(eq(pedimentos.id, pedimentoId)).limit(1);
    if (!pedimento) return null;
    const rows = await tx.select().from(partidas).where(eq(partidas.pedimentoId, pedimentoId)).orderBy(asc(partidas.sec));

    const productoRows = await productosByFraccion(
      tx,
      orgId,
      rows.map((p) => p.fraccion)
    );

    return { pedimento, rows, productoRows };
  });

  if (!pedimentoData) {
    return apiError(400, "invalid_parameter", "pedimento_id does not reference an existing record", [
      { field: "pedimento_id", issue: "not_found" },
    ]);
  }
  const { pedimento, rows, productoRows } = pedimentoData;
  const productoByFraccion = new Map(productoRows.map((p) => [p.fraccion, p]));

  // Only partidas whose fracción already has a clave_prod_serv mapping can
  // become a CFDI concept (product_key is required) — Mercancias is scoped
  // to the exact same set, so the Carta Porte doesn't describe goods the
  // Comprobante never itemized.
  const mappedRows = rows.filter((p) => productoByFraccion.get(p.fraccion)?.claveProdServ);

  if (mappedRows.length === 0) {
    return apiError(
      400,
      "invalid_parameter",
      "No hay partidas con clave_prod_serv asignado en este pedimento para generar los conceptos de la factura",
      [{ field: "pedimento_id", issue: "no_mapped_partidas" }]
    );
  }

  const items: CartaPorteItem[] = mappedRows.map((p) => ({
    quantity: p.cantidad,
    product: {
      description: p.descripcion,
      product_key: productoByFraccion.get(p.fraccion)!.claveProdServ!,
      unit_key: umcToUnitKey(p.umc),
    },
  }));

  const bienesTransp: BienesTranspLookup[] = mappedRows.map((p) => ({
    fraccion: p.fraccion,
    bienesTransp: productoByFraccion.get(p.fraccion)!.claveProdServ!,
  }));

  const pedimentoForCartaPorte: PedimentoForCartaPorte = {
    pedimentoNum: pedimento.pedimentoNum,
    rfc: pedimento.rfc,
    identificadoresDocAduanero: pedimento.identificadoresDocAduanero,
    partidas: mappedRows.map((p) => ({
      fraccion: p.fraccion,
      subd: p.subd,
      descripcion: p.descripcion,
      cantidad: p.cantidad,
      umc: p.umc,
      paisOrigen: p.paisOrigen,
      pesoKg: p.pesoKg,
    })),
    pesoBruto: pedimento.pesoBruto,
  };

  const { mercancias, pesoBrutoTotal } = mapPedimentoToMercancias(pedimentoForCartaPorte, bienesTransp);

  return {
    mercancias,
    items,
    pesoBrutoTotal: pesoBrutoTotal ?? mercancias.reduce((sum, m) => sum + m.pesoEnKg, 0),
    pedimentoId: pedimento.id,
  };
}

// Builds the raw FacturAPI invoice body for a Carta Porte-complemented
// Traslado (type "T") factura, resolving every reference (cliente,
// direcciones, vehiculo, chofer) and the mercancía data, which is either
// `pedimento_id` or inline `mercancias[]` (#64) — mutually exclusive,
// enforced by the route before this runs. Returns a NextResponse (the
// standard 400 invalid_parameter envelope) on any missing/invalid/inactive
// reference instead of throwing, so the route can return it directly.
export async function buildCartaPorteFacturaBody(
  orgId: string,
  facturapi: FacturapiClient,
  input: CreateCartaPorteInput
): Promise<BuiltCartaPorteInvoice | NextResponse> {
  // The 5 party references/inline creates are independent of each other —
  // resolve them concurrently rather than paying for 5 sequential
  // round-trips (each already opens its own withOrg transaction).
  const [customerId, origen, destino, vehiculo, chofer] = await Promise.all([
    resolveCliente(facturapi, orgId, input),
    resolveDireccion(orgId, input.direccion_origen_id, input.direccion_origen, "direccion_origen_id", "origen"),
    resolveDireccion(orgId, input.direccion_destino_id, input.direccion_destino, "direccion_destino_id", "destino"),
    resolveVehiculo(orgId, input.vehiculo_id, input.vehiculo),
    resolveChofer(orgId, input.chofer_id, input.chofer),
  ]);
  if (customerId instanceof NextResponse) return customerId;
  if (origen instanceof NextResponse) return origen;
  if (destino instanceof NextResponse) return destino;
  if (vehiculo instanceof NextResponse) return vehiculo;
  if (chofer instanceof NextResponse) return chofer;

  const built = input.pedimento_id
    ? await resolvePedimentoMercancias(orgId, input)
    : await resolveInlineMercancias(orgId, facturapi, input);
  if (built instanceof NextResponse) return built;
  const { mercancias, items, pesoBrutoTotal, pedimentoId } = built;

  const complement = buildCartaPorteComplement({
    ubicacionOrigen: direccionRowToUbicacionInput(origen, input.fecha_hora_salida),
    ubicacionDestino: direccionRowToUbicacionInput(destino, input.fecha_hora_llegada),
    mercancias,
    pesoBrutoTotal,
    unidadPeso: "KGM",
    autotransporte: vehiculoRowToAutotransporteInput(vehiculo),
    figurasTransporte: [choferRowToFiguraTransporteInput(chofer, input.tipo_figura)],
    distanciaRecorridaKm: input.distancia_recorrida_km,
  });

  const invoiceBody: Record<string, unknown> = {
    type: "T",
    customer: customerId,
    items,
    complements: [complement],
    status: "draft",
  };

  return { invoiceBody, pedimentoId };
}
