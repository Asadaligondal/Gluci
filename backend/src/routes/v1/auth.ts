import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db.js";
import { createAppUser } from "../../services/users.js";
import { hashPassword, signAccessToken, verifyPassword } from "../../services/authTokens.js";

export const authRouter = Router();

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/** Legacy anonymous device token (optional; Android may use email auth only) */
authRouter.post("/register", async (_req, res) => {
  const user = await createAppUser();
  res.json({
    token: user.appToken,
    userId: user.id,
  });
});

authRouter.post("/signup", async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) return res.status(409).json({ error: "Email already registered" });
  const passwordHash = await hashPassword(parsed.data.password);
  const user = await prisma.user.create({
    data: {
      email: parsed.data.email,
      passwordHash,
      profile: { create: {} },
    },
  });
  res.json({ token: signAccessToken(user.id), userId: user.id });
});

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (!user?.passwordHash) {
    return res.status(401).json({ error: "Invalid email or password" });
  }
  const ok = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Invalid email or password" });
  res.json({ token: signAccessToken(user.id), userId: user.id });
});
