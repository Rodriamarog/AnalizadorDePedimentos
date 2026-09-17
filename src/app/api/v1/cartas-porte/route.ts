import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiKeyAuth } from "@/lib/v1/auth";
import { apiError } from "@/lib/v1/envelope";
import { bearerAuth, ErrorSchema, registry, unauthorizedResponse, invalidParameterResponse } from "@/lib/v1/openapi";
import { withIdempotency } from "@/lib/v1/idempotency";
import { buildCartaPorteFacturaBody } from "@/lib/v1/cartasPorteFactura";
import { getOrgFacturapiClient } from "@/lib/orgFacturapi";
import { FacturapiError } from "@/lib/facturapi";
import { saveFactura } from "@/lib/saveFactura";
import { withOrg } from "@/lib/db/withOrg";
import { createClienteSchema, createDireccionSchema, createVehiculoSchema, createChoferSchema } from "@/lib/v1/createReference";
import { invalidBodyError } from "@/lib/v1/validation";

// Reuses the exact same validation schemas POST /clientes, /direcciones,
// /vehiculos, and /choferes already declare (in createReference.ts) so an
// inline party here is validated identically to a standalone create — a
// field added or tightened there can't silently drift out of sync with
// what this endpoint accepts. direccion drops `tipo`: which field the
// address goes under (direccion_origen vs direccion_destino) already says
// whether it's Origen or Destino, so making the caller also spell out
// `tipo` would just be a redundant way to get it wrong.
const clienteInlineSchema = createClienteSchema;
const direccionInlineSchema = createDireccionSchema.omit({ tipo: true });
const vehiculoInlineSchema = createVehiculoSchema;
const choferInlineSchema = createChoferSchema;

// Inline goods (#64): an alternative to `pedimento_id` for shipments that
// never went through pedimento upload/parsing. `clave_prod_serv`/
// `bienes_transp` are optional — if the caller doesn't supply them and no
// `productos` mapping exists for a supplied `fraccion`, the SAT code is left
// unresolved unless `auto_classify` (#65) is set.
const mercanciaInlineSchema = z.object({
  descripcion: z.string(),
  cantidad: z.number(),
  peso_kg: z.number(),
  clave_unidad: z.string().optional().meta({ description: 'SAT c_ClaveUnidad key, e.g. "H87". Defaults to "H87" when omitted.' }),
  fraccion: z.string().optional().meta({ description: "Fracción arancelaria, if the caller has it — used to look up (or auto_classify) the org's productos mapping." }),
  clave_prod_serv: z.string().optional().meta({ description: "SAT c_ClaveProdServ key. Also reused as BienesTransp unless bienes_transp is given." }),
  bienes_transp: z.string().optional().meta({ description: "SAT c_BienesTransp key, if it differs from clave_prod_serv." }),
  valor_mercancia: z.number().optional(),
  moneda: z.string().optional(),
});

const createCartaPorteSchema = z.object({
  cliente_id: z.string().optional(),
  cliente: clienteInlineSchema.optional(),
  direccion_origen_id: z.string().optional(),
  direccion_origen: direccionInlineSchema.optional(),
  direccion_destino_id: z.string().optional(),
  direccion_destino: direccionInlineSchema.optional(),
  vehiculo_id: z.string().optional(),
  vehiculo: vehiculoInlineSchema.optional(),
  chofer_id: z.string().optional(),
  chofer: choferInlineSchema.optional(),
  pedimento_id: z.string().optional(),
  mercancias: z
    .array(mercanciaInlineSchema)
    .min(1)
    .optional()
    .meta({ description: "Inline mercancía data, mutually exclusive with pedimento_id (#64)." }),
  auto_classify: z.boolean().optional().meta({
    description:
      "When true, inline mercancías (mercancias[]) missing a resolvable clave_prod_serv are classified " +
      "via an automated classification pipeline and persisted to productos when keyed by fraccion. Adds " +
      "latency to the request, so it defaults to false. Only applies to the inline mercancías path.",
  }),
  tipo_figura: z.string().meta({ description: 'SAT c_FiguraTransporte key, e.g. "01" (Operador).' }),
  fecha_hora_salida: z.string().meta({ description: "AAAA-MM-DDThh:mm:ss, the Origen ubicación's departure time." }),
  fecha_hora_llegada: z.string().meta({ description: "AAAA-MM-DDThh:mm:ss, the Destino ubicación's arrival time." }),
  distancia_recorrida_km: z.number(),
  external_reference: z.string().optional().meta({
    description:
      "This app's own field, not a stamping-provider one — a caller-supplied trip/operation id, echoed back on " +
      "every response for this resource and filterable via GET /facturas?external_reference=. Independent " +
      "of Idempotency-Key, which only dedups a single request.",
  }),
});

type CreateCartaPorteBody = z.infer<typeof createCartaPorteSchema>;

// Every party field is exclusively an `*_id` reference or fully inline data
// (#63) — reject a request that supplies both or neither for a given field.
function validateExclusive(idValue: unknown, inlineValue: unknown, field: string): NextResponse | null {
  const hasId = idValue !== undefined;
  const hasInline = inlineValue !== undefined;
  if (hasId && hasInline) {
    return apiError(400, "invalid_parameter", `${field} and its inline equivalent cannot both be provided`, [
      { field, issue: "conflict" },
    ]);
  }
  if (!hasId && !hasInline) {
    return apiError(400, "invalid_parameter", `${field} or its inline equivalent is required`, [
      { field, issue: "missing" },
    ]);
  }
  return null;
}

function validateBody(body: CreateCartaPorteBody): NextResponse | null {
  return (
    validateExclusive(body.pedimento_id, body.mercancias, "pedimento_id") ??
    validateExclusive(body.cliente_id, body.cliente, "cliente_id") ??
    validateExclusive(body.direccion_origen_id, body.direccion_origen, "direccion_origen_id") ??
    validateExclusive(body.direccion_destino_id, body.direccion_destino, "direccion_destino_id") ??
    validateExclusive(body.vehiculo_id, body.vehiculo, "vehiculo_id") ??
    validateExclusive(body.chofer_id, body.chofer, "chofer_id")
  );
}

const invoiceResponseSchema = z.record(z.string(), z.unknown());

registry.registerPath({
  method: "post",
  path: "/cartas-porte",
  summary: "Generate a draft Carta Porte factura from reference ids or inline party/goods data",
  description:
    "Builds a Complemento Carta Porte and a draft (unstamped) Traslado factura from cliente/direcciones/" +
    "vehículo/chofer (each of which may be an existing `*_id` reference or fully inline data) plus mercancía " +
    "data, which is either `pedimento_id` (reusing the pedimento's partidas the same way the internal UI's " +
    "Mercancias prefill does) or inline `mercancias[]` for shipments with no pedimento at all — the two are " +
    "mutually exclusive. The org's productos mapping (or, with `auto_classify: true`, automated " +
    "classification) resolves BienesTransp/product_key. Does not stamp — use POST /facturas/{id}/stamp afterward.",
  tags: ["facturas"],
  security: [{ [bearerAuth.name]: [] }],
  request: { body: { content: { "application/json": { schema: createCartaPorteSchema } } } },
  responses: {
    201: {
      description: "The created draft invoice, raw shape from the stamping provider, with its Carta Porte complement attached.",
      content: { "application/json": { schema: invoiceResponseSchema } },
    },
    ...invalidParameterResponse,
    ...unauthorizedResponse,
    422: {
      description: "Idempotency-Key reused with a different request body.",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

export async function POST(req: NextRequest) {
  const auth = await requireApiKeyAuth(req);
  if (auth instanceof NextResponse) return auth;

  const idempotencyKey = req.headers.get("idempotency-key");
  if (!idempotencyKey) {
    return apiError(400, "invalid_parameter", "Idempotency-Key header is required", [
      { field: "Idempotency-Key", issue: "missing" },
    ]);
  }

  const rawBody = await req.text();
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return apiError(400, "invalid_parameter", "Request body must be valid JSON");
  }

  const parsed = createCartaPorteSchema.safeParse(json);
  if (!parsed.success) {
    return invalidBodyError(parsed.error, "Invalid cartas-porte payload");
  }
  const body = parsed.data;

  const exclusivityError = validateBody(body);
  if (exclusivityError) return exclusivityError;

  const client = await getOrgFacturapiClient(auth.orgId);
  if (client instanceof NextResponse) return client;

  return withIdempotency(req, auth.orgId, rawBody, async () => {
    const built = await buildCartaPorteFacturaBody(auth.orgId, client, body);
    if (built instanceof NextResponse) return { status: built.status, body: await built.json() };

    try {
      const inv = await client.post<{ id: string }>("invoices", built.invoiceBody);
      await withOrg(auth.orgId, (tx) =>
        saveFactura(tx, auth.orgId, inv, built.pedimentoId, body.external_reference ?? null)
      );
      return { status: 201, body: { ...inv, external_reference: body.external_reference ?? null } };
    } catch (e) {
      if (e instanceof FacturapiError) {
        return { status: e.status, body: { error: { code: "facturapi_error", message: e.message } } };
      }
      throw e;
    }
  });
}
