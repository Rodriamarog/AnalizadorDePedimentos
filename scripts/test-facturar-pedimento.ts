// One-off: exercises the Facturar-from-pedimento flow — both the pure
// partida->invoice-item transformation (mapPedimentoToItems, the exact code
// the CrearFacturaDialog runs when opened with a pedimento prop) and a real
// FacturAPI sandbox call proving the resulting payload (customs_keys tagging
// + the aggregated Impuestos Aduaneros line item) actually timbra.
import { eq } from "drizzle-orm";
import { db } from "../src/lib/db/client";
import { organizations } from "../src/lib/db/schema";
import { encryptSecret } from "../src/lib/crypto";
import { getOrgFacturapiClient } from "../src/lib/orgFacturapi";
import { mapPedimentoToItems, type PedimentoForFactura, type ProductoLookup } from "../src/components/crear-factura-dialog";

const ORG = "org_facturar_pedimento_test";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERTION FAILED: ${msg}`);
}

async function main() {
  const testKey = process.env.FACTURAPI_TEST_API_KEY;
  if (!testKey) throw new Error("FACTURAPI_TEST_API_KEY not set");

  // ── 1. Pure transformation logic ─────────────────────────────────────────
  // Real pedimento number (from the actual test PDF used across this
  // project's earlier phases) — FacturAPI validates customs_keys against
  // SAT's real pedimento-number checksum, so a synthetic number gets
  // rejected with "El valor del Número de Pedimento es incorrecto".
  const pedimento: PedimentoForFactura = {
    id: "ped-1",
    pedimentoNum: "26 40 3362 6000505",
    importador: "IMPORTADORA DE PRUEBA SA DE CV",
    tipoCambio: 18.5,
    dta: 500,
    igi: 1200,
    prv: 0,
    partidas: [
      { fraccion: "87089999", descripcion: "PARTES PARA VEHICULOS", cantidad: 10, precioUnitario: 150.5, umc: "6" },
      { fraccion: "39235000", descripcion: "TAPAS DE PLASTICO SIN MAPEO", cantidad: 5, precioUnitario: 20, umc: "1" },
    ],
  };
  const productos: ProductoLookup[] = [
    { fraccion: "87089999", claveProdServ: "25172500", unitKey: "H87" },
    // 39235000 deliberately has no productos entry -> should fall back to
    // UMC '1' (kilo) -> KGM, and come back with an empty clave.
  ];

  const items = mapPedimentoToItems(pedimento, productos);
  assert(items.length === 3, `expected 3 items (2 partidas + aduaneros), got ${items.length}`);

  const [p1, p2, aduaneros] = items;
  assert(p1.clave === "25172500", "mapped partida picks up clave from productos");
  assert(p1.unitKey === "H87", "mapped partida picks up unit from productos");
  assert(p2.clave === "", "unmapped partida has empty clave (would show the warning icon)");
  assert(p2.unitKey === "KGM", "unmapped partida falls back to UMC->unit_key table (umc '1' -> KGM)");
  assert(aduaneros.isAduaneros === true, "third row is the aggregated Impuestos Aduaneros row");
  assert(aduaneros.precio === "1700", "aduaneros row totals DTA+IGI+PRV (500+1200+0=1700)");
  assert(aduaneros.clave === "93161608", "aduaneros row uses the fixed SAT clave");
  assert(aduaneros.claveReadonly === true && aduaneros.unitReadonly === true && aduaneros.qtyReadonly === true,
    "aduaneros row's clave/unit/qty are readonly, matching the old app");

  // Pedimento with no dta/igi/prv should NOT get an aduaneros row.
  const noImpItems = mapPedimentoToItems({ ...pedimento, dta: 0, igi: 0, prv: null }, productos);
  assert(noImpItems.length === 2, "no aduaneros row when dta+igi+prv is 0");

  console.log("mapPedimentoToItems assertions passed.");

  // ── 2. Real FacturAPI sandbox call with the resulting payload shape ─────
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

  // Only the mapped partida + the aduaneros row have a clave, matching what
  // buildInvoiceBody() would actually send (rows with no clave get skipped).
  const invoiceBody = {
    customer: customer.id,
    type: "I",
    use: "S01", // tax_system 616 rejects G01 in the sandbox (same finding as Phase 6/8's tests)
    items: [p1, aduaneros].map((it) => ({
      quantity: Number(it.cantidad) || 1,
      product: {
        description: it.descripcion,
        product_key: it.clave,
        price: Number(it.precio) || 0,
        unit_key: it.unitKey,
        tax_included: false,
        taxes: [{ type: "IVA", rate: 0.16, factor: "Tasa", withholding: false }],
      },
      customs_keys: [pedimento.pedimentoNum],
    })),
    payment_form: "03",
    payment_method: "PUE",
    currency: "MXN",
  };

  const inv = await client.post<{ id: string; uuid?: string; total?: number; status: string }>("invoices", invoiceBody);
  assert(!!inv.id, "invoice created");
  assert(inv.status === "valid", `invoice status is valid, got ${inv.status}`);
  // 150.5*10*1.16 + 1700*1.16 = 1745.8 + 1972 = 3717.8
  assert(Math.abs((inv.total ?? 0) - 3717.8) < 0.01, `total matches expected math, got ${inv.total}`);
  console.log("Real FacturAPI invoice:", { id: inv.id, uuid: inv.uuid, total: inv.total, status: inv.status });

  await client.delete(`invoices/${inv.id}`, { motive: "02" });
  await db.delete(organizations).where(eq(organizations.id, ORG));

  console.log(
    "Facturar-from-pedimento test passed: transformation logic verified structurally, real FacturAPI invoice (with customs_keys + aggregated Impuestos Aduaneros line) timbrado and total matches expected math."
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
