import { createHmac, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { after } from "next/server";
import { webhookDeliveries, webhookSubscriptions } from "@/lib/db/schema";
import { withOrg } from "@/lib/db/withOrg";

export type WebhookEventType = "factura.stamped" | "factura.cancelled";

export interface WebhookPayload {
  id: string;
  type: WebhookEventType;
  created_at: string;
  data: Record<string, unknown>;
}

const TIMEOUT_MS = 10_000;
// 3 attempts total: immediately, then after ~5s, then after ~30s.
const RETRY_DELAYS_MS = [5_000, 30_000];

export function signWebhookBody(rawBody: string, secret: string): string {
  return "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function attemptDelivery(url: string, rawBody: string, signature: string): Promise<{ ok: boolean; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-pedimentos-signature": signature },
      body: rawBody,
      signal: controller.signal,
    });
    if (res.ok) return { ok: true };
    return { ok: false, error: `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
  }
}

// Delivers a single event to a single subscription: signs the body,
// retries with backoff on failure (RETRY_DELAYS_MS), and records the
// outcome on the subscription's webhookDeliveries row (#70's "inspectable
// ... ideally a status field", plus a log line either way). Fire-and-forget
// from the caller's perspective — meant to be scheduled via `after()` so it
// never delays the triggering request's response.
async function deliverToSubscription(
  orgId: string,
  subscription: { id: string; url: string; secret: string },
  payload: WebhookPayload
): Promise<void> {
  const rawBody = JSON.stringify(payload);
  const signature = signWebhookBody(rawBody, subscription.secret);

  const [delivery] = await withOrg(orgId, (tx) =>
    tx
      .insert(webhookDeliveries)
      .values({
        orgId,
        subscriptionId: subscription.id,
        eventType: payload.type,
        payload,
        status: "pending",
      })
      .returning()
  );

  let lastError: string | undefined;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) await sleep(RETRY_DELAYS_MS[attempt - 1]);

    const result = await attemptDelivery(subscription.url, rawBody, signature);
    if (result.ok) {
      await withOrg(orgId, (tx) =>
        tx
          .update(webhookDeliveries)
          .set({ status: "delivered", attempts: attempt + 1, deliveredAt: new Date() })
          .where(eq(webhookDeliveries.id, delivery.id))
      );
      console.log(`[webhooks] delivered ${payload.type} (${payload.id}) to ${subscription.url} on attempt ${attempt + 1}`);
      return;
    }
    lastError = result.error;
    console.error(`[webhooks] attempt ${attempt + 1} failed for ${payload.type} (${payload.id}) to ${subscription.url}: ${lastError}`);
  }

  await withOrg(orgId, (tx) =>
    tx
      .update(webhookDeliveries)
      .set({ status: "failed", attempts: RETRY_DELAYS_MS.length + 1, lastError })
      .where(eq(webhookDeliveries.id, delivery.id))
  );
}

// Fans an event out to every webhook the org has registered. Never throws —
// a delivery failure is recorded per-subscription, not surfaced to the
// caller (the stamp/cancel response has already gone out by the time this
// runs, scheduled via `after()`).
export async function deliverWebhookEvent(
  orgId: string,
  type: WebhookEventType,
  data: Record<string, unknown>
): Promise<void> {
  const subscriptions = await withOrg(orgId, (tx) =>
    tx.select().from(webhookSubscriptions).where(eq(webhookSubscriptions.orgId, orgId))
  );
  if (subscriptions.length === 0) return;

  const payload: WebhookPayload = { id: randomUUID(), type, created_at: new Date().toISOString(), data };

  // Independent deliveries, each with its own retry/backoff — one slow or
  // failing subscriber never delays or blocks delivery to another.
  await Promise.all(subscriptions.map((subscription) => deliverToSubscription(orgId, subscription, payload)));
}

// Schedules delivery via next/server's `after()` so it runs post-response,
// never delaying the stamp/cancel response it's called from. `after()`
// throws when called outside a real request-handling context (e.g.
// invoking a route handler directly, as this repo's tests do — see
// pedimentos/route.ts's identical note) — swallowed here rather than
// letting it break an otherwise-successful response; a real request is
// always inside request scope, so this only matters at that test seam.
export function scheduleWebhookEvent(orgId: string, type: WebhookEventType, data: Record<string, unknown>): void {
  try {
    after(() => deliverWebhookEvent(orgId, type, data));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (!/after.*outside a request scope/i.test(message)) {
      // Anything other than the documented test-seam case above is an
      // unexpected failure to even schedule delivery — surface it instead
      // of silently dropping the event.
      console.error(`[webhooks] failed to schedule ${type} for org ${orgId}: ${message}`);
    }
  }
}
