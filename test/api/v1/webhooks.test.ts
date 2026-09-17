import { createServer, type Server } from "node:http";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET, POST } from "@/app/api/v1/webhooks/route";
import { DELETE } from "@/app/api/v1/webhooks/[id]/route";
import { deliverWebhookEvent, signWebhookBody } from "@/lib/v1/webhookDelivery";
import { webhookDeliveries } from "@/lib/db/schema";
import { withOrg } from "@/lib/db/withOrg";
import { authHeaders, buildRequest, cleanupOrg, createApiKey, createTestOrg } from "../../helpers";

function idParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("/api/v1/webhooks", () => {
  let orgId: string;
  let token: string;

  beforeAll(async () => {
    orgId = await createTestOrg();
    token = await createApiKey(orgId);
  });

  afterAll(async () => {
    await cleanupOrg(orgId);
  });

  describe("POST", () => {
    it("rejects requests with no Authorization header", async () => {
      const res = await POST(
        buildRequest("/api/v1/webhooks", { method: "POST", body: { url: "https://example.com/hook" } })
      );
      expect(res.status).toBe(401);
    });

    it("rejects a missing/invalid url", async () => {
      const res = await POST(
        buildRequest("/api/v1/webhooks", { method: "POST", headers: authHeaders(token), body: { url: "not-a-url" } })
      );
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe("invalid_parameter");
    });

    it("creates a webhook subscription, returning the secret only this once", async () => {
      const res = await POST(
        buildRequest("/api/v1/webhooks", {
          method: "POST",
          headers: authHeaders(token),
          body: { url: "https://example.com/hook" },
        })
      );
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          url: "https://example.com/hook",
          secret: expect.stringMatching(/^whsec_/),
          created_at: expect.any(String),
        })
      );
    });
  });

  describe("GET / DELETE", () => {
    it("lists a created subscription without its secret", async () => {
      const created = await POST(
        buildRequest("/api/v1/webhooks", {
          method: "POST",
          headers: authHeaders(token),
          body: { url: "https://example.com/list-hook" },
        })
      );
      const createdJson = await created.json();

      const res = await GET(buildRequest("/api/v1/webhooks", { headers: authHeaders(token) }));
      expect(res.status).toBe(200);
      const json = await res.json();
      const found = json.data.find((w: { id: string }) => w.id === createdJson.id);
      expect(found).toEqual({ id: createdJson.id, url: "https://example.com/list-hook", created_at: expect.any(String) });
      expect(found.secret).toBeUndefined();
    });

    it("removes a subscription, after which it's no longer listed", async () => {
      const created = await POST(
        buildRequest("/api/v1/webhooks", {
          method: "POST",
          headers: authHeaders(token),
          body: { url: "https://example.com/delete-hook" },
        })
      );
      const { id } = await created.json();

      const del = await DELETE(buildRequest(`/api/v1/webhooks/${id}`, { method: "DELETE", headers: authHeaders(token) }), idParams(id));
      expect(del.status).toBe(204);

      const res = await GET(buildRequest("/api/v1/webhooks", { headers: authHeaders(token) }));
      const json = await res.json();
      expect(json.data.some((w: { id: string }) => w.id === id)).toBe(false);
    });

    it("returns 404 deleting an id that doesn't exist", async () => {
      const res = await DELETE(
        buildRequest("/api/v1/webhooks/wh_00000000-0000-0000-0000-000000000000", {
          method: "DELETE",
          headers: authHeaders(token),
        }),
        idParams("wh_00000000-0000-0000-0000-000000000000")
      );
      expect(res.status).toBe(404);
    });
  });

  describe("deliverWebhookEvent (#70)", () => {
    // A dedicated org+subscription for this test only — deliverWebhookEvent
    // fans out to every subscription an org has, so reusing the shared
    // `orgId` above (which accumulates unrelated https://example.com/...
    // subscriptions from the other tests in this file) would make real
    // outbound HTTP calls to those and retry them for ~35s each.
    let deliveryOrgId: string;

    afterAll(async () => {
      await cleanupOrg(deliveryOrgId);
    });

    it("signs the delivered payload correctly and records it as delivered", async () => {
      deliveryOrgId = await createTestOrg();
      const deliveryToken = await createApiKey(deliveryOrgId);

      const received: { body: string; signature: string | null }[] = [];
      const server: Server = createServer((req, res) => {
        const chunks: Buffer[] = [];
        req.on("data", (c) => chunks.push(c));
        req.on("end", () => {
          received.push({ body: Buffer.concat(chunks).toString("utf8"), signature: req.headers["x-pedimentos-signature"] as string | null });
          res.writeHead(200).end("ok");
        });
      });
      await new Promise<void>((resolve) => server.listen(0, resolve));
      const address = server.address();
      if (typeof address !== "object" || address === null) throw new Error("failed to bind test server");
      const url = `http://127.0.0.1:${address.port}/hook`;

      const created = await POST(
        buildRequest("/api/v1/webhooks", { method: "POST", headers: authHeaders(deliveryToken), body: { url } })
      );
      const { id: webhookId, secret } = await created.json();

      try {
        await deliverWebhookEvent(deliveryOrgId, "factura.stamped", { id: "inv_test123", status: "valid" });

        expect(received).toHaveLength(1);
        const payload = JSON.parse(received[0].body);
        expect(payload).toEqual(
          expect.objectContaining({ type: "factura.stamped", data: { id: "inv_test123", status: "valid" } })
        );
        expect(received[0].signature).toBe(signWebhookBody(received[0].body, secret));

        const subscriptionId = webhookId.replace(/^wh_/, "");
        const deliveries = await withOrg(deliveryOrgId, (tx) =>
          tx.select().from(webhookDeliveries).where(eq(webhookDeliveries.subscriptionId, subscriptionId))
        );
        expect(deliveries).toHaveLength(1);
        expect(deliveries[0]).toEqual(
          expect.objectContaining({ status: "delivered", attempts: 1, eventType: "factura.stamped" })
        );
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });
  });
});
