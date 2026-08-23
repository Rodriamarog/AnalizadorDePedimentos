import { eq } from "drizzle-orm";
import { db } from "./db/client";
import { organizations } from "./db/schema";
import { encryptSecret } from "./crypto";
import { createFacturapiClient, FacturapiError } from "./facturapi";

export type ProvisionResult = { activated: true } | { activated: false; error: string; status: number };

function masterFacturapiClient(): { client: ReturnType<typeof createFacturapiClient> } | { error: ProvisionResult } {
  const masterKey = process.env.FACTURAPI_USER_KEY;
  if (!masterKey) {
    return {
      error: {
        activated: false,
        error: "El aprovisionamiento automático no está disponible por el momento",
        status: 502,
      },
    };
  }
  return { client: createFacturapiClient(masterKey) };
}

// Lazily creates a FacturAPI organization for orgs that don't manage their
// own key. New orgs start on `plan: "demo"` and get a *test* API key here
// (no real SAT timbrado is possible with it) — see upgradeToLiveFacturapiOrg
// for the Stripe-gated path that swaps in a live key.
//
// Idempotent even under partial failure: facturapiOrgId is persisted as soon
// as the org is created, before fetching its key, so a retry after a
// mid-flight failure resumes against the same FacturAPI org instead of
// creating an orphaned duplicate.
export async function provisionFacturapiOrg(orgId: string, orgName: string): Promise<ProvisionResult> {
  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);

  if (org?.manualFacturapiKey) {
    return {
      activated: false,
      error: "Esta organización administra su propia llave de FacturAPI",
      status: 400,
    };
  }
  if (org?.facturapiOrgId && org?.facturapiKeyEncrypted) {
    return { activated: true };
  }

  const master = masterFacturapiClient();
  if ("error" in master) return master.error;

  // A brand-new org has no row yet, which is the demo default — only an
  // already-upgraded org (plan: "live") should get a live key here.
  const keyMode = org?.plan === "live" ? "live" : "test";

  try {
    let facturapiOrgId = org?.facturapiOrgId ?? null;
    if (!facturapiOrgId) {
      const created = await master.client.post<{ id: string }>("organizations", { name: orgName });
      facturapiOrgId = created.id;
      await db
        .insert(organizations)
        .values({ id: orgId, facturapiOrgId })
        .onConflictDoUpdate({ target: organizations.id, set: { facturapiOrgId } });
    }

    const key = await master.client.put<string>(`organizations/${facturapiOrgId}/apikeys/${keyMode}`);
    const encrypted = encryptSecret(key);
    await db
      .update(organizations)
      .set({ facturapiKeyEncrypted: encrypted })
      .where(eq(organizations.id, orgId));

    return { activated: true };
  } catch (e) {
    const message = e instanceof FacturapiError ? e.message : "No se pudo crear la organización en FacturAPI";
    return { activated: false, error: message, status: 502 };
  }
}

// Swaps a demo org's test key for a real live key once it upgrades (called
// from the Stripe webhook after checkout completes). Requires the org to
// already have a FacturAPI org id (i.e. already demo-provisioned).
export async function upgradeToLiveFacturapiOrg(orgId: string): Promise<ProvisionResult> {
  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);

  if (org?.manualFacturapiKey) {
    return {
      activated: false,
      error: "Esta organización administra su propia llave de FacturAPI",
      status: 400,
    };
  }
  if (!org?.facturapiOrgId) {
    return {
      activated: false,
      error: "La organización aún no tiene una cuenta de FacturAPI que actualizar",
      status: 400,
    };
  }

  const master = masterFacturapiClient();
  if ("error" in master) return master.error;

  try {
    const liveKey = await master.client.put<string>(`organizations/${org.facturapiOrgId}/apikeys/live`);
    const encrypted = encryptSecret(liveKey);
    await db
      .update(organizations)
      .set({ facturapiKeyEncrypted: encrypted, plan: "live" })
      .where(eq(organizations.id, orgId));

    return { activated: true };
  } catch (e) {
    const message = e instanceof FacturapiError ? e.message : "No se pudo activar la cuenta en vivo en FacturAPI";
    return { activated: false, error: message, status: 502 };
  }
}

// Reverts a live org back to a test key when its Stripe subscription is
// canceled (called from the Stripe webhook on customer.subscription.deleted).
// A no-op for orgs that manage their own key or were never live to begin
// with — cancellation webhooks can arrive more than once.
export async function downgradeToDemoFacturapiOrg(orgId: string): Promise<ProvisionResult> {
  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);

  if (org?.manualFacturapiKey || org?.plan !== "live") {
    return { activated: true };
  }
  if (!org.facturapiOrgId) {
    return { activated: true };
  }

  const master = masterFacturapiClient();
  if ("error" in master) return master.error;

  try {
    const testKey = await master.client.put<string>(`organizations/${org.facturapiOrgId}/apikeys/test`);
    const encrypted = encryptSecret(testKey);
    await db
      .update(organizations)
      .set({ facturapiKeyEncrypted: encrypted, plan: "demo" })
      .where(eq(organizations.id, orgId));

    return { activated: true };
  } catch (e) {
    const message = e instanceof FacturapiError ? e.message : "No se pudo revertir la cuenta a modo demo en FacturAPI";
    return { activated: false, error: message, status: 502 };
  }
}
