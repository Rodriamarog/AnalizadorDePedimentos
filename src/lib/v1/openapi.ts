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

export function generateOpenApiDocument() {
  const generator = new OpenApiGeneratorV31(registry.definitions);
  return generator.generateDocument({
    openapi: "3.1.0",
    info: {
      title: "Pedimentos API",
      version: "v1",
      description: "Public API for Pedimentos — SAT catalog search and, later, factura issuance.",
    },
    servers: [{ url: "/api/v1" }],
  });
}
