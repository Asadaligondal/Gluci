import { Router } from "express";
import Stripe from "stripe";
import { getConfig } from "../../config.js";
import { authAppBearer, type AuthedRequest } from "../../middleware/authApp.js";
import { prisma } from "../../db.js";
import { logAnalytics } from "../../services/analytics.js";

export const billingRouter = Router();
billingRouter.use(authAppBearer);

function stripeOrNull() {
  const cfg = getConfig();
  if (!cfg.STRIPE_SECRET_KEY) return null;
  return new Stripe(cfg.STRIPE_SECRET_KEY);
}

async function ensureStripeCustomer(stripe: Stripe, userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.stripeCustomerId) return user.stripeCustomerId;
  const customer = await stripe.customers.create({
    email: user.email ?? undefined,
    metadata: { userId },
  });
  await prisma.user.update({
    where: { id: userId },
    data: { stripeCustomerId: customer.id },
  });
  return customer.id;
}

billingRouter.get("/status", async (req: AuthedRequest, res) => {
  const cfg = getConfig();
  const u = await prisma.user.findUniqueOrThrow({ where: { id: req.userId! } });
  res.json({
    subscriptionStatus: u.subscriptionStatus,
    freeChecksUsed: u.freeChecksUsed,
    freeLimit: cfg.FREE_DECISIONS_LIMIT,
    cancelAtPeriodEnd: u.subscriptionCancelAtPeriodEnd,
    currentPeriodEnd: u.subscriptionCurrentPeriodEnd,
    stripeConfigured: Boolean(cfg.STRIPE_SECRET_KEY && cfg.STRIPE_PRICE_ID),
  });
});

billingRouter.post("/checkout", async (req: AuthedRequest, res) => {
  const cfg = getConfig();
  if (!cfg.STRIPE_SECRET_KEY || !cfg.STRIPE_PRICE_ID) {
    return res.status(501).json({
      error: "Stripe not configured",
      hint: "Set STRIPE_SECRET_KEY and STRIPE_PRICE_ID in .env",
    });
  }
  const stripe = stripeOrNull()!;
  const userId = req.userId!;
  const customerId = await ensureStripeCustomer(stripe, userId);
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: cfg.STRIPE_PRICE_ID, quantity: 1 }],
    customer: customerId,
    success_url: `${cfg.PUBLIC_BASE_URL}/v1/billing/success?session_id={CHECKOUT_SESSION_ID}&channel=app`,
    cancel_url: `${cfg.PUBLIC_BASE_URL}/v1/billing/cancel`,
    client_reference_id: userId,
    metadata: { userId },
    allow_promotion_codes: true,
  });
  res.json({ url: session.url, sessionId: session.id });
});

billingRouter.post("/portal", async (req: AuthedRequest, res) => {
  const cfg = getConfig();
  const stripe = stripeOrNull();
  if (!stripe) return res.status(501).json({ error: "Stripe not configured" });
  const userId = req.userId!;
  const customerId = await ensureStripeCustomer(stripe, userId);
  const portal = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${cfg.PUBLIC_BASE_URL}/v1/billing/return`,
  });
  res.json({ url: portal.url });
});

billingRouter.get("/success", async (req, res) => {
  const cfg = getConfig();
  const channel = req.query.channel as string | undefined;
  const botUsername = cfg.TELEGRAM_BOT_USERNAME;
  const waPhone = cfg.WHATSAPP_PHONE_NUMBER_ID;

  let redirectUrl: string | null = null;
  if (channel === "telegram" && botUsername) redirectUrl = `https://t.me/${botUsername}`;
  else if (channel === "whatsapp" && waPhone) redirectUrl = `https://wa.me/${waPhone}`;
  else if (channel === "app") redirectUrl = "gluci://billing/success";

  const autoRedirect = redirectUrl
    ? `<script>setTimeout(function(){ var a=document.getElementById('rtn'); if(a) a.click(); }, 1500);</script>`
    : "";

  const returnBtn = redirectUrl
    ? `<a id="rtn" href="${redirectUrl}" style="display:inline-block;margin-top:24px;padding:14px 28px;background:#5C6BC0;color:white;border-radius:10px;text-decoration:none;font-size:16px;font-weight:600">Return to Gluci →</a>`
    : `<p style="margin-top:24px;color:#666">You can close this tab and return to Gluci.</p>`;

  res.type("html").send(
    `<html><head>${autoRedirect}</head><body style="font-family:system-ui;text-align:center;padding:48px;max-width:480px;margin:0 auto">` +
      `<div style="font-size:48px">🎉</div>` +
      `<h1 style="color:#1A1A1A">You're subscribed!</h1>` +
      `<p style="color:#555;font-size:16px">Your Gluci subscription is now active. Unlimited food checks, zero limits.</p>` +
      returnBtn +
      `</body></html>`,
  );
});

billingRouter.get("/cancel", async (_req, res) => {
  res
    .type("html")
    .send(
      `<html><body style="font-family:system-ui;text-align:center;padding:48px">` +
        `<p>Checkout cancelled. Return to Gluci to try again.</p>` +
        `</body></html>`,
    );
});

billingRouter.get("/return", async (_req, res) => {
  res
    .type("html")
    .send(
      `<html><body style="font-family:system-ui;text-align:center;padding:48px">` +
        `<p>You can close this tab and return to Gluci.</p>` +
        `</body></html>`,
    );
});

async function applySubscriptionToUser(sub: Stripe.Subscription) {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const user = await prisma.user.findUnique({ where: { stripeCustomerId: customerId } });
  if (!user) return;
  const priceId = sub.items.data[0]?.price.id ?? null;
  const periodEndUnix = (sub as unknown as { current_period_end?: number }).current_period_end;
  const periodEnd = typeof periodEndUnix === "number" ? new Date(periodEndUnix * 1000) : null;
  const status =
    sub.status === "active" || sub.status === "trialing"
      ? "active"
      : sub.status === "past_due" || sub.status === "unpaid"
        ? "past_due"
        : sub.status === "canceled" || sub.status === "incomplete_expired"
          ? "canceled"
          : sub.status;
  await prisma.user.update({
    where: { id: user.id },
    data: {
      stripeSubscriptionId: sub.id,
      subscriptionStatus: status,
      subscriptionPriceId: priceId,
      subscriptionCurrentPeriodEnd: periodEnd,
      subscriptionCancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
    },
  });
}

/** Stripe webhook — raw body handled in index */
export async function handleStripeWebhook(rawBody: Buffer, signature: string | undefined) {
  const cfg = getConfig();
  if (!cfg.STRIPE_SECRET_KEY || !cfg.STRIPE_WEBHOOK_SECRET) {
    return { ok: false as const, error: "Stripe not configured" };
  }
  const stripe = new Stripe(cfg.STRIPE_SECRET_KEY);
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature ?? "", cfg.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    return { ok: false as const, error: String(e) };
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        const userId = s.metadata?.userId ?? (typeof s.client_reference_id === "string" ? s.client_reference_id : null);
        const customerId = typeof s.customer === "string" ? s.customer : s.customer?.id;
        if (userId && customerId) {
          await prisma.user.update({
            where: { id: userId },
            data: { stripeCustomerId: customerId, subscriptionStatus: "active" },
          });
          void logAnalytics({
            userId,
            name: "stripe_checkout_completed",
            properties: { sessionId: s.id },
            source: "server",
          });
        }
        if (s.subscription) {
          const subId = typeof s.subscription === "string" ? s.subscription : s.subscription.id;
          const sub = await stripe.subscriptions.retrieve(subId);
          await applySubscriptionToUser(sub);
        }
        // Notify Telegram user that their subscription is now active
        const telegramChatId = s.metadata?.telegramChatId;
        if (telegramChatId) {
          try {
            const { sendTelegramMessage } = await import("../../channels/telegram.js");
            await sendTelegramMessage(
              telegramChatId,
              "🎉 You're now subscribed to Gluci!\n\nUnlimited food checks are active. Send me any food photo or question to get started.",
            );
          } catch (e) {
            console.warn("[billing] Telegram subscription confirmation failed:", e);
          }
        }
        // Notify WhatsApp user that their subscription is now active
        const whatsappWaId = s.metadata?.whatsappWaId;
        if (whatsappWaId) {
          try {
            const { sendWhatsAppMessage } = await import("../../channels/whatsapp.js");
            await sendWhatsAppMessage(
              whatsappWaId,
              "🎉 You're now subscribed to Gluci!\n\nUnlimited food checks are active. Send me any food photo or question to get started.",
            );
          } catch (e) {
            console.warn("[billing] WhatsApp subscription confirmation failed:", e);
          }
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await applySubscriptionToUser(sub);
        const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        const u = await prisma.user.findFirst({ where: { stripeCustomerId: customerId }, select: { id: true } });
        if (u) {
          void logAnalytics({
            userId: u.id,
            name: "subscription_change",
            properties: { status: sub.status, type: event.type },
            source: "server",
          });
        }
        break;
      }
      case "invoice.payment_failed": {
        const inv = event.data.object as Stripe.Invoice;
        const customerId = typeof inv.customer === "string" ? inv.customer : inv.customer?.id;
        if (customerId) {
          await prisma.user.updateMany({
            where: { stripeCustomerId: customerId },
            data: { subscriptionStatus: "past_due" },
          });
        }
        break;
      }
      default:
        break;
    }
  } catch (e) {
    console.error("stripe webhook handler", event.type, e);
    return { ok: false as const, error: String(e) };
  }

  return { ok: true as const };
}
