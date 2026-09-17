import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET, POST } from "@/app/api/v1/vehiculos/route";
import { DELETE, GET as GET_ONE, PUT } from "@/app/api/v1/vehiculos/[id]/route";
import { authHeaders, buildRequest, cleanupOrg, createApiKey, createTestOrg } from "../../helpers";

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("/api/v1/vehiculos", () => {
  let orgId: string;
  let token: string;
  let otherOrgId: string;
  let otherToken: string;

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
      const res = await GET(buildRequest("/api/v1/vehiculos"));
      expect(res.status).toBe(401);
    });

    it("returns an empty list envelope for an org with no vehículos", async () => {
      const freshOrg = await createTestOrg({ withFacturapi: false });
      const freshToken = await createApiKey(freshOrg);
      const res = await GET(buildRequest("/api/v1/vehiculos", { headers: authHeaders(freshToken) }));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual({ data: [] });
      await cleanupOrg(freshOrg);
    });

    it("lists a created vehículo", async () => {
      const create = await POST(
        buildRequest("/api/v1/vehiculos", { method: "POST", headers: authHeaders(token), body: { placa: "LIST-001" } })
      );
      expect(create.status).toBe(201);

      const res = await GET(buildRequest("/api/v1/vehiculos", { headers: authHeaders(token) }));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.some((v: { placa: string }) => v.placa === "LIST-001")).toBe(true);
    });

    it("filters by active=false to exclude active vehículos", async () => {
      const res = await GET(buildRequest("/api/v1/vehiculos?active=false", { headers: authHeaders(token) }));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.every((v: { active: boolean }) => v.active === false)).toBe(true);
    });
  });

  describe("POST (create)", () => {
    it("rejects requests with no Authorization header", async () => {
      const res = await POST(buildRequest("/api/v1/vehiculos", { method: "POST", body: { placa: "X" } }));
      expect(res.status).toBe(401);
    });

    it("rejects a payload missing the required placa field", async () => {
      const res = await POST(
        buildRequest("/api/v1/vehiculos", { method: "POST", headers: authHeaders(token), body: {} })
      );
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe("invalid_parameter");
    });

    it("creates a vehículo with only the required field", async () => {
      const res = await POST(
        buildRequest("/api/v1/vehiculos", { method: "POST", headers: authHeaders(token), body: { placa: "ABC-123" } })
      );
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json).toEqual(expect.objectContaining({ id: expect.any(String), placa: "ABC-123", active: true }));
    });

    it("creates a vehículo with optional fields and remolques", async () => {
      const res = await POST(
        buildRequest("/api/v1/vehiculos", {
          method: "POST",
          headers: authHeaders(token),
          body: {
            placa: "FULL-999",
            config_vehicular: "C2",
            remolques: [{ sub_tipo_remolque: "CTR001", placa: "REM-1" }],
          },
        })
      );
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.config_vehicular).toBe("C2");
      expect(json.remolques).toEqual([{ sub_tipo_remolque: "CTR001", placa: "REM-1" }]);
    });
  });

  describe("GET /:id", () => {
    it("rejects requests with no Authorization header", async () => {
      const res = await GET_ONE(buildRequest("/api/v1/vehiculos/veh_x"), ctx("veh_x"));
      expect(res.status).toBe(401);
    });

    it("returns 404 for a malformed id (wrong prefix)", async () => {
      const res = await GET_ONE(buildRequest("/api/v1/vehiculos/wrong_123", { headers: authHeaders(token) }), ctx("wrong_123"));
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error.code).toBe("not_found");
    });

    it("returns 404 for a well-formed but nonexistent id", async () => {
      const fakeId = "veh_00000000-0000-0000-0000-000000000000";
      const res = await GET_ONE(buildRequest(`/api/v1/vehiculos/${fakeId}`, { headers: authHeaders(token) }), ctx(fakeId));
      expect(res.status).toBe(404);
    });

    it("returns the created vehículo by its public id", async () => {
      const created = await (
        await POST(buildRequest("/api/v1/vehiculos", { method: "POST", headers: authHeaders(token), body: { placa: "GET-1" } }))
      ).json();
      const res = await GET_ONE(buildRequest(`/api/v1/vehiculos/${created.id}`, { headers: authHeaders(token) }), ctx(created.id));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.placa).toBe("GET-1");
    });

    it("returns 404 for a vehículo id belonging to a different org", async () => {
      otherOrgId = await createTestOrg({ withFacturapi: false });
      otherToken = await createApiKey(otherOrgId);
      const created = await (
        await POST(buildRequest("/api/v1/vehiculos", { method: "POST", headers: authHeaders(otherToken), body: { placa: "OTHER-ORG" } }))
      ).json();

      const res = await GET_ONE(buildRequest(`/api/v1/vehiculos/${created.id}`, { headers: authHeaders(token) }), ctx(created.id));
      expect(res.status).toBe(404);
    });
  });

  describe("PUT /:id", () => {
    it("rejects an invalid body", async () => {
      const created = await (
        await POST(buildRequest("/api/v1/vehiculos", { method: "POST", headers: authHeaders(token), body: { placa: "PUT-1" } }))
      ).json();
      const res = await PUT(
        buildRequest(`/api/v1/vehiculos/${created.id}`, { method: "PUT", headers: authHeaders(token), body: { placa: 123 } }),
        ctx(created.id)
      );
      expect(res.status).toBe(400);
    });

    it("updates only the provided fields, leaving others untouched", async () => {
      const created = await (
        await POST(
          buildRequest("/api/v1/vehiculos", {
            method: "POST",
            headers: authHeaders(token),
            body: { placa: "PUT-2", config_vehicular: "C3" },
          })
        )
      ).json();

      const res = await PUT(
        buildRequest(`/api/v1/vehiculos/${created.id}`, {
          method: "PUT",
          headers: authHeaders(token),
          body: { placa: "PUT-2-RENAMED" },
        }),
        ctx(created.id)
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.placa).toBe("PUT-2-RENAMED");
      expect(json.config_vehicular).toBe("C3");
    });

    it("returns 404 when updating a nonexistent id", async () => {
      const fakeId = "veh_00000000-0000-0000-0000-000000000001";
      const res = await PUT(
        buildRequest(`/api/v1/vehiculos/${fakeId}`, { method: "PUT", headers: authHeaders(token), body: { placa: "X" } }),
        ctx(fakeId)
      );
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /:id", () => {
    it("soft-deletes (deactivates) a vehículo instead of removing it", async () => {
      const created = await (
        await POST(buildRequest("/api/v1/vehiculos", { method: "POST", headers: authHeaders(token), body: { placa: "DEL-1" } }))
      ).json();

      const res = await DELETE(buildRequest(`/api/v1/vehiculos/${created.id}`, { method: "DELETE", headers: authHeaders(token) }), ctx(created.id));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.active).toBe(false);

      const getRes = await GET_ONE(buildRequest(`/api/v1/vehiculos/${created.id}`, { headers: authHeaders(token) }), ctx(created.id));
      expect((await getRes.json()).active).toBe(false);
    });

    it("returns 404 when deleting a nonexistent id", async () => {
      const fakeId = "veh_00000000-0000-0000-0000-000000000002";
      const res = await DELETE(buildRequest(`/api/v1/vehiculos/${fakeId}`, { method: "DELETE", headers: authHeaders(token) }), ctx(fakeId));
      expect(res.status).toBe(404);
    });
  });
});
