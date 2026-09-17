import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/v1/csd/route";
import { authHeaders, cleanupOrg, createApiKey, createTestOrg } from "../../helpers";

function csdRequest(form: FormData, headers: Record<string, string> = {}) {
  return new NextRequest(new URL("/api/v1/csd", "http://localhost:3000"), {
    method: "POST",
    headers,
    body: form,
  });
}

describe("/api/v1/csd", () => {
  let orgId: string;
  let token: string;

  beforeAll(async () => {
    // No `withFacturapi: false` needed — this org has a FacturAPI key but,
    // like every test org, no facturapiOrgId (that's only set by real
    // provisioning), which is exactly the failure path exercised below.
    orgId = await createTestOrg();
    token = await createApiKey(orgId);
  });

  afterAll(async () => {
    await cleanupOrg(orgId);
  });

  it("rejects requests with no Authorization header", async () => {
    const form = new FormData();
    form.set("cer", new File(["cer"], "test.cer"));
    form.set("key", new File(["key"], "test.key"));
    form.set("password", "secret");
    const res = await POST(csdRequest(form));
    expect(res.status).toBe(401);
  });

  it("rejects a request missing required fields", async () => {
    const form = new FormData();
    form.set("cer", new File(["cer"], "test.cer"));
    const res = await POST(csdRequest(form, authHeaders(token)));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("invalid_parameter");
  });

  it("surfaces the upstream error for an org with no provisioned FacturAPI organization", async () => {
    const form = new FormData();
    form.set("cer", new File(["cer"], "test.cer"));
    form.set("key", new File(["key"], "test.key"));
    form.set("password", "secret");
    const res = await POST(csdRequest(form, authHeaders(token)));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("facturapi_error");
  });
});
