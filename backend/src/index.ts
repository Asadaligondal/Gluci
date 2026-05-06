import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { getConfig } from "./config.js";
import { prisma } from "./db.js";
import { logAnalytics } from "./services/analytics.js";
import { authRouter } from "./routes/v1/auth.js";
import { chatRouter, glucoseCurveRouter } from "./routes/v1/chat.js";
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
app.use("/v1/glucose-curve", glucoseCurveRouter);
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
  if (cfg.MARKETING_SITE_URL) {
    const join = cfg.MARKETING_SITE_URL.includes("?") ? "&" : "?";
    return res.redirect(302, `${cfg.MARKETING_SITE_URL}${join}utm_source=gluci_share&ref=${encodeURIComponent(ref)}`);
  }
  // Serve a minimal landing page so the link always resolves
  res.type("text/html").send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Gluci — Your Glucose Coach</title>
  <style>
    body{margin:0;font-family:Georgia,'Times New Roman',serif;background:#FAF8F5;display:flex;align-items:center;justify-content:center;min-height:100vh}
    .card{max-width:420px;width:90%;text-align:center;padding:40px 32px;background:#fff;border-radius:20px;box-shadow:0 4px 32px rgba(0,0,0,.08)}
    h1{font-size:2.2rem;color:#E91E8C;margin:0 0 8px}
    p{color:#444;font-size:1.05rem;line-height:1.6;margin:0 0 28px}
    .badge{display:inline-block;background:#111;color:#fff;padding:14px 36px;border-radius:50px;font-size:1rem;text-decoration:none;letter-spacing:.03em}
    .sub{margin-top:20px;font-size:.85rem;color:#999}
  </style>
</head>
<body>
  <div class="card">
    <h1>gluci</h1>
    <p>Your personal glucose coach — score meals, spot spikes, and make smarter food choices in seconds.</p>
    <a class="badge" href="https://play.google.com/store/apps/details?id=app.gluci.mvp">Get the app</a>
    <p class="sub">Shared via Gluci • ref ${ref}</p>
  </div>
</body>
</html>`);
});

app.post("/webhooks/telegram", (req, res) => {
  res.sendStatus(200);
  handleTelegramUpdate(req.body as Record<string, unknown>).catch((e) =>
    console.error("telegram webhook", e),
  );
});

app.get("/webhooks/whatsapp", (req, res) => {
  const mode = req.query["hub.mode"] as string | undefined;
  const token = req.query["hub.verify_token"] as string | undefined;
  const challenge = req.query["hub.challenge"] as string | undefined;
  const out = verifyWhatsApp(mode, token, challenge);
  if (out) return res.status(200).send(out);
  res.sendStatus(403);
});

app.post("/webhooks/whatsapp", (req, res) => {
  res.sendStatus(200);
  handleWhatsAppPayload(req.body as Record<string, unknown>).catch((e) =>
    console.error("whatsapp webhook", e),
  );
});

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Server error" });
});

const host = "0.0.0.0";
app.listen(cfg.PORT, host, async () => {
  console.log(`Gluci API listening on ${host}:${cfg.PORT}`);
  try {
    await migrateOrphanedMessages();
  } catch (e) {
    console.warn("legacy message migration:", e);
  }
});
