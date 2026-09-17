// One-off verification of #62 (POST /cartas-porte, reference-id path,
// draft mode) and #63 (inline cliente/direcciones/vehiculo/chofer as an
// alternative to `*_id`) — real FacturAPI sandbox + real Gemini automap,
// same "self-contained script with its own test org" convention as
// scripts/test-api-v1-facturas.ts and scripts/test-api-v1-pedimento-job.ts.
//
// Run with: tsx --env-file=.env.local scripts/test-api-v1-cartas-porte.ts <path-to-sample.pdf>
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { db } from "../src/lib/db/client";
import {
  apiKeys,
  apiRateLimits,
  choferes,
  direcciones,
  facturas,
  idempotencyKeys,
  organizations,
  partidas,
  pedimentoJobs,
  pedimentos,
  productos,
  vehiculos,
} from "../src/lib/db/schema";
import { encryptSecret } from "../src/lib/crypto";
import { withOrg } from "../src/lib/db/withOrg";
import { hashApiKey } from "../src/lib/v1/auth";
import { toPublicId } from "../src/lib/v1/publicId";
import { createPedimentoJob, runPedimentoJob } from "../src/lib/v1/pedimentoJobs";
import { POST as createVehiculo } from "../src/app/api/v1/vehiculos/route";
import { POST as createChofer } from "../src/app/api/v1/choferes/route";
import { POST as createDireccion } from "../src/app/api/v1/direcciones/route";
import { POST as createCartaPorte } from "../src/app/api/v1/cartas-porte/route";

const ORG = "org_v1_cartas_porte_test";
const RAW_KEY = "pdm_test_v1-cartas-porte-script-key";

const PDF_PATH = process.argv[2];

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

function authedReq(url: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}) {
  return new NextRequest(url, {
    method: init.method,
    body: init.body,
    headers: { Authorization: `Bearer ${RAW_KEY}`, ...init.headers },
  });
}

async function cleanup() {
  await withOrg(ORG, async (tx) => {
    await tx.delete(facturas).where(eq(facturas.orgId, ORG));
    await tx.delete(idempotencyKeys).where(eq(idempotencyKeys.orgId, ORG));
    await tx.delete(vehiculos).where(eq(vehiculos.orgId, ORG));
    await tx.delete(choferes).where(eq(choferes.orgId, ORG));
    await tx.delete(direcciones).where(eq(direcciones.orgId, ORG));
    await tx.delete(pedimentoJobs).where(eq(pedimentoJobs.orgId, ORG));
    const pedRows = await tx.select().from(pedimentos).where(eq(pedimentos.orgId, ORG));
    for (const p of pedRows) {
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
  if (!PDF_PATH) throw new Error("usage: tsx scripts/test-api-v1-cartas-porte.ts <path-to-sample.pdf>");
  const testKey = process.env.FACTURAPI_TEST_API_KEY;
  if (!testKey) throw new Error("FACTURAPI_TEST_API_KEY not set");
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not set");

  await cleanup();
  await db.insert(organizations).values({ id: ORG, facturapiKeyEncrypted: encryptSecret(testKey) });
  await db.insert(apiKeys).values({ orgId: ORG, keyHash: hashApiKey(RAW_KEY), mode: "test" });

  // ── seed a pedimento with every fracción classified (#61) ──────────────
  const pdfBuffer = await readFile(PDF_PATH);
  const job = await createPedimentoJob(ORG, "sample.pdf");
  await runPedimentoJob(job.id, ORG, new File([pdfBuffer], "sample.pdf", { type: "application/pdf" }), true);
  const finished = await pollUntilFinished(job.id);
  assert(finished.status === "done", "pedimento upload with auto_classify resolves done");
  const pedimentoId = finished.pedimentoId!;

  // ── seed a vehículo/chofer via their own POST routes (reference path) ──
  const vehRes = await createVehiculo(
    authedReq("http://localhost/api/v1/vehiculos", {
      method: "POST",
      body: JSON.stringify({
        placa: "ABC-123",
        config_vehicular: "C2",
        permiso_sct: "TPAF04",
        numero_permiso: "1234",
        peso_bruto_vehicular: "10000",
        anio_modelo_vehiculo: "2020",
        aseguradora_resp_civil: "Aseguradora Test",
        poliza_resp_civil: "POL-123",
      }),
    })
  );
  assert(vehRes.status === 201, "vehiculo created");
  const vehiculo = await vehRes.json();

  const chfRes = await createChofer(
    authedReq("http://localhost/api/v1/choferes", {
      method: "POST",
      body: JSON.stringify({ nombre: "Juan Perez", rfc: "PEJJ800101ABC", numero_licencia: "LIC123" }),
    })
  );
  assert(chfRes.status === 201, "chofer created");
  const chofer = await chfRes.json();

  const dirOrigenRes = await createDireccion(
    authedReq("http://localhost/api/v1/direcciones", {
      method: "POST",
      body: JSON.stringify({
        tipo: "origen",
        etiqueta: "Bodega Tijuana",
        rfc: "AARC700811CL4",
        estado: "BCN",
        pais: "MEX",
        codigo_postal: "22504",
      }),
    })
  );
  assert(dirOrigenRes.status === 201, "direccion origen created");
  const direccionOrigen = await dirOrigenRes.json();

  const basePayload = {
    direccion_origen_id: direccionOrigen.id,
    // direccion_destino is exercised inline below (#63).
    direccion_destino: {
      etiqueta: "Bodega CDMX",
      rfc: "AARC700811CL4",
      estado: "CMX",
      pais: "MEX",
      codigo_postal: "01000",
    },
    vehiculo_id: vehiculo.id,
    chofer_id: chofer.id,
    pedimento_id: pedimentoId,
    tipo_figura: "01",
    fecha_hora_salida: "2026-01-15T08:00:00",
    fecha_hora_llegada: "2026-01-15T20:00:00",
    distancia_recorrida_km: 250,
  };

  // 1. Missing Idempotency-Key -> 400.
  const noKeyRes = await createCartaPorte(
    authedReq("http://localhost/api/v1/cartas-porte", {
      method: "POST",
      body: JSON.stringify({ ...basePayload, cliente_id: "whatever" }),
    })
  );
  assert(noKeyRes.status === 400, "create without Idempotency-Key is rejected");

  // 2. Both cliente_id and inline cliente -> 400 invalid_parameter (XOR, #63).
  const bothRes = await createCartaPorte(
    authedReq("http://localhost/api/v1/cartas-porte", {
      method: "POST",
      headers: { "Idempotency-Key": randomUUID() },
      body: JSON.stringify({
        ...basePayload,
        cliente_id: "whatever",
        cliente: { legal_name: "X", tax_id: "X", tax_system: "616" },
      }),
    })
  );
  assert(bothRes.status === 400, "cliente_id + inline cliente together is rejected");
  const bothBody = await bothRes.json();
  assert(bothBody.error?.code === "invalid_parameter", "conflict uses the standard error envelope");

  // 3. Neither cliente_id nor inline cliente -> 400 invalid_parameter.
  const neitherRes = await createCartaPorte(
    authedReq("http://localhost/api/v1/cartas-porte", {
      method: "POST",
      headers: { "Idempotency-Key": randomUUID() },
      body: JSON.stringify(basePayload),
    })
  );
  assert(neitherRes.status === 400, "neither cliente_id nor inline cliente is rejected");

  // 4. Invalid vehiculo_id -> 400 invalid_parameter (reference resolution, #62).
  const badVehRes = await createCartaPorte(
    authedReq("http://localhost/api/v1/cartas-porte", {
      method: "POST",
      headers: { "Idempotency-Key": randomUUID() },
      body: JSON.stringify({
        ...basePayload,
        cliente: { legal_name: "Carlos Alberto Amaro Reyes", tax_id: "AARC700811CL4", tax_system: "616", zip: "22504" },
        vehiculo_id: toPublicId("veh", "00000000-0000-0000-0000-000000000000"),
      }),
    })
  );
  assert(badVehRes.status === 400, "unknown vehiculo_id is rejected");
  const badVehBody = await badVehRes.json();
  assert(badVehBody.error?.code === "invalid_parameter", "unknown reference uses the standard error envelope");
  assert(badVehBody.error?.details?.[0]?.field === "vehiculo_id", "error details point at vehiculo_id");

  // 5. Success — inline cliente + inline direccion_destino, reference-id
  // vehiculo/chofer/direccion_origen. Draft only, Carta Porte attached.
  const idemKey = randomUUID();
  const createRes = await createCartaPorte(
    authedReq("http://localhost/api/v1/cartas-porte", {
      method: "POST",
      headers: { "Idempotency-Key": idemKey },
      body: JSON.stringify({
        ...basePayload,
        cliente: { legal_name: "Carlos Alberto Amaro Reyes", tax_id: "AARC700811CL4", tax_system: "616", zip: "22504" },
      }),
    })
  );
  assert(createRes.status === 201, `create succeeds (got ${createRes.status}: ${JSON.stringify(await createRes.clone().json())})`);
  const inv = await createRes.json();
  assert(!!inv.id, "created invoice has an id");
  assert(inv.type === "T", "invoice type is T (Traslado)");
  assert(inv.status === "draft", "invoice is created as a draft, not stamped");
  const complement = inv.complements?.find((c: { type: string }) => c.type === "carta_porte");
  assert(!!complement, "invoice carries a carta_porte complement");
  assert(complement.data?.Mercancias?.Mercancia?.length > 0, "complement has at least one Mercancia");
  console.log(`  invoice ${inv.id} type=${inv.type} status=${inv.status}, ${complement.data.Mercancias.Mercancia.length} mercancía(s)`);

  const [localRow] = await withOrg(ORG, (tx) => tx.select().from(facturas).where(eq(facturas.facturapiId, inv.id)));
  assert(!!localRow, "factura saved locally");
  assert(localRow.pedimentoId === pedimentoId, "local factura links back to the pedimento");

  // 6. Replaying the same Idempotency-Key + body returns the original result.
  const replayRes = await createCartaPorte(
    authedReq("http://localhost/api/v1/cartas-porte", {
      method: "POST",
      headers: { "Idempotency-Key": idemKey },
      body: JSON.stringify({
        ...basePayload,
        cliente: { legal_name: "Carlos Alberto Amaro Reyes", tax_id: "AARC700811CL4", tax_system: "616", zip: "22504" },
      }),
    })
  );
  assert(replayRes.status === 201, "replay returns the original status");
  const replayInv = await replayRes.json();
  assert(replayInv.id === inv.id, "replay does not re-create the invoice");

  await cleanup();
  console.log(
    "POST /cartas-porte verified: Idempotency-Key required, id/inline exclusivity (#63), invalid reference -> 400, " +
      "and a successful mixed reference-id/inline create returns a draft Traslado factura with its Carta Porte " +
      "complement attached (#62)."
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
