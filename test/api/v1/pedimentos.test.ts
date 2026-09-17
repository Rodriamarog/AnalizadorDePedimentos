import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/v1/pedimentos/route";
import { GET } from "@/app/api/v1/pedimentos/[id]/route";
import { pedimentos, partidas } from "@/lib/db/schema";
import { withOrg } from "@/lib/db/withOrg";
import { authHeaders, buildRequest, cleanupOrg, createApiKey, createTestOrg } from "../../helpers";

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

function multipartRequest(url: string, token: string, form: FormData) {
  return new NextRequest(new URL(url, "http://localhost:3000"), {
    method: "POST",
    headers: authHeaders(token),
    body: form,
  });
}

describe("/api/v1/pedimentos", () => {
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

  // POST kicks off async parsing via next/server's `after()`, which throws
  // when called outside a real request-handling context (as happens calling
  // the handler directly, our seam) — see next/server after() docs. That
  // means only the branches that return *before* the after() call are
  // testable at this seam; the parse-and-persist pipeline itself would need
  // either a real running server or mocking next/server's `after`, both out
  // of scope here.
  describe("POST", () => {
    it("rejects requests with no Authorization header", async () => {
      const form = new FormData();
      const res = await POST(multipartRequest("/api/v1/pedimentos", "", form));
      expect(res.status).toBe(401);
    });

    it("rejects a request with no file field", async () => {
      const form = new FormData();
      const res = await POST(multipartRequest("/api/v1/pedimentos", token, form));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe("invalid_parameter");
      expect(json.error.details[0].field).toBe("file");
    });

    it("rejects an unsupported file type", async () => {
      const form = new FormData();
      form.set("file", new File([Buffer.from("hello")], "notes.docx"));
      const res = await POST(multipartRequest("/api/v1/pedimentos", token, form));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.details[0].issue).toBe("unsupported_type");
    });

    it("rejects a file over the 20MB upload limit", async () => {
      const form = new FormData();
      const big = Buffer.alloc(20 * 1024 * 1024 + 1);
      form.set("file", new File([big], "huge.pdf"));
      const res = await POST(multipartRequest("/api/v1/pedimentos", token, form));
      expect(res.status).toBe(413);
      const json = await res.json();
      expect(json.error.code).toBe("file_too_large");
    });

    it("accepts an Archivo M style filename (non-.pdf, non-.txt numeric extension)", async () => {
      const form = new FormData();
      form.set("file", new File([Buffer.from("some archivo m content")], "archivoM-240101.205"));
      // This reaches the after() call and throws in this seam (see describe
      // block comment) — asserting the thrown error confirms validation
      // passed and execution got as far as scheduling the job, without
      // needing the real parse pipeline to run.
      await expect(POST(multipartRequest("/api/v1/pedimentos", token, form))).rejects.toThrow(
        /after.*outside a request scope/i
      );
    });
  });

  describe("GET /:id", () => {
    let pedimentoId: string;

    beforeAll(async () => {
      await withOrg(orgId, async (tx) => {
        const [row] = await tx
          .insert(pedimentos)
          .values({
            orgId,
            pedimentoNum: "24  3304  3000000",
            importador: "Acme Importer SA de CV",
            tipoCambio: 17.5,
            pdfFilename: "test-pedimento.pdf",
          })
          .returning();
        pedimentoId = row.id;
        await tx.insert(partidas).values({
          orgId,
          pedimentoId,
          sec: 1,
          fraccion: "8471.30.01",
          descripcion: "Laptop",
          cantidad: 10,
          valAduana: 1000,
          valComercial: 1000,
          precioUnitario: 100,
          tieneIncrementables: false,
          umc: "KG",
        });
      });
    });

    it("rejects requests with no Authorization header", async () => {
      const res = await GET(buildRequest(`/api/v1/pedimentos/${pedimentoId}`), params(pedimentoId));
      expect(res.status).toBe(401);
    });

    it("returns 404 for a nonexistent id", async () => {
      const res = await GET(
        buildRequest("/api/v1/pedimentos/00000000-0000-0000-0000-000000000000", { headers: authHeaders(token) }),
        params("00000000-0000-0000-0000-000000000000")
      );
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error.code).toBe("not_found");
    });

    it("returns 404 when the pedimento belongs to a different org", async () => {
      const res = await GET(
        buildRequest(`/api/v1/pedimentos/${pedimentoId}`, { headers: authHeaders(otherToken) }),
        params(pedimentoId)
      );
      expect(res.status).toBe(404);
    });

    it("returns the pedimento with its partidas for the owning org", async () => {
      const res = await GET(buildRequest(`/api/v1/pedimentos/${pedimentoId}`, { headers: authHeaders(token) }), params(pedimentoId));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.pedimento_id).toBe(pedimentoId);
      expect(json.pedimento_num).toBe("24  3304  3000000");
      expect(json.partidas).toHaveLength(1);
      expect(json.partidas[0]).toEqual(
        expect.objectContaining({ fraccion: "8471.30.01", clave_prod_serv: null, clave_prod_serv_mapped: false })
      );
    });

    it("returns an empty partidas array for a pedimento with none", async () => {
      const bareId = await withOrg(orgId, async (tx) => {
        const [row] = await tx
          .insert(pedimentos)
          .values({
            orgId,
            pedimentoNum: "24  3304  3000001",
            importador: "Bare Importer",
            tipoCambio: 17.5,
            pdfFilename: "bare.pdf",
          })
          .returning();
        return row.id;
      });

      const res = await GET(buildRequest(`/api/v1/pedimentos/${bareId}`, { headers: authHeaders(token) }), params(bareId));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.partidas).toEqual([]);
    });
  });
});
