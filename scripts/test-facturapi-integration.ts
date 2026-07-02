// One-off: verifies the encrypt -> store -> decrypt -> call-real-FacturAPI
// pipeline end to end, using the test-mode key reused from the old project.
import { eq } from "drizzle-orm";
import { db } from "../src/lib/db/client";
import { organizations } from "../src/lib/db/schema";
import { encryptSecret } from "../src/lib/crypto";
import { getOrgFacturapiClient } from "../src/lib/orgFacturapi";
import { FacturapiError } from "../src/lib/facturapi";

const ORG = "org_facturapi_test";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

async function main() {
  const testKey = process.env.FACTURAPI_TEST_API_KEY;
  if (!testKey) throw new Error("FACTURAPI_TEST_API_KEY not set");

  await db
    .insert(organizations)
    .values({ id: ORG, facturapiKeyEncrypted: encryptSecret(testKey) })
    .onConflictDoUpdate({ target: organizations.id, set: { facturapiKeyEncrypted: encryptSecret(testKey) } });

  const client = await getOrgFacturapiClient(ORG);
  assert(!(client instanceof Response), "client resolves (org key decrypts successfully)");
  if (client instanceof Response) return;

  // real call against FacturAPI's sandbox
  const customers = await client.get<{ data: unknown[]; total_results: number }>("customers", { limit: 1 });
  assert(Array.isArray(customers.data), "GET /customers returns a data array from the real API");
  console.log(`  customers.total_results = ${customers.total_results}`);

  const invoices = await client.get<{ data: unknown[]; total_results: number }>("invoices", {
    type: "I",
    limit: 1,
  });
  assert(Array.isArray(invoices.data), "GET /invoices returns a data array from the real API");
  console.log(`  invoices.total_results = ${invoices.total_results}`);

  // confirm a bad key produces a clean FacturapiError, not a crash
  await db
    .update(organizations)
    .set({ facturapiKeyEncrypted: encryptSecret("sk_test_definitely_invalid_key") })
    .where(eq(organizations.id, ORG));
  const badClient = await getOrgFacturapiClient(ORG);
  if (badClient instanceof Response) throw new Error("expected a client, got a Response");
  let gotAuthError = false;
  try {
    await badClient.get("customers");
  } catch (e) {
    gotAuthError = e instanceof FacturapiError && e.status === 401;
  }
  assert(gotAuthError, "an invalid API key produces a clean 401 FacturapiError");

  // cleanup
  await db.delete(organizations).where(eq(organizations.id, ORG));

  console.log("FacturAPI integration verified: encrypt/store/decrypt round-trips and real API calls succeed.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
