import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db.js";
import { authAppBearer, type AuthedRequest } from "../../middleware/authApp.js";

export const profileRouter = Router();
profileRouter.use(authAppBearer);

profileRouter.get("/", async (req: AuthedRequest, res) => {
  const p = await prisma.profile.findUnique({ where: { userId: req.userId! } });
  res.json({
    goal: p?.goal ?? null,
    dietaryJson: p?.dietaryJson ? JSON.parse(p.dietaryJson) : {},
    memoryJson: p?.memoryJson ? JSON.parse(p.memoryJson) : {},
  });
});

const patchSchema = z.object({
  goal: z.string().optional(),
  dietaryJson: z.record(z.string(), z.unknown()).optional(),
});

profileRouter.patch("/", async (req: AuthedRequest, res) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const data: { goal?: string; dietaryJson?: string } = {};
  if (parsed.data.goal !== undefined) data.goal = parsed.data.goal;
  if (parsed.data.dietaryJson !== undefined) data.dietaryJson = JSON.stringify(parsed.data.dietaryJson);

  const p = await prisma.profile.upsert({
    where: { userId: req.userId! },
    create: { userId: req.userId!, ...data },
    update: data,
  });
  res.json({ ok: true, goal: p.goal });
});
