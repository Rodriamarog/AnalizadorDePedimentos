import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { withOrg } from "@/lib/db/withOrg";
import { vehiculos, choferes, direcciones } from "@/lib/db/schema";
import {
  buildAutotransporte,
  buildFiguraTransporte,
  generateIdCCP,
  type AutotransporteInput,
  type FiguraTransporteInput,
  type UbicacionInput,
} from "@/lib/buildCartaPorte";
import { apiError } from "./envelope";
import { fromPublicId } from "./publicId";

type VehiculoRow = typeof vehiculos.$inferSelect;
type ChoferRow = typeof choferes.$inferSelect;
type DireccionRow = typeof direcciones.$inferSelect;

// Row -> builder-input mappings, shared between the `*_id` reference
// resolution below (mutates an already-built raw complement in place, for
// POST /facturas's pass-through `complements`) and POST /cartas-porte
// (#62), which builds a complement from scratch via buildCartaPorteComplement
// and needs the same row shapes turned into its typed *Input arguments
// instead.
export function vehiculoRowToAutotransporteInput(row: VehiculoRow): AutotransporteInput {
  return {
    permisoSct: row.permisoSct ?? undefined,
    numeroPermisoSct: row.numeroPermiso ?? undefined,
    configVehicular: row.configVehicular ?? undefined,
    placa: row.placa,
    pesoBrutoVehicular: row.pesoBrutoVehicular ? Number(row.pesoBrutoVehicular) : undefined,
    anioModeloVehiculo: row.anioModeloVehiculo ?? undefined,
    aseguradoraCarga: row.aseguradoraCarga ?? undefined,
    polizaCarga: row.polizaCarga ?? undefined,
    aseguradoraRespCivil: row.aseguradoraRespCivil ?? undefined,
    polizaRespCivil: row.polizaRespCivil ?? undefined,
    remolques:
      row.remolques.length > 0
        ? row.remolques.map((r) => ({ subTipoRemolque: r.subTipoRemolque, placa: r.placa }))
        : undefined,
  };
}

export function choferRowToFiguraTransporteInput(row: ChoferRow, tipoFigura: string): FiguraTransporteInput {
  return {
    tipoFigura,
    nombreFigura: row.nombre,
    rfc: row.rfc,
    numeroLicencia: row.numeroLicencia ?? undefined,
  };
}

export function direccionRowToUbicacionInput(
  row: DireccionRow,
  fechaHoraSalidaLlegada: string,
  idUbicacion?: string
): UbicacionInput {
  return {
    rfc: row.rfc,
    nombre: row.nombre ?? undefined,
    fechaHoraSalidaLlegada,
    idUbicacion,
    domicilio: {
      Estado: row.estado ?? "",
      Pais: row.pais ?? "",
      CodigoPostal: row.codigoPostal ?? "",
      Calle: row.calle ?? undefined,
      NumeroExterior: row.numeroExterior ?? undefined,
      NumeroInterior: row.numeroInterior ?? undefined,
      Colonia: row.colonia ?? undefined,
      Localidad: row.localidad ?? undefined,
      Municipio: row.municipio ?? undefined,
    },
  };
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

// Resolves `vehiculo_id`/`chofer_id`/`direccion_id` references (#55) inside
// a raw FacturAPI `carta_porte` complement, in place, replacing each
// reference with the inline fields FacturAPI expects — same
// PascalCase/SAT-wire shape the client already sent everything else in
// (see facturas/route.ts's rawInvoiceSchema pass-through), so only the
// reference fields themselves are the app's own snake_case addition. A
// caller that already sent the fields inline (no `*_id`) is left untouched.
// The `*_id` values are the same `veh_`/`chf_`/`dir_`-prefixed public ids
// GET /vehiculos, /choferes, /direcciones return (#56) — never the raw
// internal uuid.
export async function resolveCartaPorteReferences(
  orgId: string,
  body: JsonRecord
): Promise<NextResponse | null> {
  const complements = body.complements;
  if (!Array.isArray(complements)) return null;

  for (const complement of complements) {
    if (!isRecord(complement) || complement.type !== "carta_porte") continue;
    const data = complement.data;
    if (!isRecord(data)) continue;

    if (!data.IdCCP) data.IdCCP = generateIdCCP();

    if (Array.isArray(data.Ubicaciones)) {
      for (const ubicacion of data.Ubicaciones) {
        if (!isRecord(ubicacion) || typeof ubicacion.direccion_id !== "string") continue;
        const err = await resolveDireccion(orgId, ubicacion, ubicacion.direccion_id);
        if (err) return err;
      }
    }

    const mercancias = data.Mercancias;
    if (isRecord(mercancias) && isRecord(mercancias.Autotransporte)) {
      const autotransporte = mercancias.Autotransporte;
      if (typeof autotransporte.vehiculo_id === "string") {
        const err = await resolveVehiculo(orgId, autotransporte, autotransporte.vehiculo_id);
        if (err) return err;
      }
    }

    if (Array.isArray(data.FiguraTransporte)) {
      for (const figura of data.FiguraTransporte) {
        if (!isRecord(figura) || typeof figura.chofer_id !== "string") continue;
        const err = await resolveChofer(orgId, figura, figura.chofer_id);
        if (err) return err;
      }
    }
  }

  return null;
}

// Shared shape behind all three `*_id` lookups: strip the public prefix,
// look the row up org-scoped, and reject a missing/inactive reference with
// the standard envelope — only the prefix, the field name, and what to do
// with a found row differ per resource.
export async function resolveReference<Row extends { active: boolean }>(
  prefix: string,
  field: string,
  publicId: string,
  lookup: (id: string) => Promise<Row | null>
): Promise<Row | NextResponse> {
  const id = fromPublicId(prefix, publicId);
  const row = id ? await lookup(id) : null;
  if (!row) {
    return apiError(400, "invalid_parameter", `${field} does not reference an existing record`, [
      { field, issue: "not_found" },
    ]);
  }
  if (!row.active) {
    return apiError(400, "invalid_parameter", `${field} references an inactive record`, [
      { field, issue: "inactive" },
    ]);
  }
  return row;
}

async function resolveDireccion(
  orgId: string,
  ubicacion: JsonRecord,
  direccionId: string
): Promise<NextResponse | null> {
  const result = await resolveReference("dir", "direccion_id", direccionId, (id) =>
    withOrg(orgId, async (tx) => {
      const [r] = await tx.select().from(direcciones).where(eq(direcciones.id, id)).limit(1);
      return r ?? null;
    })
  );
  if (result instanceof NextResponse) return result;
  const row = result;

  ubicacion.RFCRemitenteDestinatario = row.rfc;
  if (row.nombre) ubicacion.NombreRemitenteDestinatario = row.nombre;
  ubicacion.Domicilio = {
    Estado: row.estado ?? undefined,
    Pais: row.pais ?? undefined,
    CodigoPostal: row.codigoPostal ?? undefined,
    Calle: row.calle ?? undefined,
    NumeroExterior: row.numeroExterior ?? undefined,
    NumeroInterior: row.numeroInterior ?? undefined,
    Colonia: row.colonia ?? undefined,
    Localidad: row.localidad ?? undefined,
    Municipio: row.municipio ?? undefined,
  };
  delete ubicacion.direccion_id;
  return null;
}

async function resolveVehiculo(
  orgId: string,
  autotransporte: JsonRecord,
  vehiculoId: string
): Promise<NextResponse | null> {
  const result = await resolveReference("veh", "vehiculo_id", vehiculoId, (id) =>
    withOrg(orgId, async (tx) => {
      const [r] = await tx.select().from(vehiculos).where(eq(vehiculos.id, id)).limit(1);
      return r ?? null;
    })
  );
  if (result instanceof NextResponse) return result;
  const row = result;

  // Same builder the internal UI uses for an inline-entered vehículo
  // (buildCartaPorteComplement -> buildAutotransporte) — only the input
  // comes from the db row here instead of the form.
  const built = buildAutotransporte(vehiculoRowToAutotransporteInput(row));
  delete autotransporte.vehiculo_id;
  Object.assign(autotransporte, built);
  return null;
}

async function resolveChofer(orgId: string, figura: JsonRecord, choferId: string): Promise<NextResponse | null> {
  const result = await resolveReference("chf", "chofer_id", choferId, (id) =>
    withOrg(orgId, async (tx) => {
      const [r] = await tx.select().from(choferes).where(eq(choferes.id, id)).limit(1);
      return r ?? null;
    })
  );
  if (result instanceof NextResponse) return result;
  const row = result;

  // Same builder the internal UI uses for an inline-entered chofer
  // (buildCartaPorteComplement -> buildFiguraTransporte). `TipoFigura` isn't
  // stored on the chofer record (it's per-shipment, e.g. "01" operador), so
  // it must already be on `figura` from the caller — untouched here.
  const tipoFigura = typeof figura.TipoFigura === "string" ? figura.TipoFigura : "";
  const built = buildFiguraTransporte(choferRowToFiguraTransporteInput(row, tipoFigura));
  delete figura.chofer_id;
  Object.assign(figura, built);
  return null;
}
