import { sql } from "drizzle-orm";
import { db } from "./client";
import { organizations } from "./schema";

export type OrgTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Every tenant-scoped query must go through this helper. It opens a
 * transaction, upserts the Clerk org into our local `organizations` table
 * (Clerk org creation doesn't otherwise sync here), then sets `app.org_id`
 * for the duration of the transaction via `set_config(..., true)`, which RLS
 * policies read through `current_setting('app.org_id', true)`. Never query
 * tenant tables outside of this wrapper — RLS fails closed (returns no rows)
 * if `app.org_id` isn't set, so a forgotten wrapper looks like "empty data",
 * not a leak, but it's still a bug worth catching in tests.
 */
export async function withOrg<T>(
  orgId: string,
  fn: (tx: OrgTx) => Promise<T>
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.insert(organizations).values({ id: orgId }).onConflictDoNothing();
    await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
    return fn(tx);
  });
}
