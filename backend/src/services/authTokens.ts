import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { getConfig } from "../config.js";

const BCRYPT_ROUNDS = 10;
const JWT_EXPIRES = "30d";

export function signAccessToken(userId: string) {
  const { JWT_SECRET } = getConfig();
  return jwt.sign({ sub: userId, typ: "access" }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

export function verifyAccessToken(token: string): { userId: string } | null {
  try {
    const { JWT_SECRET } = getConfig();
    const decoded = jwt.verify(token, JWT_SECRET) as { sub: string; typ?: string };
    if (decoded.typ && decoded.typ !== "access") return null;
    if (!decoded.sub) return null;
    return { userId: decoded.sub };
  } catch {
    return null;
  }
}

export async function hashPassword(plain: string) {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}
