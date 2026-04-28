import { Router } from "express";
import { z } from "zod";
import { authAppBearer, type AuthedRequest } from "../../middleware/authApp.js";
import { isAllowedClientEventName, logAnalytics } from "../../services/analytics.js";

export const analyticsRouter = Router();
analyticsRouter.use(authAppBearer);

const bodySchema = z.object({
  name: z.string().min(1).max(64),
  properties: z.record(z.string(), z.unknown()).optional(),
});

analyticsRouter.post("/event", async (req: AuthedRequest, res) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  if (!isAllowedClientEventName(parsed.data.name)) {
    return res.status(400).json({ error: "Unknown event name" });
  }
  await logAnalytics({
    userId: req.userId,
    name: parsed.data.name,
    properties: parsed.data.properties,
    source: "app",
  });
  res.json({ ok: true });
});
