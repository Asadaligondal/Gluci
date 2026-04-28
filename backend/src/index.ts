import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { getConfig } from "./config.js";
import { prisma } from "./db.js";
import { logAnalytics } from "./services/analytics.js";
import { authRouter } from "./routes/v1/auth.js";
import { chatRouter } from "./routes/v1/chat.js";
import { profileRouter } from "./routes/v1/profile.js";
import { historyRouter } from "./routes/v1/history.js";
import { billingRouter, handleStripeWebhook } from "./routes/v1/billing.js";
import { summaryRouter } from "./routes/v1/summary.js";
import { internalRouter } from "./routes/internal.js";
import { conversationsRouter } from "./routes/v1/conversations.js";
import { channelsRouter } from "./routes/v1/channels.js";
import { analyticsRouter } from "./routes/v1/analytics.js";
import { migrateOrphanedMessages } from "./services/conversationService.js";
import { handleTelegramUpdate } from "./channels/telegram.js";
import { verifyWhatsApp, handleWhatsAppPayload } from "./channels/whatsapp.js";

const app = express();
const cfg = getConfig();

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);

app.post(
  "/webhooks/stripe",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"] as string | undefined;
    const result = await handleStripeWebhook(req.body as Buffer, sig);
    if (!result.ok) return res.status(400).send(result.error);
    res.json({ received: true });
  },
);

app.use(express.json({ limit: "12mb" }));

app.get("/health", (_req, res) => res.json({ ok: true }));

const cardsDir = path.join(process.cwd(), "data", "cards");
const uploadsDir = path.join(process.cwd(), "data", "uploads");
fs.mkdirSync(cardsDir, { recursive: true });
fs.mkdirSync(uploadsDir, { recursive: true });
app.use("/static/cards", express.static(cardsDir));
app.use("/static/uploads", express.static(uploadsDir));

app.use("/v1/auth", authRouter);
app.use("/v1/chat", chatRouter);
app.use("/v1/conversations", conversationsRouter);
app.use("/v1/profile", profileRouter);
app.use("/v1/history", historyRouter);
app.use("/v1/billing", billingRouter);
app.use("/v1/summary", summaryRouter);
app.use("/v1/channels", channelsRouter);
app.use("/v1/analytics", analyticsRouter);
app.use("/internal", internalRouter);

app.get("/r/:ref", async (req, res) => {
  const ref = req.params["ref"];
  if (!ref || ref.length > 64) {
    return res.status(400).type("text/plain").send("Invalid link");
  }
  const u = await prisma.user.findUnique({ where: { shareRef: ref }, select: { id: true } });
  void logAnalytics({
    userId: u?.id ?? null,
    name: "share_link_open",
    properties: { ref },
    source: "server",
  });
  const dest = cfg.MARKETING_SITE_URL ?? "https://gluci.app";
  const join = dest.includes("?") ? "&" : "?";
  res.redirect(302, `${dest}${join}utm_source=gluci_share&ref=${encodeURIComponent(ref)}`);
});

app.post("/webhooks/telegram", async (req, res) => {
  try {
    await handleTelegramUpdate(req.body as Record<string, unknown>);
  } catch (e) {
    console.error("telegram webhook", e);
  }
  res.sendStatus(200);
});

app.get("/webhooks/whatsapp", (req, res) => {
  const mode = req.query["hub.mode"] as string | undefined;
  const token = req.query["hub.verify_token"] as string | undefined;
  const challenge = req.query["hub.challenge"] as string | undefined;
  const out = verifyWhatsApp(mode, token, challenge);
  if (out) return res.status(200).send(out);
  res.sendStatus(403);
});

app.post("/webhooks/whatsapp", async (req, res) => {
  try {
    await handleWhatsAppPayload(req.body as Record<string, unknown>);
  } catch (e) {
    console.error("whatsapp webhook", e);
  }
  res.sendStatus(200);
});

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Server error" });
});

app.listen(cfg.PORT, async () => {
  console.log(`Gluci API listening on :${cfg.PORT}`);
  try {
    await migrateOrphanedMessages();
  } catch (e) {
    console.warn("legacy message migration:", e);
  }
});
