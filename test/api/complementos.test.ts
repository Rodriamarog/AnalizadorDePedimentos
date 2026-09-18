import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getOrgFacturapiClient } from "@/lib/orgFacturapi";
import { buildComplementForInvoice } from "@/lib/buildComplemento";
import { buildRequest, cleanupOrg, createTestOrg } from "../helpers";

// The internal complementos routes authenticate via the Clerk session
// (requireOrgId), not the v1 Bearer scheme — mock Clerk's auth() the same
// way test/api/settings/api-keys.test.ts does.
const mockAuth = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({ auth: () => mockAuth() }));

const { POST: postComplemento, GET: getComplementos } = await import("@/app/api/complementos/route");
const { POST: previewComplemento } = await import("@/app/api/complementos/preview/route");

describe("/api/complementos (multi-node, #74)", () => {
  let orgId: string;
  let customerId: string;
  let factorCustomerId: string;
  let invoiceId: string;
  let invoiceUuid: string;

  beforeAll(async () => {
    orgId = await createTestOrg();

    const client = await getOrgFacturapiClient(orgId);
    if (client instanceof Response) throw new Error("failed to resolve FacturAPI client for test org");

    const customer = await client.post<{ id: string }>("customers", {
      legal_name: "Test Complementos Customer",
      tax_id: "XAXX010101000",
      tax_system: "616",
      address: { zip: "22504" },
      email: "test@example.com",
    });
    customerId = customer.id;

    // A second customer standing in for the factoring institution in the
    // receptor-override tests (#77).
    const factorCustomer = await client.post<{ id: string }>("customers", {
      legal_name: "Test Factoring Institution",
      tax_id: "XEXX010101000",
      tax_system: "616",
      address: { zip: "22504" },
      email: "factor@example.com",
    });
    factorCustomerId = factorCustomer.id;
  });

  afterAll(async () => {
    await cleanupOrg(orgId);
  });

  beforeEach(() => {
    mockAuth.mockResolvedValue({ orgId });
  });

  afterEach(() => {
    mockAuth.mockReset();
  });

  // A fresh 1000 MXN PPD invoice, created per-test so prior-payments
  // bookkeeping never leaks between test cases.
  async function createPpdInvoice(): Promise<{ id: string; uuid: string }> {
    const client = await getOrgFacturapiClient(orgId);
    if (client instanceof Response) throw new Error("failed to resolve FacturAPI client");
    const inv = await client.post<{ id: string; uuid: string }>("invoices", {
      type: "I",
      customer: customerId,
      use: "S01",
      payment_form: "99",
      payment_method: "PPD",
      items: [
        {
          quantity: 1,
          product: {
            description: "Servicio de prueba",
            product_key: "80141600",
            price: 1000.0,
            tax_included: false,
            taxes: [{ type: "IVA", rate: 0.16 }],
            unit_key: "E48",
          },
        },
      ],
    });
    return { id: inv.id, uuid: inv.uuid };
  }

  beforeEach(async () => {
    const inv = await createPpdInvoice();
    invoiceId = inv.id;
    invoiceUuid = inv.uuid;
  });

  function nodosBody(nodos: { forma_pago: string; monto: number; fecha_pago: string; numero_operacion?: string }[]) {
    return { factura_facturapi_id: invoiceId, nodos };
  }

  // The invoice item is priced at 1000 tax-excluded with 16% IVA, so the
  // stamped invoice total (and starting saldo pendiente) is 1160.
  const INVOICE_TOTAL = 1160;

  it("a single-node request behaves like today's single-payment flow", async () => {
    const res = await postComplemento(
      buildRequest("/api/complementos", {
        method: "POST",
        body: nodosBody([{ forma_pago: "03", monto: INVOICE_TOTAL, fecha_pago: "2026-01-15" }]),
      })
    );
    expect(res.status).toBe(201);

    const listRes = await getComplementos();
    const rows = await listRes.json();
    const forThisInvoice = rows.filter((r: { facturaFacturapiId: string | null }) => r.facturaFacturapiId === invoiceId);
    expect(forThisInvoice).toHaveLength(1);
    expect(forThisInvoice[0].monto).toBe(INVOICE_TOTAL);
    expect(forThisInvoice[0].uuid).toBeTruthy();
  });

  it("a multi-node request stamps one CFDI and persists one row per node sharing the same facturapiId/uuid", async () => {
    const res = await postComplemento(
      buildRequest("/api/complementos", {
        method: "POST",
        body: nodosBody([
          { forma_pago: "17", monto: 100, fecha_pago: "2026-01-10", numero_operacion: "COM-1" },
          { forma_pago: "03", monto: 1060, fecha_pago: "2026-01-11" },
        ]),
      })
    );
    expect(res.status).toBe(201);
    const comp = await res.json();

    const listRes = await getComplementos();
    const rows = await listRes.json();
    const forThisInvoice = rows.filter((r: { facturaFacturapiId: string | null }) => r.facturaFacturapiId === invoiceId);
    expect(forThisInvoice).toHaveLength(2);
    for (const row of forThisInvoice) {
      expect(row.facturapiId).toBe(comp.id);
      expect(row.uuid).toBe(comp.uuid);
    }
    expect(
      forThisInvoice.map((r: { monto: number }) => r.monto).sort((a: number, b: number) => a - b)
    ).toEqual([100, 1060]);
  });

  it("rejects a multi-node request whose amounts sum to more than the saldo pendiente", async () => {
    const res = await postComplemento(
      buildRequest("/api/complementos", {
        method: "POST",
        body: nodosBody([
          { forma_pago: "17", monto: 700, fecha_pago: "2026-01-10" },
          { forma_pago: "03", monto: 500, fecha_pago: "2026-01-11" },
        ]),
      })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/excede el saldo pendiente/);
  });

  it("accepts nodes summing to less than the saldo pendiente (partial multi-node payment)", async () => {
    const res = await postComplemento(
      buildRequest("/api/complementos", {
        method: "POST",
        body: nodosBody([
          { forma_pago: "17", monto: 100, fecha_pago: "2026-01-10" },
          { forma_pago: "03", monto: 200, fecha_pago: "2026-01-11" },
        ]),
      })
    );
    expect(res.status).toBe(201);
  });

  it("preview with a multi-node body returns a PDF without persisting anything", async () => {
    const res = await previewComplemento(
      buildRequest("/api/complementos/preview", {
        method: "POST",
        body: nodosBody([
          { forma_pago: "17", monto: 100, fecha_pago: "2026-01-10" },
          { forma_pago: "03", monto: 1060, fecha_pago: "2026-01-11" },
        ]),
      })
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");

    const listRes = await getComplementos();
    const rows = await listRes.json();
    const forThisInvoice = rows.filter((r: { facturaFacturapiId: string | null }) => r.facturaFacturapiId === invoiceId);
    expect(forThisInvoice).toHaveLength(0);
  });

  it("chains installment/last_balance sequentially across nodes in buildComplementForInvoice", async () => {
    const client = await getOrgFacturapiClient(orgId);
    if (client instanceof Response) throw new Error("failed to resolve FacturAPI client");

    const result = await buildComplementForInvoice(client, {
      facturaFacturapiId: invoiceId,
      nodos: [
        { formaPago: "17", monto: 300, fechaPagoStr: "2026-01-10", numeroOperacion: "COM-1" },
        { formaPago: "03", monto: 400, fechaPagoStr: "2026-01-11" },
      ],
    });
    if ("error" in result) throw new Error(`expected success, got error: ${result.error}`);

    expect(result.nodos).toHaveLength(2);
    expect(result.nodos[0].lastBalance).toBe(INVOICE_TOTAL);
    expect(result.nodos[1].lastBalance).toBe(INVOICE_TOTAL - 300);
    expect(result.nodos[1].installment).toBe(result.nodos[0].installment + 1);

    const complements = result.complementBody.complements as { data: { related_documents: { uuid: string }[] }[] }[];
    expect(complements[0].data).toHaveLength(2);
    expect(complements[0].data.every((d) => d.related_documents[0].uuid === invoiceUuid)).toBe(true);
  });

  // #77: a factoraje-style complement whose actual payer (the factoring
  // institution) differs from the original invoice's debtor.
  it("buildComplementForInvoice sets the complement's customer to the override id, not the original invoice's customer", async () => {
    const client = await getOrgFacturapiClient(orgId);
    if (client instanceof Response) throw new Error("failed to resolve FacturAPI client");

    const result = await buildComplementForInvoice(client, {
      facturaFacturapiId: invoiceId,
      nodos: [{ formaPago: "17", monto: INVOICE_TOTAL, fechaPagoStr: "2026-01-10" }],
      receptorCustomerId: factorCustomerId,
    });
    if ("error" in result) throw new Error(`expected success, got error: ${result.error}`);

    expect(result.complementBody.customer).toBe(factorCustomerId);
  });

  it("emitting a complement with receptor_cliente_id set stamps the CFDI with that customer as receptor", async () => {
    const res = await postComplemento(
      buildRequest("/api/complementos", {
        method: "POST",
        body: {
          ...nodosBody([{ forma_pago: "17", monto: INVOICE_TOTAL, fecha_pago: "2026-01-10" }]),
          receptor_cliente_id: factorCustomerId,
        },
      })
    );
    expect(res.status).toBe(201);
    const comp = await res.json();

    const client = await getOrgFacturapiClient(orgId);
    if (client instanceof Response) throw new Error("failed to resolve FacturAPI client");
    const stamped = await client.get<{ customer?: { tax_id?: string } }>(`invoices/${comp.id}`);
    expect(stamped.customer?.tax_id).toBe("XEXX010101000");
  });

  it("emitting a complement without receptor_cliente_id preserves today's behavior (original invoice's customer)", async () => {
    const res = await postComplemento(
      buildRequest("/api/complementos", {
        method: "POST",
        body: nodosBody([{ forma_pago: "03", monto: INVOICE_TOTAL, fecha_pago: "2026-01-10" }]),
      })
    );
    expect(res.status).toBe(201);
    const comp = await res.json();

    const client = await getOrgFacturapiClient(orgId);
    if (client instanceof Response) throw new Error("failed to resolve FacturAPI client");
    const stamped = await client.get<{ customer?: { tax_id?: string } }>(`invoices/${comp.id}`);
    expect(stamped.customer?.tax_id).toBe("XAXX010101000");
  });
});
