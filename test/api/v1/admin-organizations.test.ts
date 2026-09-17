import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { POST } from "@/app/api/v1/admin/organizations/route";
import { authHeaders, buildRequest, cleanupOrg, createApiKey, createTestOrg } from "../../helpers";

// The happy path (a real POST that calls provisionFacturapiOrg()) isn't
// covered here on purpose — it creates a real, permanent FacturAPI
// sub-organization via the master key, with no delete-org API to clean it
// up afterward. No other test in this suite exercises
// provisionFacturapiOrg() directly for the same reason. These tests cover
// everything that happens before that call: auth and the duplicate-org
// guard.
describe("/api/v1/admin/organizations", () => {
  it("rejects requests with no Authorization header", async () => {
    const res = await POST(
      buildRequest("/api/v1/admin/organizations", { method: "POST", body: { org_name: "Test Co" } })
    );
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error.code).toBe("unauthorized");
  });

  it("rejects a tenant API key (not the platform admin key)", async () => {
    const orgId = await createTestOrg();
    const token = await createApiKey(orgId);
    try {
      const res = await POST(
        buildRequest("/api/v1/admin/organizations", {
          method: "POST",
          headers: authHeaders(token),
          body: { org_name: "Test Co" },
        })
      );
      expect(res.status).toBe(401);
    } finally {
      await cleanupOrg(orgId);
    }
  });

  it("rejects a missing org_name with the platform admin key", async () => {
    const res = await POST(
      buildRequest("/api/v1/admin/organizations", {
        method: "POST",
        headers: authHeaders(process.env.PLATFORM_ADMIN_KEY!),
        body: {},
      })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("invalid_parameter");
  });

  describe("duplicate org_id", () => {
    let orgId: string;

    afterAll(async () => {
      await cleanupOrg(orgId);
    });

    it("rejects an org_id that already exists, without calling FacturAPI", async () => {
      orgId = await createTestOrg();
      const res = await POST(
        buildRequest("/api/v1/admin/organizations", {
          method: "POST",
          headers: authHeaders(process.env.PLATFORM_ADMIN_KEY!),
          body: { org_name: "Test Co", org_id: orgId },
        })
      );
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error.code).toBe("duplicate_org");
    });
  });

  it("rejects an unconfigured deployment gracefully when the admin key env var is unset", async () => {
    const original = process.env.PLATFORM_ADMIN_KEY;
    delete process.env.PLATFORM_ADMIN_KEY;
    try {
      const res = await POST(
        buildRequest("/api/v1/admin/organizations", {
          method: "POST",
          headers: authHeaders(randomUUID()),
          body: { org_name: "Test Co" },
        })
      );
      expect(res.status).toBe(503);
      const json = await res.json();
      expect(json.error.code).toBe("not_configured");
    } finally {
      process.env.PLATFORM_ADMIN_KEY = original;
    }
  });
});
