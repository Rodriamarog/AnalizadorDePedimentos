// One-off verification of #60 (GET /pedimentos/{id} SAT-code enrichment)
// and #61 (POST /pedimentos's opt-in `auto_classify`) — same
// "self-contained script with its own test org, cleans up after itself"
// convention as scripts/test-api-v1-pedimento-job.ts.
//
// Run with: tsx --env-file=.env.local scripts/test-api-v1-pedimento-enrichment.ts <path-to-sample.pdf>
import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { db } from "../src/lib/db/client";
import { apiKeys, apiRateLimits, organizations, pedimentos, partidas, productos, pedimentoJobs } from "../src/lib/db/schema";
import { encryptSecret } from "../src/lib/crypto";
import { withOrg } from "../src/lib/db/withOrg";
import { hashApiKey } from "../src/lib/v1/auth";
import { createPedimentoJob, runPedimentoJob } from "../src/lib/v1/pedimentoJobs";
import { umcToUnitKey } from "../src/lib/umc";
import { GET as getPedimento } from "../src/app/api/v1/pedimentos/[id]/route";

const RAW_KEY = "pdm_test_pedimento-enrichment-script-key";
const ORG = "org_pedimento_enrichment_test";

const PDF_PATH = process.argv[2];

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
  for (let i = 0; i < 600; i++) {
    const [job] = await withOrg(ORG, (tx) => tx.select().from(pedimentoJobs).where(eq(pedimentoJobs.id, jobId)));
    if (job.status === "done" || job.status === "failed") return job;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`job ${jobId} never finished`);
}

async function main() {
  if (!PDF_PATH) throw new Error("usage: tsx scripts/test-api-v1-pedimento-enrichment.ts <path-to-sample.pdf>");
  const testKey = process.env.FACTURAPI_TEST_API_KEY;
  if (!testKey) throw new Error("FACTURAPI_TEST_API_KEY not set");
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not set");

  await cleanup();
  await db.insert(organizations).values({ id: ORG, facturapiKeyEncrypted: encryptSecret(testKey) });
  await db.insert(apiKeys).values({ orgId: ORG, keyHash: hashApiKey(RAW_KEY), mode: "test" });

  const pdfBuffer = await readFile(PDF_PATH);

  // ── #60: GET /pedimentos/{id} enrichment ──────────────────────────────
  const job1 = await createPedimentoJob(ORG, "sample.pdf");
  await runPedimentoJob(job1.id, ORG, new File([pdfBuffer], "sample.pdf", { type: "application/pdf" }));
  const finished1 = await pollUntilFinished(job1.id);
  assert(finished1.status === "done", "upload resolves done");
  const pedimentoId = finished1.pedimentoId!;

  const rows = await withOrg(ORG, (tx) => tx.select().from(partidas).where(eq(partidas.pedimentoId, pedimentoId)));
  assert(rows.length > 0, "pedimento has at least one partida");
  const mappedPartida = rows[0];
  const unmappedFraccion = rows.find((p) => p.fraccion !== mappedPartida.fraccion)?.fraccion;

  // Seed a producto mapping for exactly one fracción, so we can assert both
  // the "mapped" and "not mapped" shapes in the same response. Upload
  // already left a placeholder row (claveProdServ: null) for every
  // fracción, so this is an upsert, not a plain insert.
  await withOrg(ORG, (tx) =>
    tx
      .insert(productos)
      .values({
        orgId: ORG,
        fraccion: mappedPartida.fraccion,
        descripcion: mappedPartida.descripcion,
        claveProdServ: "25172300",
        descripcionSat: "Tapas",
        confidence: "high",
      })
      .onConflictDoUpdate({
        target: [productos.orgId, productos.fraccion],
        set: { claveProdServ: "25172300", descripcionSat: "Tapas", confidence: "high" },
      })
  );

  const getReq = new NextRequest(`http://localhost/api/v1/pedimentos/${pedimentoId}`, {
    headers: { Authorization: `Bearer ${RAW_KEY}` },
  });
  const getRes = await getPedimento(getReq, { params: Promise.resolve({ id: pedimentoId }) });
  assert(getRes.status === 200, "GET /pedimentos/{id} succeeds");
  const body = await getRes.json();

  const mappedOut = body.partidas.find((p: { fraccion: string }) => p.fraccion === mappedPartida.fraccion);
  assert(mappedOut.clave_prod_serv === "25172300", "mapped partida returns its clave_prod_serv");
  assert(mappedOut.clave_prod_serv_description === "Tapas", "mapped partida returns its description");
  assert(mappedOut.clave_prod_serv_confidence === "high", "mapped partida returns its confidence");
  assert(mappedOut.clave_prod_serv_mapped === true, "mapped partida signals mapped: true");
  assert(mappedOut.clave_unidad === umcToUnitKey(mappedPartida.umc), "mapped partida's clave_unidad matches umcToUnitKey");

  if (unmappedFraccion) {
    const unmappedOut = body.partidas.find((p: { fraccion: string }) => p.fraccion === unmappedFraccion);
    assert(unmappedOut.clave_prod_serv === null, "unmapped partida's clave_prod_serv is null");
    assert(unmappedOut.clave_prod_serv_mapped === false, "unmapped partida signals mapped: false, not a bare null");
    assert(typeof unmappedOut.clave_unidad === "string" && unmappedOut.clave_unidad.length > 0, "unmapped partida still has a clave_unidad");
  } else {
    console.log("  (sample pedimento has only one distinct fracción — skipping the not-mapped assertion)");
  }

  // ── #61: POST /pedimentos auto_classify=true classifies unmapped
  // fracciones via the real automap pipeline before the job is done. ──────
  await withOrg(ORG, (tx) => tx.delete(productos).where(eq(productos.orgId, ORG)));
  const job2 = await createPedimentoJob(ORG, "sample.pdf");
  await runPedimentoJob(job2.id, ORG, new File([pdfBuffer], "sample.pdf", { type: "application/pdf" }), true);
  const finished2 = await pollUntilFinished(job2.id);
  assert(finished2.status === "done", "auto_classify upload still resolves done");

  const mapped = await withOrg(ORG, (tx) =>
    tx.select().from(productos).where(eq(productos.orgId, ORG))
  );
  assert(mapped.length > 0, "auto_classify populated at least one producto mapping");
  console.log(
    `  auto_classify mapped ${mapped.length} fracción(es): ${mapped.map((m) => `${m.fraccion}->${m.claveProdServ}`).join(", ")}`
  );

  await cleanup();
  console.log("Pedimento enrichment verified: GET /pedimentos/{id} SAT codes (#60) and auto_classify (#61).");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
