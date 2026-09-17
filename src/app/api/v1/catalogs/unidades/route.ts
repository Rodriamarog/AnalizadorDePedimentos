import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiKeyAuth } from "@/lib/v1/auth";
import { apiList } from "@/lib/v1/envelope";
import { bearerAuth, registry, satCatalogResultSchema, unauthorizedResponse } from "@/lib/v1/openapi";
import { searchSatUnidades } from "@/lib/satSearch";

const responseSchema = z.object({ data: z.array(satCatalogResultSchema) });

registry.registerPath({
  method: "get",
  path: "/catalogs/unidades",
  summary: "Search SAT unidades de medida (c_UnidadMedida)",
  security: [{ [bearerAuth.name]: [] }],
  request: {
    query: z.object({
      q: z.string().optional().meta({ description: "Free-text or key-prefix search term." }),
    }),
  },
  responses: {
    200: {
      description: "Matching unidades, best match first.",
      content: { "application/json": { schema: responseSchema } },
    },
    ...unauthorizedResponse,
  },
});

export async function GET(req: NextRequest) {
  const auth = await requireApiKeyAuth(req);
  if (auth instanceof NextResponse) return auth;

  const q = req.nextUrl.searchParams.get("q") ?? "";
  const data = await searchSatUnidades(q);
  return apiList(data);
}
