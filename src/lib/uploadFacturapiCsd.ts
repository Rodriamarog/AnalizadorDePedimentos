import { eq } from "drizzle-orm";
import { db } from "./db/client";
import { organizations } from "./db/schema";
import { getOrgFacturapiClient } from "./orgFacturapi";
import { FacturapiError } from "./facturapi";

export type CsdUploadResult =
  | { csdUploadedAt: Date }
  | { csdUploadedAt: null; error: string; status: number };

// Proxies cer/key/password straight through to FacturAPI's certificate
// endpoint using the org's own key — nothing but the success timestamp is
// ever persisted here.
export async function uploadFacturapiCsd(
  orgId: string,
  cer: File,
  key: File,
  password: string
): Promise<CsdUploadResult> {
  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
  if (!org?.facturapiOrgId) {
    return {
      csdUploadedAt: null,
      error: "Esta organización no tiene una cuenta de FacturAPI aprovisionada",
      status: 400,
    };
  }

  const client = await getOrgFacturapiClient(orgId);
  if (client instanceof Response) {
    return {
      csdUploadedAt: null,
      error: "Esta organización no tiene configurada una llave de FacturAPI",
      status: 400,
    };
  }

  const form = new FormData();
  form.set("cer", cer, cer.name);
  form.set("key", key, key.name);
  form.set("password", password);

  try {
    await client.putForm(`organizations/${org.facturapiOrgId}/certificate`, form);
  } catch (e) {
    const message = e instanceof FacturapiError ? e.message : "No se pudo subir el CSD a FacturAPI";
    return { csdUploadedAt: null, error: message, status: 502 };
  }

  const [updated] = await db
    .update(organizations)
    .set({ csdUploadedAt: new Date() })
    .where(eq(organizations.id, orgId))
    .returning({ csdUploadedAt: organizations.csdUploadedAt });

  return { csdUploadedAt: updated.csdUploadedAt! };
}
