import { Router } from "express";
import { getConfig } from "../config.js";
import { prisma } from "../db.js";
import { usersEligibleForReengagement, buildDailySummary } from "../services/summaries.js";
import { sendTelegramMessage } from "../channels/telegram.js";

export const internalRouter = Router();

internalRouter.get("/cron/reengage", async (req, res) => {
  const cfg = getConfig();
  if (!cfg.CRON_SECRET || req.headers["x-cron-secret"] !== cfg.CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const users = await usersEligibleForReengagement();
  const lines: string[] = [];
  for (const u of users) {
    const summary = await buildDailySummary(u.id);
    const msg = summary
      ? `Your Gluci day: ${summary.checks} checks, avg score ${summary.averageScore}. What are you eating next?`
      : `What are you eating next? Send a photo or ask about a restaurant.`;
    try {
      if (u.telegramChatId) {
        await sendTelegramMessage(u.telegramChatId, msg);
      }
      // WhatsApp outbound requires approved templates for many cases — skip generic push in MVP unless templates configured
      await prisma.user.update({
        where: { id: u.id },
        data: { lastReengagementAt: new Date() },
      });
      lines.push(`sent:${u.id}`);
    } catch (e) {
      lines.push(`fail:${u.id}:${String(e)}`);
    }
  }
  res.json({ processed: users.length, lines });
});
