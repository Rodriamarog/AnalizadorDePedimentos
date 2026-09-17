import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiKeyAuth } from "@/lib/v1/auth";
import { apiError } from "@/lib/v1/envelope";
import { bearerAuth, ErrorSchema, registry, unauthorizedResponse, invalidParameterResponse } from "@/lib/v1/openapi";
import { uploadFacturapiCsd } from "@/lib/uploadFacturapiCsd";

const csdResponseSchema = z.object({
  csd_uploaded_at: z.string().meta({ description: "ISO 8601 timestamp of the successful upload." }),
});

registry.registerPath({
  method: "post",
  path: "/csd",
  summary: "Upload the org's CSD (cer/key/password) for stamping",
  description:
    "Proxies straight through to FacturAPI's certificate endpoint using the org's own key — same " +
    "logic the internal dashboard's CSD upload uses. Nothing but a success timestamp is ever persisted " +
    "locally; the cert, key, and password never touch this app's database or disk.",
  tags: ["csd"],
  security: [{ [bearerAuth.name]: [] }],
  request: {
    body: {
      content: {
        "multipart/form-data": {
          schema: z.object({
            cer: z.string().meta({ format: "binary", description: "The .cer certificate file." }),
            key: z.string().meta({ format: "binary", description: "The .key private key file." }),
            password: z.string().meta({ description: "The private key's password." }),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "The CSD was uploaded successfully.",
      content: { "application/json": { schema: csdResponseSchema } },
    },
    ...invalidParameterResponse,
    ...unauthorizedResponse,
    502: {
      description: "FacturAPI rejected the certificate/key/password, or couldn't be reached.",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

export async function POST(req: NextRequest) {
  const auth = await requireApiKeyAuth(req);
  if (auth instanceof NextResponse) return auth;

  const form = await req.formData();
  const cer = form.get("cer");
  const key = form.get("key");
  const password = form.get("password");
  if (!(cer instanceof File) || !(key instanceof File) || typeof password !== "string" || !password) {
    return apiError(400, "invalid_parameter", "cer, key, and password are required", [
      { issue: "missing" },
    ]);
  }

  const result = await uploadFacturapiCsd(auth.orgId, cer, key, password);
  if (result.csdUploadedAt === null) {
    return apiError(result.status, "facturapi_error", result.error);
  }

  return NextResponse.json({ csd_uploaded_at: result.csdUploadedAt.toISOString() });
}
