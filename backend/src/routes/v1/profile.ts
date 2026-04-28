import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db.js";
import { authAppBearer, type AuthedRequest } from "../../middleware/authApp.js";
import { ensureShareRef } from "../../services/shareRef.js";

export const profileRouter = Router();
profileRouter.use(authAppBearer);

profileRouter.get("/", async (req: AuthedRequest, res) => {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: req.userId! } });
  const p = await prisma.profile.findUnique({ where: { userId: req.userId! } });
  const shareRef = await ensureShareRef(req.userId!);
  res.json({
    goal: p?.goal ?? null,
    dietaryJson: p?.dietaryJson ? JSON.parse(p.dietaryJson) : {},
    memoryJson: p?.memoryJson ? JSON.parse(p.memoryJson) : {},
    reengagementOptOut: u.reengagementOptOut,
    reengagementFrequencyDays: u.reengagementFrequencyDays,
    appOnboardingComplete: u.appOnboardingComplete,
    shareRef,
  });
});

const patchSchema = z.object({
  goal: z.string().optional(),
  dietaryJson: z.record(z.string(), z.unknown()).optional(),
  reengagementOptOut: z.boolean().optional(),
  reengagementFrequencyDays: z.number().int().min(1).max(30).optional(),
  appOnboardingComplete: z.boolean().optional(),
});

profileRouter.patch("/", async (req: AuthedRequest, res) => {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const uid = req.userId!;
  const data: { goal?: string; dietaryJson?: string } = {};
  if (parsed.data.goal !== undefined) data.goal = parsed.data.goal;
  if (parsed.data.dietaryJson !== undefined) data.dietaryJson = JSON.stringify(parsed.data.dietaryJson);

  if (Object.keys(data).length > 0) {
    await prisma.profile.upsert({
      where: { userId: uid },
      create: { userId: uid, ...data },
      update: data,
    });
  }

  const userPatch: {
    reengagementOptOut?: boolean;
    reengagementFrequencyDays?: number;
    appOnboardingComplete?: boolean;
  } = {};
  if (parsed.data.reengagementOptOut !== undefined) userPatch.reengagementOptOut = parsed.data.reengagementOptOut;
  if (parsed.data.reengagementFrequencyDays !== undefined)
    userPatch.reengagementFrequencyDays = parsed.data.reengagementFrequencyDays;
  if (parsed.data.appOnboardingComplete !== undefined)
    userPatch.appOnboardingComplete = parsed.data.appOnboardingComplete;

  if (Object.keys(userPatch).length > 0) {
    await prisma.user.update({ where: { id: uid }, data: userPatch });
  }

  const p = await prisma.profile.findUnique({ where: { userId: uid } });
  res.json({ ok: true, goal: p?.goal ?? null });
});
