import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET, POST } from "@/app/api/v1/productos/route";
import { GET as GET_ONE, PUT, DELETE } from "@/app/api/v1/productos/[id]/route";
import { authHeaders, buildRequest, cleanupOrg, createApiKey, createTestOrg } from "../../helpers";

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("/api/v1/productos", () => {
  let orgId: string;
  let token: string;
  let otherOrgId: string;
  let otherToken: string;

  beforeAll(async () => {
    orgId = await createTestOrg();
    token = await createApiKey(orgId);
    otherOrgId = await createTestOrg();
    otherToken = await createApiKey(otherOrgId);
  });

  afterAll(async () => {
    await cleanupOrg(orgId);
    await cleanupOrg(otherOrgId);
  });

  describe("GET (list)", () => {
    it("rejects requests with no Authorization header", async () => {
      const res = await GET(buildRequest("/api/v1/productos"));
      expect(res.status).toBe(401);
    });

    it("returns an empty list envelope for an org with no productos", async () => {
      const res = await GET(buildRequest("/api/v1/productos", { headers: authHeaders(token) }));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual({ data: [] });
    });

    it("returns created productos and never another org's rows", async () => {
      await POST(
        buildRequest("/api/v1/productos", {
          method: "POST",
          headers: authHeaders(token),
          body: { fraccion: "8471.30.01", descripcion: "Laptop" },
        })
      );
      await POST(
        buildRequest("/api/v1/productos", {
          method: "POST",
          headers: authHeaders(otherToken),
          body: { fraccion: "8471.30.99", descripcion: "Other org laptop" },
        })
      );

      const res = await GET(buildRequest("/api/v1/productos", { headers: authHeaders(token) }));
      const json = await res.json();
      expect(json.data).toHaveLength(1);
      expect(json.data[0].fraccion).toBe("8471.30.01");
    });

    it("filters by the fraccion query param", async () => {
      const res = await GET(
        buildRequest("/api/v1/productos?fraccion=8471.30.01", { headers: authHeaders(token) })
      );
      const json = await res.json();
      expect(json.data).toHaveLength(1);
      expect(json.data[0].fraccion).toBe("8471.30.01");
    });

    it("returns an empty list for a fraccion that doesn't match", async () => {
      const res = await GET(
        buildRequest("/api/v1/productos?fraccion=0000.00.00", { headers: authHeaders(token) })
      );
      const json = await res.json();
      expect(json.data).toEqual([]);
    });
  });

  describe("POST (create)", () => {
    it("rejects requests with no Authorization header", async () => {
      const res = await POST(
        buildRequest("/api/v1/productos", { method: "POST", body: { fraccion: "1", descripcion: "x" } })
      );
      expect(res.status).toBe(401);
    });

    it("rejects a payload missing required fields", async () => {
      const res = await POST(
        buildRequest("/api/v1/productos", { method: "POST", headers: authHeaders(token), body: { fraccion: "1" } })
      );
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe("invalid_parameter");
    });

    it("creates a producto with only the required fields, defaulting unit_key", async () => {
      const res = await POST(
        buildRequest("/api/v1/productos", {
          method: "POST",
          headers: authHeaders(token),
          body: { fraccion: "9999.99.01", descripcion: "Widget" },
        })
      );
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json).toEqual(
        expect.objectContaining({
          id: expect.stringMatching(/^prd_/),
          fraccion: "9999.99.01",
          descripcion: "Widget",
          unit_key: "H87",
          clave_prod_serv: null,
        })
      );
    });

    it("rejects a duplicate fraccion for the same org with 409", async () => {
      const res = await POST(
        buildRequest("/api/v1/productos", {
          method: "POST",
          headers: authHeaders(token),
          body: { fraccion: "9999.99.01", descripcion: "Widget again" },
        })
      );
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error.code).toBe("already_exists");
    });

    it("allows the same fraccion across two different orgs", async () => {
      const res = await POST(
        buildRequest("/api/v1/productos", {
          method: "POST",
          headers: authHeaders(otherToken),
          body: { fraccion: "9999.99.01", descripcion: "Widget in another org" },
        })
      );
      expect(res.status).toBe(201);
    });
  });

  describe("GET /:id, PUT /:id, DELETE /:id", () => {
    let productoId: string;

    beforeAll(async () => {
      const res = await POST(
        buildRequest("/api/v1/productos", {
          method: "POST",
          headers: authHeaders(token),
          body: { fraccion: "1234.56.78", descripcion: "Gadget", clave_prod_serv: "43211500" },
        })
      );
      const json = await res.json();
      productoId = json.id;
    });

    it("GET rejects requests with no Authorization header", async () => {
      const res = await GET_ONE(buildRequest(`/api/v1/productos/${productoId}`), params(productoId));
      expect(res.status).toBe(401);
    });

    it("GET returns 404 for a malformed id (wrong prefix)", async () => {
      const res = await GET_ONE(
        buildRequest("/api/v1/productos/not-a-real-id", { headers: authHeaders(token) }),
        params("not-a-real-id")
      );
      expect(res.status).toBe(404);
    });

    it("GET returns 404 for a well-formed id that doesn't exist", async () => {
      const fakeId = "prd_00000000-0000-0000-0000-000000000000";
      const res = await GET_ONE(buildRequest(`/api/v1/productos/${fakeId}`, { headers: authHeaders(token) }), params(fakeId));
      expect(res.status).toBe(404);
    });

    it("GET returns 404 when the producto belongs to a different org", async () => {
      const res = await GET_ONE(
        buildRequest(`/api/v1/productos/${productoId}`, { headers: authHeaders(otherToken) }),
        params(productoId)
      );
      expect(res.status).toBe(404);
    });

    it("GET returns the producto for its owning org", async () => {
      const res = await GET_ONE(buildRequest(`/api/v1/productos/${productoId}`, { headers: authHeaders(token) }), params(productoId));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual(expect.objectContaining({ id: productoId, fraccion: "1234.56.78" }));
    });

    it("PUT rejects requests with no Authorization header", async () => {
      const res = await PUT(
        buildRequest(`/api/v1/productos/${productoId}`, { method: "PUT", body: { descripcion: "x" } }),
        params(productoId)
      );
      expect(res.status).toBe(401);
    });

    it("PUT returns 404 for a nonexistent id", async () => {
      const fakeId = "prd_00000000-0000-0000-0000-000000000000";
      const res = await PUT(
        buildRequest(`/api/v1/productos/${fakeId}`, { method: "PUT", headers: authHeaders(token), body: { descripcion: "x" } }),
        params(fakeId)
      );
      expect(res.status).toBe(404);
    });

    it("PUT updates only the provided fields, leaving others untouched", async () => {
      const res = await PUT(
        buildRequest(`/api/v1/productos/${productoId}`, {
          method: "PUT",
          headers: authHeaders(token),
          body: { descripcion: "Gadget v2" },
        }),
        params(productoId)
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.descripcion).toBe("Gadget v2");
      expect(json.clave_prod_serv).toBe("43211500");
    });

    it("PUT can null out clave_prod_serv explicitly", async () => {
      const res = await PUT(
        buildRequest(`/api/v1/productos/${productoId}`, {
          method: "PUT",
          headers: authHeaders(token),
          body: { clave_prod_serv: null },
        }),
        params(productoId)
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.clave_prod_serv).toBeNull();
    });

    it("DELETE rejects requests with no Authorization header", async () => {
      const res = await DELETE(buildRequest(`/api/v1/productos/${productoId}`, { method: "DELETE" }), params(productoId));
      expect(res.status).toBe(401);
    });

    it("DELETE returns 404 for a different org's producto", async () => {
      const res = await DELETE(
        buildRequest(`/api/v1/productos/${productoId}`, { method: "DELETE", headers: authHeaders(otherToken) }),
        params(productoId)
      );
      expect(res.status).toBe(404);
    });

    it("DELETE removes the producto and returns 204", async () => {
      const res = await DELETE(
        buildRequest(`/api/v1/productos/${productoId}`, { method: "DELETE", headers: authHeaders(token) }),
        params(productoId)
      );
      expect(res.status).toBe(204);

      const getAfter = await GET_ONE(buildRequest(`/api/v1/productos/${productoId}`, { headers: authHeaders(token) }), params(productoId));
      expect(getAfter.status).toBe(404);
    });

    it("DELETE on an already-deleted id returns 404", async () => {
      const res = await DELETE(
        buildRequest(`/api/v1/productos/${productoId}`, { method: "DELETE", headers: authHeaders(token) }),
        params(productoId)
      );
      expect(res.status).toBe(404);
    });
  });
});
