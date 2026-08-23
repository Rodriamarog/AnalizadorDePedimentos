import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripeClient } from "@/lib/stripe";
import { upgradeToLiveFacturapiOrg, downgradeToDemoFacturapiOrg } from "@/lib/provisionFacturapiOrg";

// Stripe webhook: on successful checkout for the "upgrade to live" plan,
// swap the org's FacturAPI test key for a real live one (fulfillment lives
// here, not the success page, per Stripe's guidance, and covers both the
// synchronous and async-payment-method completion events). On subscription
// cancellation, revert it back to a test key so canceled orgs don't keep
// live invoicing for free.
export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Webhook no configurado" }, { status: 502 });
  }

  const signature = req.headers.get("stripe-signature");
  const payload = await req.text();
  if (!signature) {
    return NextResponse.json({ error: "Falta la firma" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = getStripeClient().webhooks.constructEvent(payload, signature, secret);
  } catch {
    return NextResponse.json({ error: "Firma inválida" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.payment_status === "paid" || session.payment_status === "no_payment_required") {
      const orgId = session.client_reference_id ?? (session.metadata?.orgId as string | undefined);
      if (orgId) {
        await upgradeToLiveFacturapiOrg(orgId);
      }
    }
  }

  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object as Stripe.Subscription;
    const orgId = subscription.metadata?.orgId as string | undefined;
    if (orgId) {
      await downgradeToDemoFacturapiOrg(orgId);
    }
  }

  return NextResponse.json({ received: true });
}
