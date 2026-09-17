// One-off verification of the /api/v1/pedimentos async job pipeline (#52) —
// createPedimentoJob + runPedimentoJob, the same functions the POST route
// and job runner use. Exercises: a fresh upload resolving `done` with a
// pedimento_id, re-uploading the same file resolving `done` with
// `duplicate: true` pointing at the same pedimento, an unparseable file
// resolving `failed`, and GET /api/v1/pedimentos/{id} returning full
// snake_case field parity with no org id or internal FK ids leaked.
//
// Run with: tsx --env-file=.env.local scripts/test-api-v1-pedimento-job.ts <path-to-sample.pdf>
import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { db } from "../src/lib/db/client";
import { apiKeys, apiRateLimits, organizations, pedimentos, partidas, productos, pedimentoJobs } from "../src/lib/db/schema";
import { withOrg } from "../src/lib/db/withOrg";
import { hashApiKey } from "../src/lib/v1/auth";
import { createPedimentoJob, runPedimentoJob } from "../src/lib/v1/pedimentoJobs";
import { GET as getPedimento } from "../src/app/api/v1/pedimentos/[id]/route";

const RAW_KEY = "pdm_test_pedimento-job-script-key";

const PDF_PATH = process.argv[2];
const ORG = "org_pedimento_job_test";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

async function cleanup() {
  await withOrg(ORG, async (tx) => {
    await tx.delete(pedimentoJobs).where(eq(pedimentoJobs.orgId, ORG));
    const rows = await tx.select().from(pedimentos).where(eq(pedimentos.orgId, ORG));
    for (const p of rows) {
      await tx.delete(partidas).where(eq(partidas.pedimentoId, p.id));
      await tx.delete(pedimentos).where(eq(pedimentos.id, p.id));
    }
    await tx.delete(productos).where(eq(productos.orgId, ORG));
    await tx.delete(apiRateLimits).where(eq(apiRateLimits.orgId, ORG));
  });
  await db.delete(apiKeys).where(eq(apiKeys.orgId, ORG));
  await db.delete(organizations).where(eq(organizations.id, ORG));
}

async function pollUntilFinished(jobId: string) {
  for (let i = 0; i < 50; i++) {
    const [job] = await withOrg(ORG, (tx) => tx.select().from(pedimentoJobs).where(eq(pedimentoJobs.id, jobId)));
    if (job.status === "done" || job.status === "failed") return job;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`job ${jobId} never finished`);
}

async function main() {
  if (!PDF_PATH) throw new Error("usage: tsx scripts/test-api-v1-pedimento-job.ts <path-to-sample.pdf>");

  await cleanup();
  await db.insert(organizations).values({ id: ORG }).onConflictDoNothing();
  await db.insert(apiKeys).values({ orgId: ORG, keyHash: hashApiKey(RAW_KEY), mode: "test" });

  const pdfBuffer = await readFile(PDF_PATH);
  const makeFile = () => new File([pdfBuffer], "sample.pdf", { type: "application/pdf" });

  // 1. Fresh upload: job resolves `done` with a pedimento_id.
  const job1 = await createPedimentoJob(ORG, "sample.pdf");
  assert(job1.status === "pending", "job starts pending");
  await runPedimentoJob(job1.id, ORG, makeFile());
  const finished1 = await pollUntilFinished(job1.id);
  assert(finished1.status === "done", "first upload resolves done");
  assert(!finished1.duplicate, "first upload is not a duplicate");
  assert(!!finished1.pedimentoId, "done job points at a pedimento_id");

  // 2. Re-upload the same file: `done` with `duplicate: true`, same pedimento_id.
  const job2 = await createPedimentoJob(ORG, "sample.pdf");
  await runPedimentoJob(job2.id, ORG, makeFile());
  const finished2 = await pollUntilFinished(job2.id);
  assert(finished2.status === "done", "duplicate upload still resolves done, not an error");
  assert(finished2.duplicate === true, "duplicate upload is flagged");
  assert(finished2.pedimentoId === finished1.pedimentoId, "duplicate points at the original pedimento_id");

  // 3. Unparseable file: `failed` with an error.
  const job3 = await createPedimentoJob(ORG, "garbage.pdf");
  await runPedimentoJob(job3.id, ORG, new File([Buffer.from("not a real pdf")], "garbage.pdf", { type: "application/pdf" }));
  const finished3 = await pollUntilFinished(job3.id);
  assert(finished3.status === "failed", "unparseable file resolves failed");
  assert(!!finished3.errorCode, "failed job carries an error code");

  // 4. GET /api/v1/pedimentos/{id} — full snake_case field parity, no
  // org id or internal FK ids leaked.
  const req = new NextRequest(`http://localhost/api/v1/pedimentos/${finished1.pedimentoId}`, {
    headers: { Authorization: `Bearer ${RAW_KEY}` },
  });
  const res = await getPedimento(req, { params: Promise.resolve({ id: finished1.pedimentoId! }) });
  assert(res.status === 200, "GET /pedimentos/{id} succeeds with a valid API key");
  const body = await res.json();
  assert(body.pedimento_id === finished1.pedimentoId, "response uses pedimento_id (renamed from id)");
  assert(typeof body.pedimento_num === "string" && body.pedimento_num.length > 0, "snake_case pedimento_num present");
  assert(typeof body.source_filename === "string", "pdfFilename is renamed to source_filename");
  assert(Array.isArray(body.partidas), "partidas array present");
  assert(body.org_id === undefined && body.orgId === undefined, "no org id leaked");
  assert(body.id === undefined, "internal id field not leaked (renamed to pedimento_id)");
  if (body.partidas.length > 0) {
    const p = body.partidas[0];
    assert(p.id === undefined && p.pedimentoId === undefined && p.orgId === undefined, "no internal FK ids leaked on partidas");
    assert(typeof p.fraccion === "string", "partida snake_case fields present");
  }

  await cleanup();
  console.log(
    "Pedimento job pipeline verified: fresh upload -> done, re-upload -> done+duplicate (same pedimento_id), unparseable file -> failed."
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
