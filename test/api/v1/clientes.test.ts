import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET, POST } from "@/app/api/v1/clientes/route";
import { authHeaders, buildRequest, cleanupOrg, createApiKey, createTestOrg } from "../../helpers";

describe("/api/v1/clientes", () => {
  let orgId: string;
  let token: string;

  beforeAll(async () => {
    orgId = await createTestOrg();
    token = await createApiKey(orgId);
  });

  afterAll(async () => {
    await cleanupOrg(orgId);
  });

  describe("GET", () => {
    it("rejects requests with no Authorization header", async () => {
      const res = await GET(buildRequest("/api/v1/clientes"));
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error.code).toBe("unauthorized");
    });

    it("rejects requests with an invalid bearer token", async () => {
      const res = await GET(buildRequest("/api/v1/clientes", { headers: authHeaders("garbage") }));
      expect(res.status).toBe(401);
    });

    it("returns a paginated envelope for a valid key", async () => {
      const res = await GET(buildRequest("/api/v1/clientes", { headers: authHeaders(token) }));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(Array.isArray(json.data)).toBe(true);
      expect(json.meta).toEqual(
        expect.objectContaining({ limit: expect.any(Number), offset: expect.any(Number), total: expect.any(Number) })
      );
    });

    it("rejects a negative limit as an invalid parameter", async () => {
      const res = await GET(buildRequest("/api/v1/clientes?limit=-1", { headers: authHeaders(token) }));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe("invalid_parameter");
    });
  });

  describe("POST", () => {
    it("rejects requests with no Authorization header", async () => {
      const res = await POST(
        buildRequest("/api/v1/clientes", { method: "POST", body: { legal_name: "x", tax_id: "y", tax_system: "601" } })
      );
      expect(res.status).toBe(401);
    });

    it("rejects a payload missing required fields", async () => {
      const res = await POST(
        buildRequest("/api/v1/clientes", { method: "POST", headers: authHeaders(token), body: { legal_name: "Acme" } })
      );
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe("invalid_parameter");
    });

    it("creates a cliente for a valid payload", async () => {
      const res = await POST(
        buildRequest("/api/v1/clientes", {
          method: "POST",
          headers: authHeaders(token),
          body: {
            legal_name: `Test Cliente ${Date.now()}`,
            tax_id: "XAXX010101000",
            tax_system: "616",
            email: "test@example.com",
          },
        })
      );
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json).toEqual(expect.objectContaining({ id: expect.any(String), tax_id: "XAXX010101000" }));
    });

    it("rejects a malformed tax_id (RFC) without calling FacturAPI (#71)", async () => {
      const res = await POST(
        buildRequest("/api/v1/clientes", {
          method: "POST",
          headers: authHeaders(token),
          body: { legal_name: "Acme", tax_id: "NOT-A-RFC", tax_system: "616" },
        })
      );
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe("invalid_parameter");
      expect(json.error.details).toEqual([{ field: "tax_id", issue: "invalid_format" }]);
    });

    it("rejects a malformed zip (código postal) without calling FacturAPI (#71)", async () => {
      const res = await POST(
        buildRequest("/api/v1/clientes", {
          method: "POST",
          headers: authHeaders(token),
          body: { legal_name: "Acme", tax_id: "XAXX010101000", tax_system: "616", zip: "abc" },
        })
      );
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe("invalid_parameter");
      expect(json.error.details).toEqual([{ field: "zip", issue: "invalid_format" }]);
    });
  });
});
