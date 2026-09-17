import { z } from "zod";
import type { vehiculos, choferes, direcciones, productos } from "@/lib/db/schema";
import { toPublicId } from "./publicId";

type VehiculoRow = typeof vehiculos.$inferSelect;
type ChoferRow = typeof choferes.$inferSelect;
type DireccionRow = typeof direcciones.$inferSelect;
type ProductoRow = typeof productos.$inferSelect;

// Curated snake_case public shapes for the reference-data resources (#56) —
// internal fields minus internal-only concerns (org id, FacturAPI-specific
// bookkeeping), matching internal field names 1:1 otherwise so the internal
// dashboard's docs/behavior transfer directly.

export function serializeVehiculo(v: VehiculoRow) {
  return {
    id: toPublicId("veh", v.id),
    placa: v.placa,
    config_vehicular: v.configVehicular,
    permiso_sct: v.permisoSct,
    numero_permiso: v.numeroPermiso,
    aseguradora_carga: v.aseguradoraCarga,
    poliza_carga: v.polizaCarga,
    aseguradora_resp_civil: v.aseguradoraRespCivil,
    poliza_resp_civil: v.polizaRespCivil,
    peso_bruto_vehicular: v.pesoBrutoVehicular,
    anio_modelo_vehiculo: v.anioModeloVehiculo,
    remolques: v.remolques.map((r) => ({ sub_tipo_remolque: r.subTipoRemolque, placa: r.placa })),
    active: v.active,
    created_at: v.createdAt.toISOString(),
  };
}

export const vehiculoResponseSchema = z.object({
  id: z.string(),
  placa: z.string(),
  config_vehicular: z.string().nullable(),
  permiso_sct: z.string().nullable(),
  numero_permiso: z.string().nullable(),
  aseguradora_carga: z.string().nullable(),
  poliza_carga: z.string().nullable(),
  aseguradora_resp_civil: z.string().nullable(),
  poliza_resp_civil: z.string().nullable(),
  peso_bruto_vehicular: z.string().nullable(),
  anio_modelo_vehiculo: z.string().nullable(),
  remolques: z.array(z.object({ sub_tipo_remolque: z.string(), placa: z.string() })),
  active: z.boolean(),
  created_at: z.string(),
});

export function serializeChofer(c: ChoferRow) {
  return {
    id: toPublicId("chf", c.id),
    nombre: c.nombre,
    rfc: c.rfc,
    numero_licencia: c.numeroLicencia,
    active: c.active,
    created_at: c.createdAt.toISOString(),
  };
}

export const choferResponseSchema = z.object({
  id: z.string(),
  nombre: z.string(),
  rfc: z.string(),
  numero_licencia: z.string().nullable(),
  active: z.boolean(),
  created_at: z.string(),
});

export function serializeDireccion(d: DireccionRow) {
  return {
    id: toPublicId("dir", d.id),
    tipo: d.tipo,
    etiqueta: d.etiqueta,
    rfc: d.rfc,
    nombre: d.nombre,
    calle: d.calle,
    numero_exterior: d.numeroExterior,
    numero_interior: d.numeroInterior,
    colonia: d.colonia,
    municipio: d.municipio,
    localidad: d.localidad,
    estado: d.estado,
    pais: d.pais,
    codigo_postal: d.codigoPostal,
    active: d.active,
    created_at: d.createdAt.toISOString(),
  };
}

export const direccionResponseSchema = z.object({
  id: z.string(),
  tipo: z.string(),
  etiqueta: z.string(),
  rfc: z.string(),
  nombre: z.string().nullable(),
  calle: z.string().nullable(),
  numero_exterior: z.string().nullable(),
  numero_interior: z.string().nullable(),
  colonia: z.string().nullable(),
  municipio: z.string().nullable(),
  localidad: z.string().nullable(),
  estado: z.string().nullable(),
  pais: z.string().nullable(),
  codigo_postal: z.string().nullable(),
  active: z.boolean(),
  created_at: z.string(),
});

// Clientes (#57) — no local table (customers live entirely in FacturAPI), so
// there's no Drizzle row to type this against; shaped from the raw FacturAPI
// Customer response plus the locally-stored extra `emails` (see
// clienteEmails in schema.ts). `id` stays FacturAPI's raw unprefixed id —
// unlike vehiculos/choferes/direcciones, there's no internal uuid to wrap.
export interface FacturapiCustomer {
  id: string;
  legal_name: string;
  tax_id?: string | null;
  tax_system?: string | null;
  email?: string | null;
  address?: { zip?: string | null } | null;
}

export function serializeCliente(c: FacturapiCustomer, emails: string[]) {
  return {
    id: c.id,
    legal_name: c.legal_name,
    tax_id: c.tax_id ?? null,
    tax_system: c.tax_system ?? null,
    zip: c.address?.zip ?? null,
    email: c.email ?? null,
    emails,
  };
}

export const clienteResponseSchema = z.object({
  id: z.string(),
  legal_name: z.string(),
  tax_id: z.string().nullable(),
  tax_system: z.string().nullable(),
  zip: z.string().nullable(),
  email: z.string().nullable(),
  emails: z.array(z.string()),
});

export function serializeProducto(p: ProductoRow) {
  return {
    id: toPublicId("prd", p.id),
    fraccion: p.fraccion,
    descripcion: p.descripcion,
    clave_prod_serv: p.claveProdServ,
    descripcion_sat: p.descripcionSat,
    unit_key: p.unitKey,
    confidence: p.confidence,
  };
}

export const productoResponseSchema = z.object({
  id: z.string(),
  fraccion: z.string(),
  descripcion: z.string(),
  clave_prod_serv: z.string().nullable(),
  descripcion_sat: z.string().nullable(),
  unit_key: z.string(),
  confidence: z.string().nullable(),
});
