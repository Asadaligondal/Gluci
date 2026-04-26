import { Router } from "express";
import Stripe from "stripe";
import { getConfig } from "../../config.js";
import { authAppBearer, type AuthedRequest } from "../../middleware/authApp.js";
import { prisma } from "../../db.js";

export const billingRouter = Router();
billingRouter.use(authAppBearer);

billingRouter.post("/checkout", async (req: AuthedRequest, res) => {
  const cfg = getConfig();
  if (!cfg.STRIPE_SECRET_KEY || !cfg.STRIPE_PRICE_ID) {
    return res.status(501).json({
      error: "Stripe not configured",
      hint: "Set STRIPE_SECRET_KEY and STRIPE_PRICE_ID in .env",
    });
  }
  const stripe = new Stripe(cfg.STRIPE_SECRET_KEY);
  const userId = req.userId!;
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: cfg.STRIPE_PRICE_ID, quantity: 1 }],
    success_url: `${cfg.PUBLIC_BASE_URL}/v1/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${cfg.PUBLIC_BASE_URL}/v1/billing/cancel`,
    client_reference_id: userId,
    metadata: { userId },
  });
  res.json({ url: session.url });
});

billingRouter.get("/success", async (req, res) => {
  res.type("html").send(`<html><body><h1>Thanks!</h1><p>You can close this tab and return to Gluci.</p></body></html>`);
});

billingRouter.get("/cancel", async (_req, res) => {
  res.type("html").send(`<html><body><p>Checkout cancelled.</p></body></html>`);
});

/** Stripe webhook — raw body handled in index */
export async function handleStripeWebhook(rawBody: Buffer, signature: string | undefined) {
  const cfg = getConfig();
  if (!cfg.STRIPE_SECRET_KEY || !cfg.STRIPE_WEBHOOK_SECRET) return { ok: false as const, error: "not configured" };
  const stripe = new Stripe(cfg.STRIPE_SECRET_KEY);
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature ?? "", cfg.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    return { ok: false as const, error: String(e) };
  }
  if (event.type === "checkout.session.completed") {
    const s = event.data.object as Stripe.Checkout.Session;
    const userId = s.metadata?.userId ?? s.client_reference_id;
    if (userId) {
      await prisma.user.update({
        where: { id: userId },
        data: { subscriptionStatus: "active" },
      });
    }
  }
  return { ok: true as const };
}
