import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiKeyAuth } from "@/lib/v1/auth";
import { apiError } from "@/lib/v1/envelope";
import { bearerAuth, ErrorSchema, registry, unauthorizedResponse } from "@/lib/v1/openapi";
import { pedimentoJobs } from "@/lib/db/schema";
import { withOrg } from "@/lib/db/withOrg";

const jobResponseSchema = z.object({
  job_id: z.string(),
  status: z.enum(["pending", "processing", "done", "failed"]),
  created_at: z.string(),
  finished_at: z.string().optional(),
  pedimento_id: z.string().optional(),
  duplicate: z.boolean().optional(),
  error: z.object({ code: z.string(), message: z.string() }).optional(),
});

registry.registerPath({
  method: "get",
  path: "/jobs/{job_id}",
  summary: "Poll a pedimento upload job's status",
  security: [{ [bearerAuth.name]: [] }],
  request: {
    params: z.object({ job_id: z.string() }),
  },
  responses: {
    200: {
      description: "The job's current status.",
      content: { "application/json": { schema: jobResponseSchema } },
    },
    404: {
      description: "No job with that id for this org.",
      content: { "application/json": { schema: ErrorSchema } },
    },
    ...unauthorizedResponse,
  },
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ job_id: string }> }) {
  const auth = await requireApiKeyAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { job_id } = await params;

  const job = await withOrg(auth.orgId, async (tx) => {
    const [row] = await tx.select().from(pedimentoJobs).where(eq(pedimentoJobs.id, job_id)).limit(1);
    return row;
  });

  if (!job) {
    return apiError(404, "not_found", "No job with that id");
  }

  const body: Record<string, unknown> = {
    job_id: job.id,
    status: job.status,
    created_at: job.createdAt.toISOString(),
  };
  if (job.finishedAt) body.finished_at = job.finishedAt.toISOString();
  if (job.status === "done") {
    body.pedimento_id = job.pedimentoId;
    body.duplicate = job.duplicate;
  }
  if (job.status === "failed") {
    body.error = { code: job.errorCode, message: job.errorMessage };
  }

  return NextResponse.json(body);
}
