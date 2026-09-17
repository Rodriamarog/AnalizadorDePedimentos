import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApiKeyAuth } from "@/lib/v1/auth";
import { apiError } from "@/lib/v1/envelope";
import { bearerAuth, ErrorSchema, registry, unauthorizedResponse } from "@/lib/v1/openapi";
import { fromPublicId } from "@/lib/v1/publicId";
import { webhookDeliveries, webhookSubscriptions } from "@/lib/db/schema";
import { withOrg } from "@/lib/db/withOrg";

registry.registerPath({
  method: "delete",
  path: "/webhooks/{id}",
  summary: "Remove a webhook subscription",
  tags: ["facturas"],
  security: [{ [bearerAuth.name]: [] }],
  request: { params: z.object({ id: z.string() }) },
  responses: {
    204: { description: "The webhook subscription was removed." },
    ...unauthorizedResponse,
    404: {
      description: "No webhook subscription with that id for this org.",
      content: { "application/json": { schema: ErrorSchema } },
    },
  },
});

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiKeyAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id: publicId } = await params;
  const id = fromPublicId("wh", publicId);
  if (!id) return apiError(404, "not_found", "No webhook subscription with that id");

  const deleted = await withOrg(auth.orgId, async (tx) => {
    const [existing] = await tx.select().from(webhookSubscriptions).where(eq(webhookSubscriptions.id, id)).limit(1);
    if (!existing) return false;
    // No ON DELETE CASCADE on webhook_deliveries.subscription_id — clear its
    // delivery log first, in the same transaction, before the FK'd parent row.
    await tx.delete(webhookDeliveries).where(eq(webhookDeliveries.subscriptionId, existing.id));
    await tx.delete(webhookSubscriptions).where(eq(webhookSubscriptions.id, existing.id));
    return true;
  });

  if (!deleted) return apiError(404, "not_found", "No webhook subscription with that id");
  return new NextResponse(null, { status: 204 });
}
