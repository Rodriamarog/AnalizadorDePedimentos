import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET, POST } from "@/app/api/v1/direcciones/route";
import { DELETE, GET as GET_ONE, PUT } from "@/app/api/v1/direcciones/[id]/route";
import { authHeaders, buildRequest, cleanupOrg, createApiKey, createTestOrg } from "../../helpers";

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("/api/v1/direcciones", () => {
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
      const res = await GET(buildRequest("/api/v1/direcciones"));
      expect(res.status).toBe(401);
    });

    it("lists a created dirección", async () => {
      await POST(
        buildRequest("/api/v1/direcciones", {
          method: "POST",
          headers: authHeaders(token),
          body: { tipo: "origen", etiqueta: "Bodega Central", rfc: "BOCE010101AAA" },
        })
      );
      const res = await GET(buildRequest("/api/v1/direcciones", { headers: authHeaders(token) }));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.some((d: { etiqueta: string }) => d.etiqueta === "Bodega Central")).toBe(true);
    });

    it("filters by tipo=destino", async () => {
      await POST(
        buildRequest("/api/v1/direcciones", {
          method: "POST",
          headers: authHeaders(token),
          body: { tipo: "destino", etiqueta: "Cliente Final", rfc: "CLFI020202BBB" },
        })
      );
      const res = await GET(buildRequest("/api/v1/direcciones?tipo=destino", { headers: authHeaders(token) }));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.length).toBeGreaterThan(0);
      expect(json.data.every((d: { tipo: string }) => d.tipo === "destino")).toBe(true);
    });

    it("filters by active=false", async () => {
      const res = await GET(buildRequest("/api/v1/direcciones?active=false", { headers: authHeaders(token) }));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.every((d: { active: boolean }) => d.active === false)).toBe(true);
    });
  });

  describe("POST (create)", () => {
    it("rejects requests with no Authorization header", async () => {
      const res = await POST(
        buildRequest("/api/v1/direcciones", { method: "POST", body: { tipo: "origen", etiqueta: "X", rfc: "Y" } })
      );
      expect(res.status).toBe(401);
    });

    it("rejects a payload missing required fields", async () => {
      const res = await POST(
        buildRequest("/api/v1/direcciones", { method: "POST", headers: authHeaders(token), body: { etiqueta: "No Tipo" } })
      );
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe("invalid_parameter");
    });

    it("rejects an invalid tipo enum value", async () => {
      const res = await POST(
        buildRequest("/api/v1/direcciones", {
          method: "POST",
          headers: authHeaders(token),
          body: { tipo: "sideways", etiqueta: "Bad Tipo", rfc: "BATI030303CCC" },
        })
      );
      expect(res.status).toBe(400);
    });

    it("creates a dirección with required fields only", async () => {
      const res = await POST(
        buildRequest("/api/v1/direcciones", {
          method: "POST",
          headers: authHeaders(token),
          body: { tipo: "origen", etiqueta: "Minimal", rfc: "MINI040404DDD" },
        })
      );
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json).toEqual(expect.objectContaining({ id: expect.any(String), tipo: "origen", etiqueta: "Minimal", active: true }));
    });

    it("creates a dirección with full address fields", async () => {
      const res = await POST(
        buildRequest("/api/v1/direcciones", {
          method: "POST",
          headers: authHeaders(token),
          body: {
            tipo: "destino",
            etiqueta: "Full Address",
            rfc: "FULL050505EEE",
            calle: "Av Reforma",
            codigo_postal: "06600",
          },
        })
      );
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.calle).toBe("Av Reforma");
      expect(json.codigo_postal).toBe("06600");
    });
  });

  describe("GET /:id", () => {
    it("returns 404 for a malformed id", async () => {
      const res = await GET_ONE(buildRequest("/api/v1/direcciones/wrong_1", { headers: authHeaders(token) }), ctx("wrong_1"));
      expect(res.status).toBe(404);
    });

    it("returns 404 for a well-formed but nonexistent id", async () => {
      const fakeId = "dir_00000000-0000-0000-0000-000000000000";
      const res = await GET_ONE(buildRequest(`/api/v1/direcciones/${fakeId}`, { headers: authHeaders(token) }), ctx(fakeId));
      expect(res.status).toBe(404);
    });

    it("returns the created dirección by its public id", async () => {
      const created = await (
        await POST(
          buildRequest("/api/v1/direcciones", { method: "POST", headers: authHeaders(token), body: { tipo: "origen", etiqueta: "Get Me", rfc: "GETM060606FFF" } })
        )
      ).json();
      const res = await GET_ONE(buildRequest(`/api/v1/direcciones/${created.id}`, { headers: authHeaders(token) }), ctx(created.id));
      expect(res.status).toBe(200);
      expect((await res.json()).etiqueta).toBe("Get Me");
    });

    it("returns 404 for a dirección id belonging to a different org", async () => {
      otherOrgId = await createTestOrg({ withFacturapi: false });
      const otherToken = await createApiKey(otherOrgId);
      const created = await (
        await POST(
          buildRequest("/api/v1/direcciones", { method: "POST", headers: authHeaders(otherToken), body: { tipo: "origen", etiqueta: "Other Org", rfc: "OTOR070707GGG" } })
        )
      ).json();

      const res = await GET_ONE(buildRequest(`/api/v1/direcciones/${created.id}`, { headers: authHeaders(token) }), ctx(created.id));
      expect(res.status).toBe(404);
    });
  });

  describe("PUT /:id", () => {
    it("updates only the provided fields", async () => {
      const created = await (
        await POST(
          buildRequest("/api/v1/direcciones", { method: "POST", headers: authHeaders(token), body: { tipo: "origen", etiqueta: "Put Test", rfc: "PUTT080808HHH" } })
        )
      ).json();

      const res = await PUT(
        buildRequest(`/api/v1/direcciones/${created.id}`, { method: "PUT", headers: authHeaders(token), body: { etiqueta: "Put Renamed" } }),
        ctx(created.id)
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.etiqueta).toBe("Put Renamed");
      expect(json.rfc).toBe("PUTT080808HHH");
    });

    it("rejects an attempt to change tipo via PUT (immutable field)", async () => {
      const created = await (
        await POST(
          buildRequest("/api/v1/direcciones", { method: "POST", headers: authHeaders(token), body: { tipo: "origen", etiqueta: "Immutable Test", rfc: "IMMU090909III" } })
        )
      ).json();

      const res = await PUT(
        buildRequest(`/api/v1/direcciones/${created.id}`, { method: "PUT", headers: authHeaders(token), body: { tipo: "destino" } }),
        ctx(created.id)
      );
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.details?.[0]?.field).toBe("tipo");
    });

    it("returns 404 when updating a nonexistent id", async () => {
      const fakeId = "dir_00000000-0000-0000-0000-000000000001";
      const res = await PUT(
        buildRequest(`/api/v1/direcciones/${fakeId}`, { method: "PUT", headers: authHeaders(token), body: { etiqueta: "X" } }),
        ctx(fakeId)
      );
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /:id", () => {
    it("soft-deletes (deactivates) a dirección", async () => {
      const created = await (
        await POST(
          buildRequest("/api/v1/direcciones", { method: "POST", headers: authHeaders(token), body: { tipo: "origen", etiqueta: "Del Test", rfc: "DELT101010JJJ" } })
        )
      ).json();

      const res = await DELETE(buildRequest(`/api/v1/direcciones/${created.id}`, { method: "DELETE", headers: authHeaders(token) }), ctx(created.id));
      expect(res.status).toBe(200);
      expect((await res.json()).active).toBe(false);
    });

    it("returns 404 when deleting a nonexistent id", async () => {
      const fakeId = "dir_00000000-0000-0000-0000-000000000002";
      const res = await DELETE(buildRequest(`/api/v1/direcciones/${fakeId}`, { method: "DELETE", headers: authHeaders(token) }), ctx(fakeId));
      expect(res.status).toBe(404);
    });
  });
});
