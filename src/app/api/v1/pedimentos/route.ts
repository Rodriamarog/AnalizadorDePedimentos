import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { z } from "zod";
import { requireApiKeyAuth } from "@/lib/v1/auth";
import { apiError } from "@/lib/v1/envelope";
import { bearerAuth, ErrorSchema, registry, unauthorizedResponse, invalidParameterResponse } from "@/lib/v1/openapi";
import { createPedimentoJob, runPedimentoJob } from "@/lib/v1/pedimentoJobs";
import { isArchivoMFilename, isPdfFilename, MAX_UPLOAD_BYTES } from "@/lib/pedimentoUpload";

const jobSchema = z.object({
  job_id: z.string(),
  status: z.literal("pending"),
  created_at: z.string(),
});

registry.registerPath({
  method: "post",
  path: "/pedimentos",
  summary: "Upload a pedimento (PDF or Archivo M) for async parsing",
  security: [{ [bearerAuth.name]: [] }],
  request: {
    body: {
      content: {
        "multipart/form-data": {
          schema: z.object({ file: z.string().meta({ format: "binary", description: "PDF or Archivo M file." }) }),
        },
      },
    },
  },
  responses: {
    202: {
      description: "Upload accepted; poll GET /jobs/{job_id} for the result.",
      content: { "application/json": { schema: jobSchema } },
    },
    ...invalidParameterResponse,
    ...unauthorizedResponse,
    413: {
      description: "File exceeds the 20MB upload limit.",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

export async function POST(req: NextRequest) {
  const auth = await requireApiKeyAuth(req);
  if (auth instanceof NextResponse) return auth;

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return apiError(400, "invalid_parameter", "No file was received", [{ field: "file", issue: "missing" }]);
  }

  if (!isPdfFilename(file.name) && !isArchivoMFilename(file.name)) {
    return apiError(400, "invalid_parameter", "Only PDF or Archivo M files are accepted", [
      { field: "file", issue: "unsupported_type" },
    ]);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return apiError(413, "file_too_large", "The file exceeds the maximum upload size (20MB)", [
      { field: "file", issue: "too_large" },
    ]);
  }

  const job = await createPedimentoJob(auth.orgId, file.name);

  // `after()` (next/server) schedules work post-response without blocking
  // the 202 — supported for both the Node.js server and Docker container
  // deploy targets this app actually runs on (self-hosted, not serverless;
  // see node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md's
  // platform-support table), so no `waitUntil` shim is needed here.
  after(() => runPedimentoJob(job.id, auth.orgId, file));

  return NextResponse.json(
    { job_id: job.id, status: "pending", created_at: job.createdAt.toISOString() },
    { status: 202 }
  );
}
