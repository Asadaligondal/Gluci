import { randomBytes } from "crypto";
import { prisma } from "../db.js";

function genRef(): string {
  return randomBytes(6).toString("hex").slice(0, 12);
}

/** Idempotent: ensures user has a stable opaque share referral code. */
export async function ensureShareRef(userId: string): Promise<string> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { shareRef: true } });
  if (u?.shareRef) return u.shareRef;
  for (let i = 0; i < 8; i++) {
    const ref = genRef();
    try {
      await prisma.user.update({ where: { id: userId }, data: { shareRef: ref } });
      return ref;
    } catch {
      /* unique collision */
    }
  }
  throw new Error("Could not allocate shareRef");
}
