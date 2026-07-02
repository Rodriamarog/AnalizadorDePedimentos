// One-off: proves the new "Crear factura" dialog's payload shape (ported
// from the old app's buildInvoiceBody) is actually accepted by the real
// FacturAPI sandbox — specifically the honorarios-comercializadora item with
// stacked withholding taxes (ISR + IVA retenido), which no earlier test
// exercised. Mirrors what src/app/(dashboard)/facturas/page.tsx's
// buildInvoiceBody() constructs, calling FacturAPI directly (not through
// Next's HTTP layer, since that needs a Clerk session).
import { eq } from "drizzle-orm";
import { db } from "../src/lib/db/client";
import { organizations } from "../src/lib/db/schema";
import { encryptSecret } from "../src/lib/crypto";
import { getOrgFacturapiClient } from "../src/lib/orgFacturapi";

const ORG = "org_crear_factura_payload_test";

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
  if (client instanceof Response) throw new Error("client did not resolve");

  const customer = await client.post<{ id: string }>("customers", {
    legal_name: "Carlos Alberto Amaro Reyes",
    tax_id: "AARC700811CL4",
    tax_system: "616",
    address: { zip: "22504" },
    email: "test@example.com",
  });
  assert(!!customer.id, "customer created");

  // Mirrors buildInvoiceBody(): PUE, 8% IVA (manual-mode default), one plain
  // "aduanal" item plus one "comercializadora" item with ISR 10% + IVA
  // retenido 5.33% withholding taxes stacked on top of the normal 8% IVA.
  const body = {
    customer: customer.id,
    type: "I",
    use: "S01",
    items: [
      {
        quantity: 1,
        product: {
          description: "GASTOS AGENCIA ADUANAL",
          product_key: "80151605",
          price: 1500,
          unit_key: "E48",
          tax_included: false,
          taxes: [{ type: "IVA", rate: 0.08, factor: "Tasa", withholding: false }],
        },
      },
      {
        quantity: 1,
        product: {
          description: "HONORARIOS COMERCIALIZADORA",
          product_key: "80151604",
          price: 2000,
          unit_key: "E48",
          tax_included: false,
          taxes: [
            { type: "IVA", rate: 0.08, factor: "Tasa", withholding: false },
            { type: "ISR", rate: 0.1, factor: "Tasa", withholding: true },
            { type: "IVA", rate: 0.0533, factor: "Tasa", withholding: true },
          ],
        },
      },
    ],
    payment_form: "03",
    payment_method: "PUE",
    currency: "MXN",
  };

  const inv = await client.post<{ id: string; uuid?: string; total?: number; status: string }>("invoices", body);
  assert(!!inv.id, "invoice created");
  assert(inv.status === "valid", `invoice status is valid, got ${inv.status}`);
  console.log("Invoice created:", { id: inv.id, uuid: inv.uuid, total: inv.total, status: inv.status });

  // Preview endpoint too (used by "Vista previa PDF").
  const previewBody = { ...body };
  const previewRes = await client.raw("POST", "invoices/preview/pdf", { json: previewBody });
  assert(previewRes.ok, `preview endpoint responded ok, got ${previewRes.status}`);

  await client.delete(`invoices/${inv.id}`, { motive: "02" });

  await db.delete(organizations).where(eq(organizations.id, ORG));

  console.log(
    "Crear factura payload test passed: honorarios-aduanal + honorarios-comercializadora (with ISR/IVA retenciones) accepted by real FacturAPI sandbox, preview endpoint works, cancel works."
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
