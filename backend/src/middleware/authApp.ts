import type { Request, Response, NextFunction } from "express";
import { prisma } from "../db.js";
import { getUserByAppToken } from "../services/users.js";
import { verifyAccessToken } from "../services/authTokens.js";

export type AuthedRequest = Request & { userId?: string; user?: Awaited<ReturnType<typeof prisma.user.findUnique>> & { profile: unknown } };

export async function authAppBearer(req: AuthedRequest, res: Response, next: NextFunction) {
  const h = req.headers.authorization;
  if (!h?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing Bearer token" });
  }
  const token = h.slice("Bearer ".length).trim();

  const jwtUser = verifyAccessToken(token);
  if (jwtUser) {
    const user = await prisma.user.findUnique({
      where: { id: jwtUser.userId },
      include: { profile: true },
    });
    if (!user) return res.status(401).json({ error: "Invalid token" });
    req.userId = user.id;
    req.user = user as AuthedRequest["user"];
    return next();
  }

  const user = await getUserByAppToken(token);
  if (!user) return res.status(401).json({ error: "Invalid token" });
  req.userId = user.id;
  req.user = user as AuthedRequest["user"];
  next();
}
