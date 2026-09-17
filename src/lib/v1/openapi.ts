import { OpenAPIRegistry, OpenApiGeneratorV31 } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

export const registry = new OpenAPIRegistry();

export const bearerAuth = registry.registerComponent("securitySchemes", "bearerAuth", {
  type: "http",
  scheme: "bearer",
  description: "A key issued via scripts/issue-api-key.ts, e.g. `Authorization: Bearer <key>`.",
});

// Named (not `registry.register()`-ed — that path needs `extendZodWithOpenApi`,
// which Turbopack's per-route-handler chunking breaks: the patched
// `ZodType.prototype` in one chunk isn't visible in another) via zod's own
// `.meta({ id })`, which zod-to-openapi's generator picks up natively.
export const ErrorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.array(z.object({ field: z.string().optional(), issue: z.string() })).optional(),
    }),
  })
  .meta({ id: "Error", description: "The standard /api/v1 error envelope." });

export const satCatalogResultSchema = z.object({
  key: z.string().meta({ example: "01010101" }),
  description: z.string().meta({ example: "Live animals" }),
});

// Every v1 route requires a key, so every route documents 401 — this is the
// shared shape, individual routes add their 200 (and 400, only if they
// actually validate something; see parsePagination()'s error path).
export const unauthorizedResponse = {
  401: {
    description: "Missing or invalid API key.",
    content: { "application/json": { schema: ErrorSchema } },
  },
};

export const invalidParameterResponse = {
  400: {
    description: "Invalid request parameters.",
    content: { "application/json": { schema: ErrorSchema } },
  },
};

// A prose page with no operations of its own (#58) — Scalar renders a
// top-level `tags` entry with a `description` as its own sidebar page even
// when nothing references it via `x-tagGroups`' member list below, which is
// how the "Guides" section gets its content without a corresponding route.
const GUIDES_MARKDOWN = `
## Auth setup

Every \`/api/v1\` request needs \`Authorization: Bearer <key>\`. Keys are issued
out of band (there's no self-serve UI yet) as \`pdm_<mode>_<hex>\`, and are
only ever shown once at issuance time — store it immediately.

There's a flat rate limit of 60 requests/minute per org, regardless of plan
or key mode; a request over the limit gets back \`429 rate_limit_exceeded\`.

## Sandbox mode

A key's \`<mode>\` segment is either \`test\` or \`live\`, mirroring the mode of
the FacturAPI key behind your org. \`test\`-mode keys hit FacturAPI's sandbox —
facturas created with one are never sent to the SAT and cost nothing, so
build and verify your integration there before switching to a \`live\` key.

## Common workflows

**Upload a pedimento, then poll for the result**

1. \`POST /pedimentos\` with the PDF or Archivo M as \`multipart/form-data\` —
   returns \`202\` with a \`job_id\` immediately; parsing happens async.
2. \`GET /jobs/{job_id}\` until \`status\` is \`done\` or \`failed\`. On \`done\`, the
   response includes \`pedimento_id\`.
3. \`GET /pedimentos/{pedimento_id}\` for the full parsed record.

**Create a cliente, then issue and stamp a factura**

1. \`POST /clientes\` with \`legal_name\`, \`tax_id\`, \`tax_system\`, and
   optionally \`zip\`/\`email\`/\`emails\` — returns the cliente's \`id\` (FacturAPI's
   raw customer id, unprefixed).
2. \`POST /facturas\` with an \`Idempotency-Key\` header and a body whose
   \`customer\` is that same id — creates a draft invoice.
3. \`POST /facturas/{id}/stamp\`, also with an \`Idempotency-Key\` header — this
   is the one call that actually hits the SAT, so the key matters: a retried
   request with the same key never double-stamps.

**Create a factura with Carta Porte**

Add a \`complements\` entry of \`type: "carta_porte"\` to the same
\`POST /facturas\` body above. Reference your saved fleet data instead of
repeating it inline by setting \`vehiculo_id\`/\`chofer_id\`/\`direccion_id\`
(the \`veh_\`/\`chf_\`/\`dir_\`-prefixed ids from \`GET /vehiculos\`, \`/choferes\`,
\`/direcciones\`) on the relevant nodes — they're resolved into the full SAT
fields server-side before the invoice is created.

**Create a Traslado (type \`T\`) factura**

\`type: "T"\` is a goods-movement invoice, not a sale — it carries no
\`customer\`, no \`payment_form\`/\`payment_method\`, and no \`price\`/\`taxes\` on
line items (just \`description\`/\`product_key\`/\`unit_key\`). It's a distinct
FacturAPI request shape, not a variant of the I/E/N/P body above; the
endpoint validates \`type\` but otherwise passes the body straight through,
so a malformed Traslado request surfaces whatever error FacturAPI itself
returns. A Traslado invoice almost always needs a Carta Porte complement
(see above) to describe the movement.
`.trim();

export function generateOpenApiDocument() {
  const generator = new OpenApiGeneratorV31(registry.definitions);
  const document = generator.generateDocument({
    openapi: "3.1.0",
    info: {
      title: "Pedimentos API",
      version: "v1",
      description: "Public API for Pedimentos — SAT catalog search and, later, factura issuance.",
    },
    servers: [{ url: "/api/v1" }],
    tags: [
      { name: "guides", description: GUIDES_MARKDOWN },
      { name: "pedimentos", description: "Upload and retrieve parsed pedimentos." },
      { name: "jobs", description: "Poll async pedimento upload jobs." },
      { name: "facturas", description: "Create, retrieve, cancel, stamp, and download facturas (CFDI), including Carta Porte." },
      { name: "clientes", description: "Curated CRUD over FacturAPI customers." },
      { name: "productos", description: "Fracción → ClaveProdServ mappings." },
      { name: "vehiculos", description: "The org's fleet, for Carta Porte's Autotransporte." },
      { name: "choferes", description: "The org's drivers, for Carta Porte's FiguraTransporte." },
      { name: "direcciones", description: "Saved Origen/Destino addresses, for Carta Porte's Ubicaciones." },
      { name: "catalogs", description: "SAT catalog search (unidades de medida, claves de producto/servicio)." },
    ],
  });
  return {
    ...document,
    "x-tagGroups": [
      { name: "Guides", tags: ["guides"] },
      { name: "Pedimentos", tags: ["pedimentos", "jobs"] },
      { name: "Facturas", tags: ["facturas"] },
      { name: "Reference data", tags: ["clientes", "productos", "vehiculos", "choferes", "direcciones"] },
      { name: "Catalogs", tags: ["catalogs"] },
    ],
  };
}
