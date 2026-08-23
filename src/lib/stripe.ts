import Stripe from "stripe";

let client: Stripe | null = null;

// Lazy singleton so routes that don't touch billing never require
// STRIPE_SECRET_KEY to be set.
export function getStripeClient(): Stripe {
  if (!client) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY no está configurada");
    client = new Stripe(key, { apiVersion: "2026-07-29.dahlia" });
  }
  return client;
}
