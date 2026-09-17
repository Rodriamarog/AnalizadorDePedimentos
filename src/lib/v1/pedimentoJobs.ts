import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { pedimentoJobs, productos, satClaves } from "@/lib/db/schema";
import { withOrg } from "@/lib/db/withOrg";
import { parseAndPersistPedimento, PedimentoUploadError } from "@/lib/pedimentoUpload";
import { runAutomap } from "@/lib/automap";
import { getOrgFacturapiClient } from "@/lib/orgFacturapi";
import { productosByFraccion } from "./productosLookup";

export type PedimentoJob = typeof pedimentoJobs.$inferSelect;

// Classifies any fracciones among `partidas` that don't already have a
// `productos` mapping for this org, via the same Gemini automap pipeline
// the internal `/api/facturas/automap` route uses, and persists the results
// into `productos` — mirrors that route's `classifyFraccionRows` (#61),
// duplicated here rather than shared since the internal route also needs to
// return per-row results to the caller, which this job doesn't.
async function classifyUnmappedFracciones(
  orgId: string,
  partidas: { fraccion: string; descripcion: string }[]
): Promise<void> {
  const fracciones = [...new Set(partidas.map((p) => p.fraccion))];
  if (fracciones.length === 0) return;

  // parseAndPersistPedimento already inserts a placeholder `productos` row
  // per fracción on upload (claveProdServ: null, just to prefill unitKey) —
  // a row existing is not the same as a row being *mapped*, so this checks
  // claveProdServ itself rather than mere row presence (same distinction
  // the internal /api/facturas/automap route's classifyFraccionRows makes).
  const existing = await withOrg(orgId, (tx) => productosByFraccion(tx, orgId, fracciones));
  const alreadyMapped = new Set(existing.filter((p) => p.claveProdServ).map((p) => p.fraccion));
  const unmapped = fracciones.filter((f) => !alreadyMapped.has(f));
  if (unmapped.length === 0) return;

  const facturapiClient = await getOrgFacturapiClient(orgId);
  if (facturapiClient instanceof NextResponse) return;

  const toClassify = unmapped.map((fraccion) => ({
    fraccion,
    descripcion: partidas.find((p) => p.fraccion === fraccion)!.descripcion,
  }));
  const { classifications } = await runAutomap(toClassify, new Set(), facturapiClient);

  await withOrg(orgId, async (tx) => {
    for (const c of classifications) {
      if (!c.key) continue;
      const orig = toClassify.find((p) => p.fraccion === c.fraccion)!;

      const [catalogRow] = await tx
        .select({ description: satClaves.description })
        .from(satClaves)
        .where(eq(satClaves.key, c.key))
        .limit(1);
      const confirmedDesc = catalogRow?.description ?? c.description ?? "";
      let confidence: string = c.confidence;
      if (!catalogRow && confidence === "high") confidence = "medium";

      await tx
        .insert(productos)
        .values({
          orgId,
          fraccion: c.fraccion,
          descripcion: orig.descripcion,
          claveProdServ: c.key,
          descripcionSat: confirmedDesc,
          confidence,
        })
        .onConflictDoUpdate({
          target: [productos.orgId, productos.fraccion],
          set: { claveProdServ: c.key, descripcionSat: confirmedDesc, confidence },
        });
    }
  });
}

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
export async function runPedimentoJob(
  jobId: string,
  orgId: string,
  file: File,
  autoClassify = false
): Promise<void> {
  await withOrg(orgId, (tx) =>
    tx.update(pedimentoJobs).set({ status: "processing" }).where(eq(pedimentoJobs.id, jobId))
  );

  try {
    const { pedimento, partidas, duplicate } = await parseAndPersistPedimento(orgId, file);

    // The pedimento itself is already parsed and persisted at this point —
    // a Gemini/automap failure (rate limit, network, missing key) must not
    // turn a successful upload into a `failed` job with no pedimentoId, so
    // this runs outside the try/catch that guards the parse+persist step
    // and only best-effort logs instead of propagating.
    if (autoClassify) {
      try {
        await classifyUnmappedFracciones(orgId, partidas);
      } catch (e) {
        console.error(`[pedimentoJobs] auto_classify failed for job ${jobId}, upload still succeeds:`, e);
      }
    }

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
