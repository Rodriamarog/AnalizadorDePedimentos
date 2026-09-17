import { z } from "zod";
import { withOrg } from "@/lib/db/withOrg";
import { direcciones, vehiculos, choferes } from "@/lib/db/schema";
import type { FacturapiClient } from "@/lib/facturapi";
import { replaceClienteEmails } from "./clienteEmails";
import type { FacturapiCustomer } from "./referenceData";
import { isValidCodigoPostal, isValidRfc } from "./mexicanIds";

// Shared field-level schemas (#71) — reject a malformed RFC or código
// postal with the app's own invalid_parameter error before any of these
// records (or an inline party on POST /cartas-porte, which reuses these
// same schemas) ever reach FacturAPI.
const rfcField = z.string().refine(isValidRfc, { message: "Malformed RFC" });
const codigoPostalField = z.string().refine(isValidCodigoPostal, { message: "Malformed código postal — expected 5 digits" });

// Shared validation + create logic for the reference-data resources,
// factored out of their POST /clientes, /direcciones, /vehiculos, /choferes
// route handlers so POST /cartas-porte's inline cliente/direccion/vehiculo/
// chofer fields (#63) validate and create the exact same kind of record —
// the schemas live here (not re-declared per route) so a field added or
// tightened in one place can't drift out of sync with the other.

export const createClienteSchema = z.object({
  legal_name: z.string(),
  tax_id: rfcField,
  tax_system: z.string(),
  zip: codigoPostalField.optional(),
  email: z.string().optional(),
  emails: z.array(z.string()).optional(),
});

export type CreateClienteInput = z.infer<typeof createClienteSchema>;

export async function createClienteRecord(
  facturapi: FacturapiClient,
  orgId: string,
  body: CreateClienteInput
): Promise<FacturapiCustomer> {
  const created = await facturapi.post<FacturapiCustomer>("customers", {
    legal_name: body.legal_name,
    tax_id: body.tax_id,
    tax_system: body.tax_system,
    ...(body.zip ? { address: { zip: body.zip } } : {}),
    ...(body.email ? { email: body.email } : {}),
  });

  const emails = body.emails ?? [];
  if (emails.length > 0) await replaceClienteEmails(orgId, created.id, emails);

  return created;
}

export const createDireccionSchema = z.object({
  tipo: z.enum(["origen", "destino"]),
  etiqueta: z.string(),
  rfc: rfcField,
  nombre: z.string().optional(),
  calle: z.string().optional(),
  numero_exterior: z.string().optional(),
  numero_interior: z.string().optional(),
  colonia: z.string().optional(),
  municipio: z.string().optional(),
  localidad: z.string().optional(),
  estado: z.string().optional(),
  pais: z.string().optional(),
  codigo_postal: codigoPostalField.optional(),
});

export type CreateDireccionInput = z.infer<typeof createDireccionSchema>;

export async function createDireccionRecord(orgId: string, body: CreateDireccionInput) {
  return withOrg(orgId, async (tx) => {
    const [row] = await tx
      .insert(direcciones)
      .values({
        orgId,
        tipo: body.tipo,
        etiqueta: body.etiqueta,
        rfc: body.rfc,
        nombre: body.nombre ?? null,
        calle: body.calle ?? null,
        numeroExterior: body.numero_exterior ?? null,
        numeroInterior: body.numero_interior ?? null,
        colonia: body.colonia ?? null,
        municipio: body.municipio ?? null,
        localidad: body.localidad ?? null,
        estado: body.estado ?? null,
        pais: body.pais ?? null,
        codigoPostal: body.codigo_postal ?? null,
      })
      .returning();
    return row;
  });
}

export const remolqueSchema = z.object({ sub_tipo_remolque: z.string(), placa: z.string() });

export const createVehiculoSchema = z.object({
  placa: z.string(),
  config_vehicular: z.string().optional(),
  permiso_sct: z.string().optional(),
  numero_permiso: z.string().optional(),
  aseguradora_carga: z.string().optional(),
  poliza_carga: z.string().optional(),
  aseguradora_resp_civil: z.string().optional(),
  poliza_resp_civil: z.string().optional(),
  peso_bruto_vehicular: z.string().optional(),
  anio_modelo_vehiculo: z.string().optional(),
  remolques: z.array(remolqueSchema).optional(),
});

export type CreateVehiculoInput = z.infer<typeof createVehiculoSchema>;

export async function createVehiculoRecord(orgId: string, body: CreateVehiculoInput) {
  return withOrg(orgId, async (tx) => {
    const [row] = await tx
      .insert(vehiculos)
      .values({
        orgId,
        placa: body.placa,
        configVehicular: body.config_vehicular ?? null,
        permisoSct: body.permiso_sct ?? null,
        numeroPermiso: body.numero_permiso ?? null,
        aseguradoraCarga: body.aseguradora_carga ?? null,
        polizaCarga: body.poliza_carga ?? null,
        aseguradoraRespCivil: body.aseguradora_resp_civil ?? null,
        polizaRespCivil: body.poliza_resp_civil ?? null,
        pesoBrutoVehicular: body.peso_bruto_vehicular ?? null,
        anioModeloVehiculo: body.anio_modelo_vehiculo ?? null,
        remolques: (body.remolques ?? []).map((r) => ({ subTipoRemolque: r.sub_tipo_remolque, placa: r.placa })),
      })
      .returning();
    return row;
  });
}

export const createChoferSchema = z.object({
  nombre: z.string(),
  rfc: rfcField,
  numero_licencia: z.string().optional(),
});

export type CreateChoferInput = z.infer<typeof createChoferSchema>;

export async function createChoferRecord(orgId: string, body: CreateChoferInput) {
  return withOrg(orgId, async (tx) => {
    const [row] = await tx
      .insert(choferes)
      .values({
        orgId,
        nombre: body.nombre,
        rfc: body.rfc,
        numeroLicencia: body.numero_licencia ?? null,
      })
      .returning();
    return row;
  });
}
