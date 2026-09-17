import { and, eq, inArray } from "drizzle-orm";
import { productos } from "@/lib/db/schema";
import type { OrgTx } from "@/lib/db/withOrg";

// Shared "org's productos rows for a set of fracciones" query — used
// wherever a pedimento's partidas need their clave_prod_serv mapping
// (GET /pedimentos/{id}'s enrichment, POST /cartas-porte's Mercancias/items
// build, and the auto_classify "already mapped" check), so the org+fracción
// scoping only needs to be gotten right once.
export async function productosByFraccion(tx: OrgTx, orgId: string, fracciones: string[]) {
  const unique = [...new Set(fracciones)];
  if (unique.length === 0) return [];
  return tx.select().from(productos).where(and(eq(productos.orgId, orgId), inArray(productos.fraccion, unique)));
}
