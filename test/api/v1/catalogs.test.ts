import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as getClavesProdServ } from "@/app/api/v1/catalogs/claves-prod-serv/route";
import { GET as getUnidades } from "@/app/api/v1/catalogs/unidades/route";
import { authHeaders, buildRequest, cleanupOrg, createApiKey, createTestOrg } from "../../helpers";

describe("/api/v1/catalogs", () => {
  let orgId: string;
  let token: string;

  beforeAll(async () => {
    orgId = await createTestOrg({ withFacturapi: false });
    token = await createApiKey(orgId);
  });

  afterAll(async () => {
    await cleanupOrg(orgId);
  });

  describe("GET /catalogs/claves-prod-serv", () => {
    it("rejects requests with no Authorization header", async () => {
      const res = await getClavesProdServ(buildRequest("/api/v1/catalogs/claves-prod-serv"));
      expect(res.status).toBe(401);
    });

    it("returns matches for a real search term", async () => {
      const res = await getClavesProdServ(
        buildRequest("/api/v1/catalogs/claves-prod-serv?q=frijol", { headers: authHeaders(token) })
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(Array.isArray(json.data)).toBe(true);
      expect(json.data.length).toBeGreaterThan(0);
    });

    it("returns an empty list for a query with no matches", async () => {
      const res = await getClavesProdServ(
        buildRequest("/api/v1/catalogs/claves-prod-serv?q=zzzznonexistentqueryzzzz", { headers: authHeaders(token) })
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data).toEqual([]);
    });

    it("treats a missing q as an unfiltered search rather than an error", async () => {
      const res = await getClavesProdServ(buildRequest("/api/v1/catalogs/claves-prod-serv", { headers: authHeaders(token) }));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(Array.isArray(json.data)).toBe(true);
    });
  });

  describe("GET /catalogs/unidades", () => {
    it("rejects requests with no Authorization header", async () => {
      const res = await getUnidades(buildRequest("/api/v1/catalogs/unidades"));
      expect(res.status).toBe(401);
    });

    it("returns matches for a real search term", async () => {
      const res = await getUnidades(buildRequest("/api/v1/catalogs/unidades?q=kilogramo", { headers: authHeaders(token) }));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(Array.isArray(json.data)).toBe(true);
      expect(json.data.length).toBeGreaterThan(0);
    });

    it("matches by key prefix as well as free text", async () => {
      const res = await getUnidades(buildRequest("/api/v1/catalogs/unidades?q=H87", { headers: authHeaders(token) }));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(Array.isArray(json.data)).toBe(true);
      expect(json.data.length).toBeGreaterThan(0);
    });

    it("returns an empty list for a query with no matches", async () => {
      const res = await getUnidades(
        buildRequest("/api/v1/catalogs/unidades?q=zzzznonexistentqueryzzzz", { headers: authHeaders(token) })
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data).toEqual([]);
    });
  });
});
