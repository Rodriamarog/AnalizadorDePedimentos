import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getOrgFacturapiClient } from "@/lib/orgFacturapi";
import { withOrg } from "@/lib/db/withOrg";
import { facturas } from "@/lib/db/schema";
import { authHeaders, buildRequest, cleanupOrg, createApiKey, createTestOrg } from "../../helpers";

// The settings route authenticates via the Clerk session (requireOrgId), not
// the v1 Bearer scheme — mock Clerk's auth() the same way other settings
// route tests do.
const mockAuth = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({ auth: () => mockAuth() }));

const { GET, PUT } = await import("@/app/api/settings/starting-folio/route");
const { POST: createFactura } = await import("@/app/api/v1/facturas/route");

function invoiceBody(customerId: string, overrides: Record<string, unknown> = {}) {
  return {
    type: "I",
    customer: customerId,
    use: "S01",
    payment_form: "03",
    payment_method: "PUE",
    items: [
      {
        quantity: 1,
        product: {
          description: "Starting folio test item",
          product_key: "25172300",
          price: 100.0,
          tax_included: false,
          taxes: [{ type: "IVA", rate: 0.16 }],
          unit_key: "H87",
        },
      },
    ],
    ...overrides,
  };
}

describe("/api/settings/starting-folio", () => {
  let orgId: string;
  let token: string;
  let customerId: string;

  beforeAll(async () => {
    orgId = await createTestOrg();
    token = await createApiKey(orgId);

    const client = await getOrgFacturapiClient(orgId);
    if (client instanceof Response) throw new Error("failed to resolve FacturAPI client for test org");
    const customer = await client.post<{ id: string }>("customers", {
      legal_name: "Starting Folio Test Customer",
      tax_id: "XAXX010101000",
      tax_system: "616",
      address: { zip: "22504" },
      email: "test@example.com",
    });
    customerId = customer.id;
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

  it("rejects requests with no active Clerk org", async () => {
    mockAuth.mockResolvedValue({ orgId: null });
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("defaults to null/unlocked for a fresh org", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.factura).toEqual({ folioNumber: null, locked: false });
    expect(json.notaCredito).toEqual({ folioNumber: null, locked: false });
  });

  it("rejects a folioNumber below 1", async () => {
    const res = await PUT(
      buildRequest("/api/settings/starting-folio", { method: "PUT", body: { type: "I", folioNumber: 0 } })
    );
    expect(res.status).toBe(400);
  });

  it("rejects a non-integer folioNumber", async () => {
    const res = await PUT(
      buildRequest("/api/settings/starting-folio", { method: "PUT", body: { type: "I", folioNumber: 1.5 } })
    );
    expect(res.status).toBe(400);
  });

  it("rejects a type outside I/E", async () => {
    const res = await PUT(
      buildRequest("/api/settings/starting-folio", { method: "PUT", body: { type: "P", folioNumber: 10 } })
    );
    expect(res.status).toBe(400);
  });

  it("sets and reads back a starting folio for facturas", async () => {
    const put = await PUT(
      buildRequest("/api/settings/starting-folio", { method: "PUT", body: { type: "I", folioNumber: 111 } })
    );
    expect(put.status).toBe(200);

    const res = await GET();
    const json = await res.json();
    expect(json.factura).toEqual({ folioNumber: 111, locked: false });
  });

  it("clears a starting folio by setting it back to null while still unlocked", async () => {
    await PUT(buildRequest("/api/settings/starting-folio", { method: "PUT", body: { type: "E", folioNumber: 50 } }));
    const clear = await PUT(
      buildRequest("/api/settings/starting-folio", { method: "PUT", body: { type: "E", folioNumber: null } })
    );
    expect(clear.status).toBe(200);
    const res = await GET();
    const json = await res.json();
    expect(json.notaCredito).toEqual({ folioNumber: null, locked: false });
  });

  it(
    "applies the configured starting folio to the org's first factura, locks it afterward independently of " +
      "nota de crédito, and auto-increments from there on the next factura",
    async () => {
      await PUT(buildRequest("/api/settings/starting-folio", { method: "PUT", body: { type: "I", folioNumber: 500 } }));

      const first = await createFactura(
        buildRequest("/api/v1/facturas", {
          method: "POST",
          headers: { ...authHeaders(token), "Idempotency-Key": randomUUID() },
          body: invoiceBody(customerId),
        })
      );
      expect(first.status).toBe(201);
      const firstInvoice = await first.json();
      expect(firstInvoice.folio_number).toBe(500);

      // folioNumber now reflects the live counter — the *next* folio this
      // org's next factura will receive — not the frozen original value.
      const status = await GET();
      const statusJson = await status.json();
      expect(statusJson.factura).toEqual({ folioNumber: 501, locked: true });
      expect(statusJson.notaCredito.locked).toBe(false);

      const blocked = await PUT(
        buildRequest("/api/settings/starting-folio", { method: "PUT", body: { type: "I", folioNumber: 999 } })
      );
      expect(blocked.status).toBe(409);

      // Nota de crédito remains independently editable — the lock is per type.
      const ncPut = await PUT(
        buildRequest("/api/settings/starting-folio", { method: "PUT", body: { type: "E", folioNumber: 700 } })
      );
      expect(ncPut.status).toBe(200);

      const second = await createFactura(
        buildRequest("/api/v1/facturas", {
          method: "POST",
          headers: { ...authHeaders(token), "Idempotency-Key": randomUUID() },
          body: invoiceBody(customerId),
        })
      );
      expect(second.status).toBe(201);
      const secondInvoice = await second.json();
      expect(secondInvoice.folio_number).toBe(501);

      const third = await createFactura(
        buildRequest("/api/v1/facturas", {
          method: "POST",
          headers: { ...authHeaders(token), "Idempotency-Key": randomUUID() },
          body: invoiceBody(customerId),
        })
      );
      expect(third.status).toBe(201);
      const thirdInvoice = await third.json();
      expect(thirdInvoice.folio_number).toBe(502);
    }
  );

  it("applies the configured starting folio to the org's first nota de crédito and then locks it", async () => {
    // A fresh org, isolated from the factura-locking test above.
    const ncOrgId = await createTestOrg();
    const ncToken = await createApiKey(ncOrgId);
    const client = await getOrgFacturapiClient(ncOrgId);
    if (client instanceof Response) throw new Error("failed to resolve FacturAPI client for test org");
    const customer = await client.post<{ id: string }>("customers", {
      legal_name: "Starting Folio NC Test Customer",
      tax_id: "XAXX010101000",
      tax_system: "616",
      address: { zip: "22504" },
      email: "test@example.com",
    });

    mockAuth.mockResolvedValue({ orgId: ncOrgId });
    await PUT(buildRequest("/api/settings/starting-folio", { method: "PUT", body: { type: "E", folioNumber: 200 } }));

    const created = await createFactura(
      buildRequest("/api/v1/facturas", {
        method: "POST",
        headers: { ...authHeaders(ncToken), "Idempotency-Key": randomUUID() },
        body: invoiceBody(customer.id, { type: "E" }),
      })
    );
    expect(created.status).toBe(201);
    const invoice = await created.json();
    expect(invoice.folio_number).toBe(200);

    const status = await GET();
    const statusJson = await status.json();
    expect(statusJson.notaCredito).toEqual({ folioNumber: 201, locked: true });
    expect(statusJson.factura.locked).toBe(false);

    await cleanupOrg(ncOrgId);
  });

  it("does not lock the starting folio when the org only has a draft-status invoice", async () => {
    const draftOrgId = await createTestOrg({ withFacturapi: false });
    await withOrg(draftOrgId, (tx) =>
      tx.insert(facturas).values({
        orgId: draftOrgId,
        facturapiId: `draft_${randomUUID()}`,
        status: "draft",
        cfdiType: "I",
        paymentMethod: "PUE",
        total: 100,
        customerName: "Draft Customer",
        customerTaxId: "XAXX010101000",
        fecha: new Date(),
      })
    );

    mockAuth.mockResolvedValue({ orgId: draftOrgId });
    const before = await GET();
    expect((await before.json()).factura.locked).toBe(false);

    const put = await PUT(
      buildRequest("/api/settings/starting-folio", { method: "PUT", body: { type: "I", folioNumber: 900 } })
    );
    expect(put.status).toBe(200);

    await cleanupOrg(draftOrgId);
  });

  it("never reserves the same folio number twice for concurrent invoice creations", async () => {
    const raceOrgId = await createTestOrg();
    const raceToken = await createApiKey(raceOrgId);
    const client = await getOrgFacturapiClient(raceOrgId);
    if (client instanceof Response) throw new Error("failed to resolve FacturAPI client for test org");
    const customer = await client.post<{ id: string }>("customers", {
      legal_name: "Starting Folio Race Test Customer",
      tax_id: "XAXX010101000",
      tax_system: "616",
      address: { zip: "22504" },
      email: "test@example.com",
    });

    mockAuth.mockResolvedValue({ orgId: raceOrgId });
    await PUT(buildRequest("/api/settings/starting-folio", { method: "PUT", body: { type: "I", folioNumber: 5000 } }));

    const [a, b] = await Promise.all([
      createFactura(
        buildRequest("/api/v1/facturas", {
          method: "POST",
          headers: { ...authHeaders(raceToken), "Idempotency-Key": randomUUID() },
          body: invoiceBody(customer.id),
        })
      ),
      createFactura(
        buildRequest("/api/v1/facturas", {
          method: "POST",
          headers: { ...authHeaders(raceToken), "Idempotency-Key": randomUUID() },
          body: invoiceBody(customer.id),
        })
      ),
    ]);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    const [aJson, bJson] = await Promise.all([a.json(), b.json()]);
    expect(new Set([aJson.folio_number, bJson.folio_number]).size).toBe(2);
    expect([aJson.folio_number, bJson.folio_number].sort((x, y) => x - y)).toEqual([5000, 5001]);

    await cleanupOrg(raceOrgId);
  });
});
