import { randomBytes } from "crypto";
import { prisma } from "../db.js";

const LINK_TTL_MS = 15 * 60 * 1000;

function newLinkCode() {
  return randomBytes(4).toString("hex");
}

/**
 * Mints a new link code for the app user. Used in Telegram / WhatsApp as: /link &lt;code&gt;
 */
export async function createLinkCodeForUser(userId: string) {
  const code = newLinkCode();
  const expires = new Date(Date.now() + LINK_TTL_MS);
  await prisma.user.update({
    where: { id: userId },
    data: { linkCode: code, linkCodeExpiresAt: expires },
  });
  return { code, expiresAt: expires.toISOString() };
}

/**
 * Tries to attach a Telegram chat to the app user identified by a valid, unexpired link code.
 * Removes a duplicate Telegram-only user that held this chat id, if any.
 */
export async function tryLinkTelegramByCode(plainCode: string, telegramChatId: string) {
  const now = new Date();
  const target = await prisma.user.findFirst({
    where: { linkCode: plainCode, linkCodeExpiresAt: { gt: now } },
  });
  if (!target) return { ok: false as const, message: "Invalid or expired code. Open the app, generate a new one, and try again within 15 minutes." };

  if (target.telegramChatId === telegramChatId) {
    await prisma.user.update({
      where: { id: target.id },
      data: { linkCode: null, linkCodeExpiresAt: null },
    });
    return { ok: true as const, message: "Telegram is already connected to this Gluci account." };
  }

  const existingForChat = await prisma.user.findUnique({ where: { telegramChatId } });
  if (existingForChat) {
    if (existingForChat.appToken) {
      return { ok: false as const, message: "This Telegram is already connected to a different app session." };
    }
    if (existingForChat.id === target.id) {
      return { ok: true as const, message: "Telegram linked." };
    }
    await prisma.user.delete({ where: { id: existingForChat.id } });
  }

  await prisma.user.update({
    where: { id: target.id },
    data: { telegramChatId, linkCode: null, linkCodeExpiresAt: null },
  });
  return { ok: true as const, message: "Telegram linked to this Gluci account. You can chat here and your goals stay in sync with the app." };
}

/**
 * Tries to attach a WhatsApp wa_id to the app user (same as Telegram).
 */
export async function tryLinkWhatsAppByCode(plainCode: string, waId: string) {
  const now = new Date();
  const target = await prisma.user.findFirst({
    where: { linkCode: plainCode, linkCodeExpiresAt: { gt: now } },
  });
  if (!target) return { ok: false as const, message: "Invalid or expired code. Open the app, generate a new one, and try again within 15 minutes." };

  if (target.whatsappWaId === waId) {
    await prisma.user.update({
      where: { id: target.id },
      data: { linkCode: null, linkCodeExpiresAt: null },
    });
    return { ok: true as const, message: "WhatsApp is already connected to this Gluci account." };
  }

  const existingForWa = await prisma.user.findUnique({ where: { whatsappWaId: waId } });
  if (existingForWa) {
    if (existingForWa.appToken) {
      return { ok: false as const, message: "This WhatsApp is already connected to a different app session." };
    }
    if (existingForWa.id === target.id) {
      return { ok: true as const, message: "WhatsApp linked." };
    }
    await prisma.conversation.deleteMany({ where: { userId: existingForWa.id } });
    await prisma.user.delete({ where: { id: existingForWa.id } });
  }

  await prisma.user.update({
    where: { id: target.id },
    data: { whatsappWaId: waId, linkCode: null, linkCodeExpiresAt: null },
  });
  return { ok: true as const, message: "WhatsApp linked to this Gluci account. You can message the business number and it will use the same plan and memory as the app." };
}
