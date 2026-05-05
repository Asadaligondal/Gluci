import { Router } from "express";
import { getConfig } from "../config.js";
import { prisma } from "../db.js";
import { usersEligibleForReengagement } from "../services/summaries.js";
import { sendTelegramMessage } from "../channels/telegram.js";
import { sendWhatsAppMessage } from "../channels/whatsapp.js";
import { sendFcmNotification } from "../services/fcm.js";
import { logAnalytics } from "../services/analytics.js";

export const internalRouter = Router();

const NUDGE_MESSAGES = [
  "What are you eating next? Send me a photo or restaurant name.",
  "Want help choosing dinner? Send me a restaurant and I'll highlight the best picks.",
  "At the grocery store? Scan one item and I'll score it.",
  "Heading out to eat? Name the spot and I'll tell you what to order.",
  "What's your next meal? Send a photo and get your GlucoseGal score.",
  "Picking up food later? Let me help you choose before you order.",
  "Quick check — what are you having today? Send a photo or ask about a menu.",
  "One photo, one score. What are you eating next?",
];

function pickNudge(): string {
  return NUDGE_MESSAGES[Math.floor(Math.random() * NUDGE_MESSAGES.length)];
}

internalRouter.get("/cron/reengage", async (req, res) => {
  const cfg = getConfig();
  if (!cfg.CRON_SECRET || req.headers["x-cron-secret"] !== cfg.CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const users = await usersEligibleForReengagement();
  const lines: string[] = [];

  for (const u of users) {
    const msg = pickNudge();
    let sent = false;

    try {
      if (u.telegramChatId) {
        await sendTelegramMessage(u.telegramChatId, msg);
        void logAnalytics({
          userId: u.id,
          name: "reengagement_sent",
          properties: { channel: "telegram" },
          source: "server",
        });
        sent = true;
      }

      if (u.whatsappWaId) {
        await sendWhatsAppMessage(u.whatsappWaId, msg);
        void logAnalytics({
          userId: u.id,
          name: "reengagement_sent",
          properties: { channel: "whatsapp" },
          source: "server",
        });
        sent = true;
      }

      if (u.fcmToken) {
        await sendFcmNotification(u.fcmToken, msg);
        void logAnalytics({
          userId: u.id,
          name: "reengagement_sent",
          properties: { channel: "fcm" },
          source: "server",
        });
        sent = true;
      }

      if (sent) {
        await prisma.user.update({
          where: { id: u.id },
          data: { lastReengagementAt: new Date() },
        });
        lines.push(`sent:${u.id}`);
      }
    } catch (e) {
      lines.push(`fail:${u.id}:${String(e)}`);
    }
  }

  res.json({ processed: users.length, sent: lines.filter((l) => l.startsWith("sent:")).length, lines });
});
