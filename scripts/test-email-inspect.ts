// One-off: sends a real invoice email via the FacturAPI sandbox to a real
// inbox, purely to observe what FacturAPI actually puts in the "From" and
// "Subject" fields (undocumented in their OpenAPI spec — this is the only
// reliable way to find out). Not a regression test; cleans up after itself.
import { db } from "../src/lib/db/client";
import { organizations } from "../src/lib/db/schema";
import { encryptSecret } from "../src/lib/crypto";
import { getOrgFacturapiClient } from "../src/lib/orgFacturapi";

const ORG = "org_email_inspect_test";
const TARGET_EMAIL = "rodriamarog@gmail.com";

async function main() {
  const testKey = process.env.FACTURAPI_TEST_API_KEY;
  if (!testKey) throw new Error("FACTURAPI_TEST_API_KEY not set");

  await db
    .insert(organizations)
    .values({ id: ORG, facturapiKeyEncrypted: encryptSecret(testKey) })
    .onConflictDoUpdate({ target: organizations.id, set: { facturapiKeyEncrypted: encryptSecret(testKey) } });

  const client = await getOrgFacturapiClient(ORG);
  if (client instanceof Response) throw new Error("client did not resolve");

  const customer = await client.post<{ id: string }>("customers", {
    legal_name: "Carlos Alberto Amaro Reyes",
    tax_id: "AARC700811CL4",
    tax_system: "616",
    address: { zip: "22504" },
    email: TARGET_EMAIL,
  });

  const inv = await client.post<{ id: string; uuid?: string }>("invoices", {
    customer: customer.id,
    type: "I",
    use: "S01",
    items: [
      {
        quantity: 1,
        product: {
          description: "Producto de prueba - inspección de plantilla de correo",
          product_key: "01010101",
          price: 100,
          unit_key: "H87",
          tax_included: false,
          taxes: [{ type: "IVA", rate: 0.16, factor: "Tasa", withholding: false }],
        },
      },
    ],
    payment_form: "03",
    payment_method: "PUE",
    currency: "MXN",
  });
  console.log("Invoice created:", inv.id, inv.uuid);

  const emailResult = await client.post("invoices/" + inv.id + "/email", { email: TARGET_EMAIL });
  console.log("Email send API response:", emailResult);
  console.log(`\nCheck ${TARGET_EMAIL} inbox now for the actual From/Subject FacturAPI used.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
