import { NextRequest, NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth";
import { getStripeClient } from "@/lib/stripe";

// Starts a Stripe Checkout session to upgrade the current org from its demo
// (test FacturAPI key) plan to a live one. On completion, the webhook at
// /api/webhooks/stripe swaps in a real FacturAPI key.
export async function POST(req: NextRequest) {
  const orgId = await requireOrgId();
  if (orgId instanceof NextResponse) return orgId;

  const priceId = process.env.STRIPE_LIVE_PLAN_PRICE_ID;
  if (!priceId) {
    return NextResponse.json({ error: "La actualización a cuenta en vivo no está disponible por el momento" }, { status: 502 });
  }

  // Not req.nextUrl.origin: behind the mini-pc's reverse proxy that resolves
  // to the container's own bind address (0.0.0.0:3000), not the public
  // domain, sending users to a broken URL on cancel/back.
  const origin = process.env.APP_URL ?? req.nextUrl.origin;
  try {
    const session = await getStripeClient().checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      // Lets the customer type a promo code in on the Checkout page instead
      // of a discount being applied automatically.
      allow_promotion_codes: true,
      client_reference_id: orgId,
      metadata: { orgId },
      subscription_data: { metadata: { orgId } },
      success_url: `${origin}/configuracion?upgraded=1`,
      cancel_url: `${origin}/configuracion`,
    });
    if (!session.url) {
      return NextResponse.json({ error: "No se pudo iniciar el pago" }, { status: 502 });
    }
    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.error("Stripe checkout session creation failed:", e);
    return NextResponse.json({ error: "No se pudo iniciar el pago" }, { status: 502 });
  }
}
