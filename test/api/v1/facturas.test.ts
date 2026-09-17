import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET, POST } from "@/app/api/v1/facturas/route";
import { DELETE as cancelFactura, GET as getFactura } from "@/app/api/v1/facturas/[id]/route";
import { GET as getPdf } from "@/app/api/v1/facturas/[id]/pdf/route";
import { GET as getXml } from "@/app/api/v1/facturas/[id]/xml/route";
import { POST as stampFactura } from "@/app/api/v1/facturas/[id]/stamp/route";
import { getOrgFacturapiClient } from "@/lib/orgFacturapi";
import { authHeaders, buildRequest, cleanupOrg, createApiKey, createTestOrg } from "../../helpers";

function idParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

// A minimal draft invoice payload known to work against the FacturAPI test
// sandbox (mirrors scripts/test-api-v1-facturas.ts).
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
          description: "TAPA DE ALUMINIO PARA CONTENEDOR MEDIANO MARCA: KARAT",
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

describe("/api/v1/facturas", () => {
  let orgId: string;
  let token: string;
  let customerId: string;
  // A stamped invoice shared read-only across GET/pdf/xml tests.
  let stampedInvoiceId: string;

  beforeAll(async () => {
    orgId = await createTestOrg();
    token = await createApiKey(orgId);

    const client = await getOrgFacturapiClient(orgId);
    if (client instanceof Response) throw new Error("failed to resolve FacturAPI client for test org");
    const customer = await client.post<{ id: string }>("customers", {
      legal_name: "Test Facturas Customer",
      tax_id: "XAXX010101000",
      tax_system: "616",
      address: { zip: "22504" },
      email: "test@example.com",
    });
    customerId = customer.id;

    // Note: this FacturAPI test-mode account auto-stamps invoices on
    // creation (status "valid" immediately) rather than leaving them as
    // drafts — confirmed by direct inspection. POST /{id}/stamp is still a
    // real code path (tested below against its actual 409 behavior on an
    // already-stamped invoice), but there's no draft state to set up here.
    const createRes = await POST(
      buildRequest("/api/v1/facturas", {
        method: "POST",
        headers: { ...authHeaders(token), "Idempotency-Key": randomUUID() },
        body: invoiceBody(customerId),
      })
    );
    const created = await createRes.json();
    if (createRes.status !== 201) {
      throw new Error(`setup: failed to create shared invoice: ${createRes.status} ${JSON.stringify(created)}`);
    }
    stampedInvoiceId = created.id;
  });

  afterAll(async () => {
    await cleanupOrg(orgId);
  });

  describe("POST / (create)", () => {
    it("rejects requests with no Authorization header", async () => {
      const res = await POST(buildRequest("/api/v1/facturas", { method: "POST", body: invoiceBody(customerId) }));
      expect(res.status).toBe(401);
    });

    it("rejects a create request with no Idempotency-Key header", async () => {
      const res = await POST(
        buildRequest("/api/v1/facturas", { method: "POST", headers: authHeaders(token), body: invoiceBody(customerId) })
      );
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe("invalid_parameter");
    });

    it("rejects a type outside I/E/N/P/T", async () => {
      const res = await POST(
        buildRequest("/api/v1/facturas", {
          method: "POST",
          headers: { ...authHeaders(token), "Idempotency-Key": randomUUID() },
          body: invoiceBody(customerId, { type: "X" }),
        })
      );
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe("invalid_parameter");
    });

    // Type "T" (Traslado) passes the route's own type check but this
    // payload has no Carta Porte complement, which FacturAPI itself
    // requires for a Traslado invoice — a real upstream rejection, not a
    // local validation error.
    it("rejects a Traslado (type T) invoice with no Carta Porte complement", async () => {
      const res = await POST(
        buildRequest("/api/v1/facturas", {
          method: "POST",
          headers: { ...authHeaders(token), "Idempotency-Key": randomUUID() },
          body: invoiceBody(customerId, { type: "T" }),
        })
      );
      expect(res.status).toBeGreaterThanOrEqual(400);
      const json = await res.json();
      expect(json.error.code).toBe("facturapi_error");
    });

    it("rejects a body that is not valid JSON", async () => {
      const req = buildRequest("/api/v1/facturas", {
        method: "POST",
        headers: { ...authHeaders(token), "Idempotency-Key": randomUUID(), "content-type": "application/json" },
      });
      // Force an unparseable body without going through buildRequest's JSON.stringify.
      const badReq = new Request(req.url, { method: "POST", headers: req.headers, body: "{not json" });
      const res = await POST(badReq as unknown as Parameters<typeof POST>[0]);
      expect(res.status).toBe(400);
    });

    it("creates an invoice for a valid payload", async () => {
      const res = await POST(
        buildRequest("/api/v1/facturas", {
          method: "POST",
          headers: { ...authHeaders(token), "Idempotency-Key": randomUUID() },
          body: invoiceBody(customerId),
        })
      );
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(typeof json.id).toBe("string");
    });

    it("replaying the same Idempotency-Key with the same body returns the original invoice", async () => {
      const idemKey = randomUUID();
      const first = await POST(
        buildRequest("/api/v1/facturas", {
          method: "POST",
          headers: { ...authHeaders(token), "Idempotency-Key": idemKey },
          body: invoiceBody(customerId),
        })
      );
      const firstJson = await first.json();

      const replay = await POST(
        buildRequest("/api/v1/facturas", {
          method: "POST",
          headers: { ...authHeaders(token), "Idempotency-Key": idemKey },
          body: invoiceBody(customerId),
        })
      );
      expect(replay.status).toBe(first.status);
      const replayJson = await replay.json();
      expect(replayJson.id).toBe(firstJson.id);
    });

    it("reusing the same Idempotency-Key with a different body is rejected", async () => {
      const idemKey = randomUUID();
      await POST(
        buildRequest("/api/v1/facturas", {
          method: "POST",
          headers: { ...authHeaders(token), "Idempotency-Key": idemKey },
          body: invoiceBody(customerId),
        })
      );
      const conflict = await POST(
        buildRequest("/api/v1/facturas", {
          method: "POST",
          headers: { ...authHeaders(token), "Idempotency-Key": idemKey },
          body: invoiceBody(customerId, { use: "G03" }),
        })
      );
      expect(conflict.status).toBe(422);
      const json = await conflict.json();
      expect(json.error.code).toBe("idempotency_key_reused");
    });

    it("persists and echoes back external_reference (#68)", async () => {
      const externalReference = `trip-${randomUUID()}`;
      const res = await POST(
        buildRequest("/api/v1/facturas", {
          method: "POST",
          headers: { ...authHeaders(token), "Idempotency-Key": randomUUID() },
          body: invoiceBody(customerId, { external_reference: externalReference }),
        })
      );
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.external_reference).toBe(externalReference);

      const getRes = await getFactura(buildRequest(`/api/v1/facturas/${json.id}`, { headers: authHeaders(token) }), idParams(json.id));
      const getJson = await getRes.json();
      expect(getJson.external_reference).toBe(externalReference);
    });
  });

  describe("GET / (list)", () => {
    it("rejects requests with no Authorization header", async () => {
      const res = await GET(buildRequest("/api/v1/facturas"));
      expect(res.status).toBe(401);
    });

    it("returns a paginated envelope including a newly created invoice", async () => {
      const res = await GET(buildRequest("/api/v1/facturas?limit=50&offset=0", { headers: authHeaders(token) }));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(Array.isArray(json.data)).toBe(true);
      expect(json.meta).toEqual({ limit: 50, offset: 0, total: expect.any(Number) });
      expect(json.data.some((f: { id: string }) => f.id === stampedInvoiceId)).toBe(true);
    });

    it("rejects an invalid limit", async () => {
      const res = await GET(buildRequest("/api/v1/facturas?limit=0", { headers: authHeaders(token) }));
      expect(res.status).toBe(400);
    });

    it("filters by external_reference (#68)", async () => {
      const externalReference = `trip-${randomUUID()}`;
      const created = await POST(
        buildRequest("/api/v1/facturas", {
          method: "POST",
          headers: { ...authHeaders(token), "Idempotency-Key": randomUUID() },
          body: invoiceBody(customerId, { external_reference: externalReference }),
        })
      );
      const createdJson = await created.json();

      const res = await GET(
        buildRequest(`/api/v1/facturas?external_reference=${externalReference}`, { headers: authHeaders(token) })
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data).toHaveLength(1);
      expect(json.data[0].id).toBe(createdJson.id);
      expect(json.data[0].external_reference).toBe(externalReference);
    });
  });

  describe("GET /{id} (retrieve)", () => {
    it("rejects requests with no Authorization header", async () => {
      const res = await getFactura(buildRequest(`/api/v1/facturas/${stampedInvoiceId}`), idParams(stampedInvoiceId));
      expect(res.status).toBe(401);
    });

    it("returns the full raw invoice for a valid id", async () => {
      const res = await getFactura(
        buildRequest(`/api/v1/facturas/${stampedInvoiceId}`, { headers: authHeaders(token) }),
        idParams(stampedInvoiceId)
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.id).toBe(stampedInvoiceId);
    });

    it("returns a facturapi_error for an unknown id", async () => {
      const res = await getFactura(
        buildRequest("/api/v1/facturas/not-a-real-id", { headers: authHeaders(token) }),
        idParams("not-a-real-id")
      );
      expect(res.status).toBeGreaterThanOrEqual(400);
      const json = await res.json();
      expect(json.error.code).toBe("facturapi_error");
    });

    // NOTE: this route enforces tenant isolation entirely through FacturAPI
    // account boundaries (auth.orgId only selects which org's own FacturAPI
    // key to use — see src/lib/orgFacturapi.ts). Every test org here shares
    // the same FACTURAPI_TEST_API_KEY sandbox account (only one test
    // credential is available), so a cross-tenant fetch can't be
    // distinguished from a same-tenant one in this environment — a second
    // org's key would legitimately see the first org's invoice too, since
    // in the real account model they'd be different FacturAPI accounts
    // entirely. Not exercised here for that reason.
  });

  describe("POST /{id}/stamp", () => {
    it("rejects requests with no Authorization header", async () => {
      const res = await stampFactura(buildRequest(`/api/v1/facturas/${stampedInvoiceId}/stamp`, { method: "POST" }), idParams(stampedInvoiceId));
      expect(res.status).toBe(401);
    });

    it("rejects a stamp request with no Idempotency-Key header", async () => {
      const res = await stampFactura(
        buildRequest(`/api/v1/facturas/${stampedInvoiceId}/stamp`, { method: "POST", headers: authHeaders(token) }),
        idParams(stampedInvoiceId)
      );
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe("invalid_parameter");
    });

    // This account auto-stamps on creation (see beforeAll), so every
    // invoice reaching this route is already stamped — exercising the
    // route's real "already stamped" rejection rather than a happy path
    // that doesn't actually occur against this account.
    it("rejects stamping an invoice that is already stamped", async () => {
      const res = await stampFactura(
        buildRequest(`/api/v1/facturas/${stampedInvoiceId}/stamp`, {
          method: "POST",
          headers: { ...authHeaders(token), "Idempotency-Key": randomUUID() },
        }),
        idParams(stampedInvoiceId)
      );
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error.code).toBe("facturapi_error");
    });

    it("replaying the same stamp Idempotency-Key returns the same stored error, without a second FacturAPI call", async () => {
      const idemKey = randomUUID();

      const first = await stampFactura(
        buildRequest(`/api/v1/facturas/${stampedInvoiceId}/stamp`, { method: "POST", headers: { ...authHeaders(token), "Idempotency-Key": idemKey } }),
        idParams(stampedInvoiceId)
      );
      const replay = await stampFactura(
        buildRequest(`/api/v1/facturas/${stampedInvoiceId}/stamp`, { method: "POST", headers: { ...authHeaders(token), "Idempotency-Key": idemKey } }),
        idParams(stampedInvoiceId)
      );
      expect(replay.status).toBe(first.status);
      expect(await replay.json()).toEqual(await first.json());
    });
  });

  describe("GET /{id}/pdf", () => {
    it("rejects requests with no Authorization header", async () => {
      const res = await getPdf(buildRequest(`/api/v1/facturas/${stampedInvoiceId}/pdf`), idParams(stampedInvoiceId));
      expect(res.status).toBe(401);
    });

    it("returns a PDF for a stamped invoice", async () => {
      const res = await getPdf(
        buildRequest(`/api/v1/facturas/${stampedInvoiceId}/pdf`, { headers: authHeaders(token) }),
        idParams(stampedInvoiceId)
      );
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("application/pdf");
      const buf = await res.arrayBuffer();
      expect(buf.byteLength).toBeGreaterThan(0);
    });

    it("returns a facturapi_error for an unknown id", async () => {
      const res = await getPdf(
        buildRequest("/api/v1/facturas/not-a-real-id/pdf", { headers: authHeaders(token) }),
        idParams("not-a-real-id")
      );
      expect(res.status).toBeGreaterThanOrEqual(400);
      const json = await res.json();
      expect(json.error.code).toBe("facturapi_error");
    });
  });

  describe("GET /{id}/xml", () => {
    it("rejects requests with no Authorization header", async () => {
      const res = await getXml(buildRequest(`/api/v1/facturas/${stampedInvoiceId}/xml`), idParams(stampedInvoiceId));
      expect(res.status).toBe(401);
    });

    it("returns XML for a stamped invoice", async () => {
      const res = await getXml(
        buildRequest(`/api/v1/facturas/${stampedInvoiceId}/xml`, { headers: authHeaders(token) }),
        idParams(stampedInvoiceId)
      );
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("application/xml");
      const buf = await res.arrayBuffer();
      expect(buf.byteLength).toBeGreaterThan(0);
    });

    it("returns a facturapi_error for an unknown id", async () => {
      const res = await getXml(
        buildRequest("/api/v1/facturas/not-a-real-id/xml", { headers: authHeaders(token) }),
        idParams("not-a-real-id")
      );
      expect(res.status).toBeGreaterThanOrEqual(400);
      const json = await res.json();
      expect(json.error.code).toBe("facturapi_error");
    });
  });

  describe("DELETE /{id} (cancel)", () => {
    it("rejects requests with no Authorization header", async () => {
      const res = await cancelFactura(buildRequest(`/api/v1/facturas/${stampedInvoiceId}`, { method: "DELETE" }), idParams(stampedInvoiceId));
      expect(res.status).toBe(401);
    });

    it("cancels a stamped invoice with a motive", async () => {
      const createRes = await POST(
        buildRequest("/api/v1/facturas", {
          method: "POST",
          headers: { ...authHeaders(token), "Idempotency-Key": randomUUID() },
          body: invoiceBody(customerId),
        })
      );
      const created = await createRes.json();
      await stampFactura(
        buildRequest(`/api/v1/facturas/${created.id}/stamp`, { method: "POST", headers: { ...authHeaders(token), "Idempotency-Key": randomUUID() } }),
        idParams(created.id)
      );

      const res = await cancelFactura(
        buildRequest(`/api/v1/facturas/${created.id}?motive=02`, { method: "DELETE", headers: authHeaders(token) }),
        idParams(created.id)
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status === "canceled" || !!json.cancellation_status).toBe(true);
    });

    it("returns a facturapi_error when cancelling an unknown id", async () => {
      const res = await cancelFactura(
        buildRequest("/api/v1/facturas/not-a-real-id?motive=02", { method: "DELETE", headers: authHeaders(token) }),
        idParams("not-a-real-id")
      );
      expect(res.status).toBeGreaterThanOrEqual(400);
      const json = await res.json();
      expect(json.error.code).toBe("facturapi_error");
    });
  });
});
