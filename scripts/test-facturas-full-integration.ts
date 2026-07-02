// One-off: full round trip against the real FacturAPI sandbox, exercising
// the exact same code paths as the /api/facturas, /api/complementos routes
// (create invoice -> local upsert -> pdf/xml/email -> complemento -> cancel).
import { eq } from "drizzle-orm";
import { db } from "../src/lib/db/client";
import { organizations, facturas, complementosPago } from "../src/lib/db/schema";
import { encryptSecret } from "../src/lib/crypto";
import { getOrgFacturapiClient } from "../src/lib/orgFacturapi";
import { saveFactura, type FacturapiInvoice } from "../src/lib/saveFactura";
import { withOrg } from "../src/lib/db/withOrg";

const ORG = "org_facturas_full_test";

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

  // 1. customer
  const customer = await client.post<{ id: string }>("customers", {
    legal_name: "Carlos Alberto Amaro Reyes",
    tax_id: "AARC700811CL4",
    tax_system: "616",
    address: { zip: "22504" },
    email: "test@example.com",
  });
  assert(!!customer.id, "customer created");

  // 2. invoice
  const invoiceBody = {
    customer: customer.id,
    use: "S01",
    payment_form: "03",
    payment_method: "PUE",
    items: [
      {
        quantity: 2,
        product: {
          description: "TAPA DE ALUMINIO PARA CONTENEDOR MEDIANO MARCA: KARAT",
          product_key: "25172300",
          price: 347.0,
          tax_included: false,
          taxes: [{ type: "IVA", rate: 0.16 }],
          unit_key: "H87",
        },
      },
    ],
  };
  const inv = await client.post<FacturapiInvoice & { total: number }>("invoices", invoiceBody);
  assert(!!inv.id, "invoice created");
  console.log(`  invoice ${inv.id} total=${inv.total} status=${inv.status}`);

  // 3. local upsert (same call the /api/facturas route makes)
  const localFactura = await withOrg(ORG, (tx) => saveFactura(tx, ORG, inv, null));
  assert(localFactura.facturapiId === inv.id, "local factura row created with matching facturapiId");
  assert(localFactura.customerName.includes("AMARO REYES"), "local factura captured customer name");

  // 4. pdf/xml downloads
  const pdfRes = await client.raw("GET", `invoices/${inv.id}/pdf`);
  const pdfBuf = await pdfRes.arrayBuffer();
  assert(pdfBuf.byteLength > 0, "PDF download returns non-empty content");

  const xmlRes = await client.raw("GET", `invoices/${inv.id}/xml`);
  const xmlBuf = await xmlRes.arrayBuffer();
  assert(xmlBuf.byteLength > 0, "XML download returns non-empty content");

  // 5. email
  const emailResult = await client.post(`invoices/${inv.id}/email`, { email: "test@example.com" });
  assert(!!emailResult, "email send call succeeds");

  // 6. complemento de pago (same logic as /api/complementos)
  const monto = 200;
  const ivaBase = Math.round((monto / 1.16) * 1e6) / 1e6;
  const customerObj = { ...(inv.customer ?? {}) };
  delete customerObj.id;
  delete customerObj.created_at;
  delete customerObj.updated_at;
  delete customerObj.livemode;
  const complementBody = {
    type: "P",
    customer: customerObj,
    complements: [
      {
        type: "pago",
        data: [
          {
            payment_form: "03",
            date: `${new Date().toISOString().slice(0, 10)}T12:00:00`,
            related_documents: [
              {
                uuid: inv.uuid,
                amount: monto,
                installment: 1,
                last_balance: inv.total,
                taxes: [{ base: ivaBase, type: "IVA", rate: 0.16, factor: "Tasa", withholding: false }],
                taxability: "02",
              },
            ],
          },
        ],
      },
    ],
  };
  const comp = await client.post<{ id: string; uuid?: string }>("invoices", complementBody);
  assert(!!comp.id, "complemento de pago created against the real sandbox");

  await withOrg(ORG, async (tx) => {
    await tx.insert(complementosPago).values({
      orgId: ORG,
      facturapiId: comp.id,
      uuid: comp.uuid ?? null,
      facturaId: localFactura.id,
      fechaPago: new Date().toISOString().slice(0, 10),
      monto,
      formaPago: "03",
    });
  });
  const storedComplementos = await withOrg(ORG, (tx) =>
    tx.select().from(complementosPago).where(eq(complementosPago.orgId, ORG))
  );
  assert(storedComplementos.length === 1, "complemento persisted locally");

  // 7. cancel the original invoice
  const canceled = await client.delete<{ status?: string; cancellation_status?: string }>(
    `invoices/${inv.id}`,
    { motive: "02" }
  );
  assert(!!canceled.cancellation_status, "cancel call succeeds and returns a cancellation_status");

  // cleanup
  await withOrg(ORG, async (tx) => {
    await tx.delete(complementosPago).where(eq(complementosPago.orgId, ORG));
    await tx.delete(facturas).where(eq(facturas.orgId, ORG));
  });
  await db.delete(organizations).where(eq(organizations.id, ORG));

  console.log(
    "Full FacturAPI integration verified: customer -> invoice -> local upsert -> pdf/xml/email -> complemento -> cancel."
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
