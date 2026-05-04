import { randomUUID } from "crypto";
import { prisma } from "../db.js";

export async function getUserByAppToken(token: string) {
  return prisma.user.findUnique({ where: { appToken: token }, include: { profile: true } });
}

export async function createAppUser() {
  const appToken = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
  return prisma.user.create({
    data: {
      appToken,
      profile: { create: {} },
    },
    include: { profile: true },
  });
}

export async function getOrCreateTelegramUser(chatId: string) {
  const existing = await prisma.user.findUnique({
    where: { telegramChatId: chatId },
    include: { profile: true },
  });
  if (existing) return { user: existing, isNew: false };

  const created = await prisma.user.create({
    data: { telegramChatId: chatId, profile: { create: {} } },
    include: { profile: true },
  });
  console.log(`[telegram] Created guest user for chatId: ${chatId}`, { userId: created.id });
  return { user: created, isNew: true };
}

export async function getOrCreateWhatsAppUser(waId: string) {
  let user = await prisma.user.findUnique({
    where: { whatsappWaId: waId },
    include: { profile: true },
  });
  if (!user) {
    user = await prisma.user.create({
      data: { whatsappWaId: waId, profile: { create: {} } },
      include: { profile: true },
    });
  }
  return user;
}

export function isSubscribed(user: { subscriptionStatus: string }) {
  return user.subscriptionStatus === "active";
}

export function canUseFreeCheck(user: { freeChecksUsed: number; subscriptionStatus: string }, limit: number) {
  if (isSubscribed(user)) return true;
  return user.freeChecksUsed < limit;
}
