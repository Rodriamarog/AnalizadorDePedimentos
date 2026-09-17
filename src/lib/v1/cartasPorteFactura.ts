import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { withOrg } from "@/lib/db/withOrg";
import { pedimentos, partidas, direcciones, vehiculos, choferes } from "@/lib/db/schema";
import { umcToUnitKey } from "@/lib/umc";
import { productosByFraccion } from "./productosLookup";
import {
  buildCartaPorteComplement,
  mapPedimentoToMercancias,
  type BienesTranspLookup,
  type PedimentoForCartaPorte,
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
  pedimento_id: string;
  tipo_figura: string;
  fecha_hora_salida: string;
  fecha_hora_llegada: string;
  distancia_recorrida_km: number;
}

export interface BuiltCartaPorteInvoice {
  invoiceBody: Record<string, unknown>;
  pedimentoId: string;
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

async function resolveVehiculo(orgId: string, id: string | undefined, inline: VehiculoInlineInput | undefined) {
  if (id) {
    return resolveReference("veh", "vehiculo_id", id, (rowId) =>
      withOrg(orgId, async (tx) => {
        const [r] = await tx.select().from(vehiculos).where(eq(vehiculos.id, rowId)).limit(1);
        return r ?? null;
      })
    );
  }
  return createVehiculoRecord(orgId, inline!);
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

// Builds the raw FacturAPI invoice body for a Carta Porte-complemented
// Traslado (type "T") factura, resolving every reference (cliente,
// direcciones, vehiculo, chofer, pedimento) and pulling the pedimento's
// partidas through the same mapPedimentoToMercancias/productos lookup the
// internal UI uses for its "Mercancias" prefill (#62). Returns a
// NextResponse (the standard 400 invalid_parameter envelope) on any
// missing/invalid/inactive reference instead of throwing, so the route can
// return it directly.
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

  const pedimentoData = await withOrg(orgId, async (tx) => {
    const [pedimento] = await tx.select().from(pedimentos).where(eq(pedimentos.id, input.pedimento_id)).limit(1);
    if (!pedimento) return null;
    const rows = await tx
      .select()
      .from(partidas)
      .where(eq(partidas.pedimentoId, input.pedimento_id))
      .orderBy(asc(partidas.sec));

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

  const items = mappedRows.map((p) => ({
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
      descripcion: p.descripcion,
      cantidad: p.cantidad,
      umc: p.umc,
      paisOrigen: p.paisOrigen,
      pesoKg: p.pesoKg,
    })),
    pesoBruto: pedimento.pesoBruto,
  };

  const { mercancias, pesoBrutoTotal } = mapPedimentoToMercancias(pedimentoForCartaPorte, bienesTransp);

  const complement = buildCartaPorteComplement({
    ubicacionOrigen: direccionRowToUbicacionInput(origen, input.fecha_hora_salida),
    ubicacionDestino: direccionRowToUbicacionInput(destino, input.fecha_hora_llegada),
    mercancias,
    pesoBrutoTotal: pesoBrutoTotal ?? mercancias.reduce((sum, m) => sum + m.pesoEnKg, 0),
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

  return { invoiceBody, pedimentoId: pedimento.id };
}
