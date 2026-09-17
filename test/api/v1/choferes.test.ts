import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET, POST } from "@/app/api/v1/choferes/route";
import { DELETE, GET as GET_ONE, PUT } from "@/app/api/v1/choferes/[id]/route";
import { authHeaders, buildRequest, cleanupOrg, createApiKey, createTestOrg } from "../../helpers";

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("/api/v1/choferes", () => {
  let orgId: string;
  let token: string;
  let otherOrgId: string;

  beforeAll(async () => {
    orgId = await createTestOrg({ withFacturapi: false });
    token = await createApiKey(orgId);
  });

  afterAll(async () => {
    await cleanupOrg(orgId);
    if (otherOrgId) await cleanupOrg(otherOrgId);
  });

  describe("GET (list)", () => {
    it("rejects requests with no Authorization header", async () => {
      const res = await GET(buildRequest("/api/v1/choferes"));
      expect(res.status).toBe(401);
    });

    it("lists a created chofer", async () => {
      await POST(
        buildRequest("/api/v1/choferes", {
          method: "POST",
          headers: authHeaders(token),
          body: { nombre: "Juan Perez", rfc: "PEPJ800101ABC" },
        })
      );
      const res = await GET(buildRequest("/api/v1/choferes", { headers: authHeaders(token) }));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.some((c: { nombre: string }) => c.nombre === "Juan Perez")).toBe(true);
    });

    it("filters by active=false", async () => {
      const res = await GET(buildRequest("/api/v1/choferes?active=false", { headers: authHeaders(token) }));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.every((c: { active: boolean }) => c.active === false)).toBe(true);
    });
  });

  describe("POST (create)", () => {
    it("rejects requests with no Authorization header", async () => {
      const res = await POST(buildRequest("/api/v1/choferes", { method: "POST", body: { nombre: "X", rfc: "Y" } }));
      expect(res.status).toBe(401);
    });

    it("rejects a payload missing required fields", async () => {
      const res = await POST(
        buildRequest("/api/v1/choferes", { method: "POST", headers: authHeaders(token), body: { nombre: "Only Name" } })
      );
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe("invalid_parameter");
    });

    it("creates a chofer with required fields only", async () => {
      const res = await POST(
        buildRequest("/api/v1/choferes", {
          method: "POST",
          headers: authHeaders(token),
          body: { nombre: "Maria Lopez", rfc: "LOMA850202XYZ" },
        })
      );
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json).toEqual(expect.objectContaining({ id: expect.any(String), nombre: "Maria Lopez", rfc: "LOMA850202XYZ", active: true }));
    });

    it("creates a chofer with numero_licencia set", async () => {
      const res = await POST(
        buildRequest("/api/v1/choferes", {
          method: "POST",
          headers: authHeaders(token),
          body: { nombre: "Carlos Ruiz", rfc: "RUCA900303LMN", numero_licencia: "LIC-123" },
        })
      );
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.numero_licencia).toBe("LIC-123");
    });
  });

  describe("GET /:id", () => {
    it("rejects requests with no Authorization header", async () => {
      const res = await GET_ONE(buildRequest("/api/v1/choferes/chf_x"), ctx("chf_x"));
      expect(res.status).toBe(401);
    });

    it("returns 404 for a malformed id", async () => {
      const res = await GET_ONE(buildRequest("/api/v1/choferes/wrong_1", { headers: authHeaders(token) }), ctx("wrong_1"));
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error.code).toBe("not_found");
    });

    it("returns 404 for a well-formed but nonexistent id", async () => {
      const fakeId = "chf_00000000-0000-0000-0000-000000000000";
      const res = await GET_ONE(buildRequest(`/api/v1/choferes/${fakeId}`, { headers: authHeaders(token) }), ctx(fakeId));
      expect(res.status).toBe(404);
    });

    it("returns the created chofer by its public id", async () => {
      const created = await (
        await POST(
          buildRequest("/api/v1/choferes", { method: "POST", headers: authHeaders(token), body: { nombre: "Get Test", rfc: "GETT010101AAA" } })
        )
      ).json();
      const res = await GET_ONE(buildRequest(`/api/v1/choferes/${created.id}`, { headers: authHeaders(token) }), ctx(created.id));
      expect(res.status).toBe(200);
      expect((await res.json()).nombre).toBe("Get Test");
    });

    it("returns 404 for a chofer id belonging to a different org", async () => {
      otherOrgId = await createTestOrg({ withFacturapi: false });
      const otherToken = await createApiKey(otherOrgId);
      const created = await (
        await POST(
          buildRequest("/api/v1/choferes", { method: "POST", headers: authHeaders(otherToken), body: { nombre: "Other Org", rfc: "OTOR020202BBB" } })
        )
      ).json();

      const res = await GET_ONE(buildRequest(`/api/v1/choferes/${created.id}`, { headers: authHeaders(token) }), ctx(created.id));
      expect(res.status).toBe(404);
    });
  });

  describe("PUT /:id", () => {
    it("updates only the provided fields", async () => {
      const created = await (
        await POST(
          buildRequest("/api/v1/choferes", { method: "POST", headers: authHeaders(token), body: { nombre: "Put Test", rfc: "PUTT030303CCC" } })
        )
      ).json();

      const res = await PUT(
        buildRequest(`/api/v1/choferes/${created.id}`, { method: "PUT", headers: authHeaders(token), body: { nombre: "Put Renamed" } }),
        ctx(created.id)
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.nombre).toBe("Put Renamed");
      expect(json.rfc).toBe("PUTT030303CCC");
    });

    it("returns 404 when updating a nonexistent id", async () => {
      const fakeId = "chf_00000000-0000-0000-0000-000000000001";
      const res = await PUT(
        buildRequest(`/api/v1/choferes/${fakeId}`, { method: "PUT", headers: authHeaders(token), body: { nombre: "X" } }),
        ctx(fakeId)
      );
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /:id", () => {
    it("soft-deletes (deactivates) a chofer", async () => {
      const created = await (
        await POST(
          buildRequest("/api/v1/choferes", { method: "POST", headers: authHeaders(token), body: { nombre: "Del Test", rfc: "DELT040404DDD" } })
        )
      ).json();

      const res = await DELETE(buildRequest(`/api/v1/choferes/${created.id}`, { method: "DELETE", headers: authHeaders(token) }), ctx(created.id));
      expect(res.status).toBe(200);
      expect((await res.json()).active).toBe(false);
    });

    it("returns 404 when deleting a nonexistent id", async () => {
      const fakeId = "chf_00000000-0000-0000-0000-000000000002";
      const res = await DELETE(buildRequest(`/api/v1/choferes/${fakeId}`, { method: "DELETE", headers: authHeaders(token) }), ctx(fakeId));
      expect(res.status).toBe(404);
    });
  });
});
