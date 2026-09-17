import { eq } from "drizzle-orm";
import { pedimentoJobs } from "@/lib/db/schema";
import { withOrg } from "@/lib/db/withOrg";
import { parseAndPersistPedimento, PedimentoUploadError } from "@/lib/pedimentoUpload";

export type PedimentoJob = typeof pedimentoJobs.$inferSelect;

// Creates the `pending` job row for `POST /api/v1/pedimentos` (#52). Synchronous
// validation (file type, size) has already happened in the route before this
// is called — this only records the job so the client can start polling.
export async function createPedimentoJob(orgId: string, filename: string): Promise<PedimentoJob> {
  return withOrg(orgId, async (tx) => {
    const [job] = await tx
      .insert(pedimentoJobs)
      .values({ orgId, status: "pending", sourceFilename: filename })
      .returning();
    return job;
  });
}

// Runs the actual parse + persist work for a job created by
// createPedimentoJob, and drives the job through processing -> done/failed.
// Fired without awaiting from the route handler (see
// src/app/api/v1/pedimentos/route.ts) — not a request-scoped call, so it's
// exercised directly (not via HTTP) by scripts/test-api-v1-pedimento-job.ts,
// same convention as the rest of this app's integration scripts.
export async function runPedimentoJob(jobId: string, orgId: string, file: File): Promise<void> {
  await withOrg(orgId, (tx) =>
    tx.update(pedimentoJobs).set({ status: "processing" }).where(eq(pedimentoJobs.id, jobId))
  );

  try {
    const { pedimento, duplicate } = await parseAndPersistPedimento(orgId, file);
    await withOrg(orgId, (tx) =>
      tx
        .update(pedimentoJobs)
        .set({
          status: "done",
          pedimentoId: pedimento.id,
          duplicate,
          finishedAt: new Date(),
        })
        .where(eq(pedimentoJobs.id, jobId))
    );
  } catch (e) {
    const code = e instanceof PedimentoUploadError ? "unparseable_file" : "internal_error";
    const message = e instanceof Error ? e.message : String(e);
    await withOrg(orgId, (tx) =>
      tx
        .update(pedimentoJobs)
        .set({
          status: "failed",
          errorCode: code,
          errorMessage: message,
          finishedAt: new Date(),
        })
        .where(eq(pedimentoJobs.id, jobId))
    );
  }
}
