import { eq } from "drizzle-orm";
import { db } from "./db/client";
import { organizations } from "./db/schema";
import { encryptSecret } from "./crypto";
import { createFacturapiClient, FacturapiError } from "./facturapi";

export type ProvisionResult = { activated: true } | { activated: false; error: string; status: number };

// Lazily creates a FacturAPI organization for orgs that don't manage their
// own key. Idempotent even under partial failure: facturapiOrgId is
// persisted as soon as the org is created, before fetching its live key, so
// a retry after a mid-flight failure resumes against the same FacturAPI org
// instead of creating an orphaned duplicate.
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

  const masterKey = process.env.FACTURAPI_USER_KEY;
  if (!masterKey) {
    return {
      activated: false,
      error: "El aprovisionamiento automático no está disponible por el momento",
      status: 502,
    };
  }

  try {
    const masterClient = createFacturapiClient(masterKey);

    let facturapiOrgId = org?.facturapiOrgId ?? null;
    if (!facturapiOrgId) {
      const created = await masterClient.post<{ id: string }>("organizations", { name: orgName });
      facturapiOrgId = created.id;
      await db
        .insert(organizations)
        .values({ id: orgId, facturapiOrgId })
        .onConflictDoUpdate({ target: organizations.id, set: { facturapiOrgId } });
    }

    const liveKey = await masterClient.put<string>(`organizations/${facturapiOrgId}/apikeys/live`);
    const encrypted = encryptSecret(liveKey);
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
