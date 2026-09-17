import { describe, expect, it } from "vitest";
import { GET as GET_ES } from "@/app/api/v1/openapi.json/route";
import { GET as GET_EN } from "@/app/api/v1/openapi.en.json/route";

describe.each([
  { lang: "es (default)", GET: GET_ES },
  { lang: "en", GET: GET_EN },
])("/api/v1/openapi.json ($lang)", ({ GET }) => {
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

describe("/api/v1/openapi.json (es) translation", () => {
  it("does not throw for missing translations (i.e. every summary/description is covered)", async () => {
    // translateDocument() throws in dev/test when a generated string has no
    // dictionary entry, so a successful call already proves full coverage.
    expect(() => GET_ES()).not.toThrow();
  });

  it("translates a known summary and description into Spanish", async () => {
    const res = GET_ES();
    const json = await res.json();
    expect(json.paths["/clientes"].post.summary).toBe("Crea un cliente");
    expect(json.tags.find((t: { name: string }) => t.name === "pedimentos").description).toBe(
      "Sube y consulta pedimentos analizados."
    );
  });

  it("keeps the English document canonical and untranslated", async () => {
    const res = GET_EN();
    const json = await res.json();
    expect(json.paths["/clientes"].post.summary).toBe("Create a cliente");
    expect(json.tags.find((t: { name: string }) => t.name === "pedimentos").description).toBe(
      "Upload and retrieve parsed pedimentos."
    );
  });
});
