import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { organizations } from "@/lib/db/schema";
import { buildRequest, cleanupOrg, createTestOrg } from "../../helpers";

// The settings routes authenticate via the Clerk session (requireOrgId), not
// the v1 Bearer scheme — mock Clerk's auth() to inject whichever test org is
// "current" for a given call, the same seam Clerk itself replaces at runtime.
const mockAuth = vi.fn();
vi.mock("@clerk/nextjs/server", () => ({ auth: () => mockAuth() }));

const { GET, POST } = await import("@/app/api/settings/api-keys/route");
const { DELETE } = await import("@/app/api/settings/api-keys/[id]/route");

function withParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("/api/settings/api-keys", () => {
  let orgId: string;

  beforeAll(async () => {
    orgId = await createTestOrg({ withFacturapi: false });
  });

  afterAll(async () => {
    await cleanupOrg(orgId);
  });

  beforeEach(() => {
    mockAuth.mockResolvedValue({ orgId });
  });

  afterEach(() => {
    mockAuth.mockReset();
  });

  it("rejects requests with no active Clerk org", async () => {
    mockAuth.mockResolvedValue({ orgId: null });
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns an empty list for an org with no keys", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toEqual([]);
  });

  it("creates a test-mode key for a demo-plan org and reveals the raw key once", async () => {
    const res = await POST(buildRequest("/api/settings/api-keys", { method: "POST", body: { label: "CI" } }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.mode).toBe("test");
    expect(json.label).toBe("CI");
    expect(json.key).toMatch(/^pdm_test_[0-9a-f]{48}$/);
  });

  it("creates a live-mode key for a live-plan org", async () => {
    await db.update(organizations).set({ plan: "live" }).where(eq(organizations.id, orgId));
    const res = await POST(buildRequest("/api/settings/api-keys", { method: "POST", body: {} }));
    const json = await res.json();
    expect(json.mode).toBe("live");
    expect(json.key).toMatch(/^pdm_live_/);
    await db.update(organizations).set({ plan: "demo" }).where(eq(organizations.id, orgId));
  });

  it("never returns the raw key again on a subsequent list", async () => {
    await POST(buildRequest("/api/settings/api-keys", { method: "POST", body: { label: "listed-key" } }));
    const res = await GET();
    const json = await res.json();
    const created = json.data.find((k: { label: string | null }) => k.label === "listed-key");
    expect(created).toBeDefined();
    expect(created.key).toBeUndefined();
    expect(created.keyHash).toBeUndefined();
  });

  it("lets a caller revoke their own key, after which it no longer appears", async () => {
    const created = await POST(buildRequest("/api/settings/api-keys", { method: "POST", body: { label: "to-revoke" } }));
    const { id } = await created.json();

    const del = await DELETE(new Request("http://localhost/x"), withParams(id));
    expect(del.status).toBe(204);

    const list = await GET();
    const json = await list.json();
    expect(json.data.find((k: { id: string }) => k.id === id)).toBeUndefined();
  });

  it("404s revoking an unknown key id", async () => {
    const res = await DELETE(new Request("http://localhost/x"), withParams("00000000-0000-0000-0000-000000000000"));
    expect(res.status).toBe(404);
  });

  it("404s revoking a key that belongs to a different org", async () => {
    const otherOrgId = await createTestOrg({ withFacturapi: false });
    mockAuth.mockResolvedValue({ orgId: otherOrgId });
    const created = await POST(buildRequest("/api/settings/api-keys", { method: "POST", body: {} }));
    const { id } = await created.json();

    mockAuth.mockResolvedValue({ orgId });
    const res = await DELETE(new Request("http://localhost/x"), withParams(id));
    expect(res.status).toBe(404);

    await cleanupOrg(otherOrgId);
  });
});
