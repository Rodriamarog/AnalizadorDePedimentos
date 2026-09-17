import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/v1/openapi.json/route";

describe("/api/v1/openapi.json", () => {
  it("serves a valid OpenAPI document without requiring auth", async () => {
    const res = GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.openapi).toEqual(expect.any(String));
    expect(json.paths).toEqual(expect.any(Object));
  });

  it("documents every v1 route registered via registry.registerPath", async () => {
    const res = GET();
    const json = await res.json();
    for (const path of [
      "/clientes",
      "/pedimentos",
      "/facturas",
      "/cartas-porte",
      "/vehiculos",
      "/choferes",
      "/direcciones",
      "/productos",
      "/catalogs/unidades",
      "/catalogs/claves-prod-serv",
      "/jobs/{job_id}",
    ]) {
      expect(json.paths).toHaveProperty(path);
    }
  });

  it("declares a bearer security scheme", async () => {
    const res = GET();
    const json = await res.json();
    expect(json.components.securitySchemes).toEqual(
      expect.objectContaining({ bearerAuth: expect.objectContaining({ type: "http", scheme: "bearer" }) })
    );
  });
});
