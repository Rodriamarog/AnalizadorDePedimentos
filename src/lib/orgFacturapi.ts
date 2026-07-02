import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "./db/client";
import { organizations } from "./db/schema";
import { decryptSecret } from "./crypto";
import { createFacturapiClient, type FacturapiClient } from "./facturapi";

// organizations has no RLS (see drizzle/0001_rls.sql — only the 5 tenant
// tables are listed), so a plain query scoped by orgId is fine here; no
// withOrg/transaction needed for a single non-RLS lookup.
export async function getOrgFacturapiClient(orgId: string): Promise<FacturapiClient | NextResponse> {
  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
  if (!org?.facturapiKeyEncrypted) {
    return NextResponse.json(
      { error: "Esta organización no tiene configurada una llave de FacturAPI" },
      { status: 400 }
    );
  }
  const apiKey = decryptSecret(org.facturapiKeyEncrypted);
  return createFacturapiClient(apiKey);
}
