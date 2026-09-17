// One-off: full round trip against the real FacturAPI sandbox through the
// /api/v1/facturas route handlers directly (#53) — create with
// Idempotency-Key (incl. replay dedup), list with limit/offset pagination,
// retrieve by id, cancel with motive/substitution. Mirrors
// scripts/test-facturas-full-integration.ts's setup for the internal route.
//
// Run with: tsx --env-file=.env.local scripts/test-api-v1-facturas.ts
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { db } from "../src/lib/db/client";
import { apiKeys, apiRateLimits, facturas, idempotencyKeys, organizations } from "../src/lib/db/schema";
import { encryptSecret } from "../src/lib/crypto";
import { getOrgFacturapiClient } from "../src/lib/orgFacturapi";
import { withOrg } from "../src/lib/db/withOrg";
import { hashApiKey } from "../src/lib/v1/auth";
import { GET as listFacturas, POST as createFactura } from "../src/app/api/v1/facturas/route";
import { GET as getFactura, DELETE as cancelFactura } from "../src/app/api/v1/facturas/[id]/route";

const ORG = "org_v1_facturas_test";
const RAW_KEY = "pdm_test_v1-facturas-script-key";

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
    await tx.delete(apiRateLimits).where(eq(apiRateLimits.orgId, ORG));
    await tx.delete(idempotencyKeys).where(eq(idempotencyKeys.orgId, ORG));
  });
  await db.delete(apiKeys).where(eq(apiKeys.orgId, ORG));
  await db.delete(organizations).where(eq(organizations.id, ORG));
}

async function main() {
  const testKey = process.env.FACTURAPI_TEST_API_KEY;
  if (!testKey) throw new Error("FACTURAPI_TEST_API_KEY not set");

  await cleanup();
  await db.insert(organizations).values({ id: ORG, facturapiKeyEncrypted: encryptSecret(testKey) });
  await db.insert(apiKeys).values({ orgId: ORG, keyHash: hashApiKey(RAW_KEY), mode: "test" });

  const client = await getOrgFacturapiClient(ORG);
  if (client instanceof Response) throw new Error("client did not resolve");

  const customer = await client.post<{ id: string }>("customers", {
    legal_name: "Carlos Alberto Amaro Reyes",
    tax_id: "AARC700811CL4",
    tax_system: "616",
    address: { zip: "22504" },
    email: "test@example.com",
  });

  const invoiceBody = {
    type: "I",
    customer: customer.id,
    use: "S01",
    payment_form: "03",
    payment_method: "PUE",
    items: [
      {
        quantity: 1,
        product: {
          description: "TAPA DE ALUMINIO PARA CONTENEDOR MEDIANO MARCA: KARAT",
          product_key: "25172300",
          price: 100.0,
          tax_included: false,
          taxes: [{ type: "IVA", rate: 0.16 }],
          unit_key: "H87",
        },
      },
    ],
  };

  // 1. Missing Idempotency-Key -> 400.
  const noKeyRes = await createFactura(
    authedReq("http://localhost/api/v1/facturas", { method: "POST", body: JSON.stringify(invoiceBody) })
  );
  assert(noKeyRes.status === 400, "create without Idempotency-Key is rejected");
  const noKeyBody = await noKeyRes.json();
  assert(noKeyBody.error?.code === "invalid_parameter", "missing key uses the standard error envelope");

  // 2. Restricted CFDI type -> 400.
  const badTypeRes = await createFactura(
    authedReq("http://localhost/api/v1/facturas", {
      method: "POST",
      headers: { "Idempotency-Key": randomUUID() },
      body: JSON.stringify({ ...invoiceBody, type: "T" }),
    })
  );
  assert(badTypeRes.status === 400, "type T is rejected (deferred to carta porte ticket)");

  // 3. Create with Idempotency-Key.
  const idemKey = randomUUID();
  const createRes = await createFactura(
    authedReq("http://localhost/api/v1/facturas", {
      method: "POST",
      headers: { "Idempotency-Key": idemKey },
      body: JSON.stringify(invoiceBody),
    })
  );
  assert(createRes.status === 201, "create succeeds");
  const inv = await createRes.json();
  assert(!!inv.id, "created invoice has an id");
  console.log(`  invoice ${inv.id} status=${inv.status}`);

  // 4. Replaying the same Idempotency-Key + body returns the original
  // result without re-creating.
  const replayRes = await createFactura(
    authedReq("http://localhost/api/v1/facturas", {
      method: "POST",
      headers: { "Idempotency-Key": idemKey },
      body: JSON.stringify(invoiceBody),
    })
  );
  assert(replayRes.status === 201, "replay returns the original status");
  const replayInv = await replayRes.json();
  assert(replayInv.id === inv.id, "replay does not re-create the invoice");

  const localRows = await withOrg(ORG, (tx) => tx.select().from(facturas).where(eq(facturas.facturapiId, inv.id)));
  assert(localRows.length === 1, "exactly one local factura row exists despite the replay");

  // 5. List with limit/offset pagination includes the new invoice.
  const listRes = await listFacturas(authedReq("http://localhost/api/v1/facturas?limit=10&offset=0"));
  assert(listRes.status === 200, "list succeeds");
  const listBody = await listRes.json();
  assert(Array.isArray(listBody.data), "list returns a data array");
  assert(listBody.meta.limit === 10 && listBody.meta.offset === 0, "list echoes limit/offset in meta");
  assert(
    listBody.data.some((f: { id: string }) => f.id === inv.id),
    "list includes the newly created invoice"
  );

  // 6. Retrieve by id — full raw FacturAPI object.
  const getRes = await getFactura(authedReq(`http://localhost/api/v1/facturas/${inv.id}`), {
    params: Promise.resolve({ id: inv.id }),
  });
  assert(getRes.status === 200, "retrieve succeeds");
  const getBody = await getRes.json();
  assert(getBody.id === inv.id, "retrieve returns the full raw invoice object");

  // 7. Cancel with motive/substitution.
  const cancelRes = await cancelFactura(
    authedReq(`http://localhost/api/v1/facturas/${inv.id}?motive=02`, { method: "DELETE" }),
    { params: Promise.resolve({ id: inv.id }) }
  );
  assert(cancelRes.status === 200, "cancel succeeds");
  const cancelBody = await cancelRes.json();
  assert(
    cancelBody.status === "canceled" || cancelBody.cancellation_status,
    "cancel reflects a canceled/cancellation_status result"
  );

  const [localAfterCancel] = await withOrg(ORG, (tx) => tx.select().from(facturas).where(eq(facturas.facturapiId, inv.id)));
  assert(localAfterCancel.cancellationStatus !== "none", "local mirror reflects the cancellation");

  await cleanup();
  console.log(
    "v1 facturas verified: Idempotency-Key required + dedup, type restriction, list pagination, retrieve, and cancel all hold."
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
