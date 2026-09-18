import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { facturas, organizations } from "@/lib/db/schema";
import { withOrg } from "@/lib/db/withOrg";

// Self-service "continue my old numbering" (#78, #79) — scoped to the two
// CFDI types businesses actually track a prior folio sequence for.
export type StartingFolioType = "I" | "E";

/**
 * Whether the org has already issued a real (non-draft) invoice of this CFDI
 * type — the lock condition. Drafts are excluded: DELETE /api/facturas/[id]
 * only flips a draft's status to "canceled" rather than removing its row
 * (see saveFactura.ts), so a draft the user creates and discards before ever
 * visiting Configuración must not permanently lock this setting.
 */
export async function hasIssuedInvoiceOfType(orgId: string, type: StartingFolioType): Promise<boolean> {
  const rows = await withOrg(orgId, (tx) =>
    tx
      .select({ id: facturas.id })
      .from(facturas)
      .where(and(eq(facturas.orgId, orgId), eq(facturas.cfdiType, type), ne(facturas.status, "draft")))
      .limit(1)
  );
  return rows.length > 0;
}

export async function getStartingFolios(
  orgId: string
): Promise<{ I: number | null; E: number | null }> {
  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
  return { I: org?.startingFolioFactura ?? null, E: org?.startingFolioNotaCredito ?? null };
}

/**
 * Sets the org's starting folio for one CFDI type, provided it isn't locked
 * yet. Returns an error string on validation/lock failure, or null on
 * success — callers turn that into the appropriate HTTP response.
 */
export async function setStartingFolio(
  orgId: string,
  type: StartingFolioType,
  folioNumber: number | null
): Promise<{ error: string; status: number } | null> {
  if (folioNumber !== null && (!Number.isInteger(folioNumber) || folioNumber < 1)) {
    return { error: "folioNumber debe ser un entero mayor o igual a 1", status: 400 };
  }
  if (await hasIssuedInvoiceOfType(orgId, type)) {
    return {
      error:
        type === "I"
          ? "Ya se emitió una factura — el folio inicial ya no se puede modificar"
          : "Ya se emitió una nota de crédito — el folio inicial ya no se puede modificar",
      status: 409,
    };
  }

  const values =
    type === "I" ? { startingFolioFactura: folioNumber } : { startingFolioNotaCredito: folioNumber };
  await db
    .insert(organizations)
    .values({ id: orgId, ...values })
    .onConflictDoUpdate({ target: organizations.id, set: values });
  return null;
}

/**
 * Injects `folio_number` into an outgoing FacturAPI invoice-creation body
 * when the org has a starting folio configured for this type. No-op for any
 * type other than I/E, or when the caller already supplied their own
 * `folio_number`.
 *
 * FacturAPI's own autoincrement does NOT pick up from an explicitly-set
 * `folio_number` on a prior invoice — its internal counter runs independent
 * of whatever value a caller passed (confirmed empirically: setting 500 on
 * one invoice, then omitting folio_number on the next, produced FacturAPI's
 * own unrelated next number, not 501). So once a starting folio is
 * configured for a type, this app must keep explicitly supplying
 * `folio_number` on every future invoice of that type — not just the first
 * — computed from a counter this app owns (see reserveNextFolio).
 */
export async function applyStartingFolio(
  orgId: string,
  type: string,
  body: Record<string, unknown>
): Promise<void> {
  if (type !== "I" && type !== "E") return;
  if (body.folio_number !== undefined) return;

  const reserved = await reserveNextFolio(orgId, type);
  if (reserved != null) body.folio_number = reserved;
}

/**
 * Atomically reserves the org's next folio number for a type and advances
 * the stored counter, in a single `UPDATE ... RETURNING` — a no-op (returns
 * null) when the feature isn't configured for this type. Postgres takes a
 * row lock on the `organizations` row for the duration of the UPDATE, so two
 * concurrent invoice-creation requests for the same org+type serialize
 * against each other and can never reserve the same number.
 *
 * `column` is one of two hardcoded literals below, never caller input, so
 * splicing it into the SQL via sql.raw carries no injection risk.
 */
async function reserveNextFolio(orgId: string, type: StartingFolioType): Promise<number | null> {
  const column = type === "I" ? "starting_folio_factura" : "starting_folio_nota_credito";
  const result = await db.execute<{ reserved: number }>(sql`
    update organizations
    set ${sql.raw(column)} = ${sql.raw(column)} + 1
    where id = ${orgId} and ${sql.raw(column)} is not null
    returning ${sql.raw(column)} - 1 as reserved
  `);
  return result.rows[0]?.reserved ?? null;
}
