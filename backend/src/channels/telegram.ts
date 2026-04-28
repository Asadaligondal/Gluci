import { prisma } from "../db.js";
import { getConfig } from "../config.js";
import { getOrCreateTelegramUser } from "../services/users.js";
import { handleChatTurn } from "../services/orchestrator.js";
import { getOrCreateChannelConversation } from "../services/conversationService.js";
import { tryLinkTelegramByCode } from "../services/linking.js";

const TG_API = "https://api.telegram.org";

const ONBOARDING =
  "Welcome to Gluci — your friendly food coach *before* you eat.\n\n" +
  "Send a meal photo, ask about a restaurant or menu, or type a grocery barcode. " +
  "You get a GlucoseGal score, a clear verdict, and practical tweaks—no shame.\n\n" +
  "Commands:\n/stop — mute daily check-in nudges\n/notify — turn nudges back on";

async function tgMethod(method: string, body: Record<string, unknown>) {
  const cfg = getConfig();
  const token = cfg.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN not set");
  const res = await fetch(`${TG_API}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Telegram ${method}: ${res.status} ${t}`);
  }
  return res.json() as Promise<unknown>;
}

export async function sendTelegramMessage(chatId: string, text: string) {
  await tgMethod("sendMessage", {
    chat_id: chatId,
    text: text.slice(0, 4000),
  });
}

async function downloadTelegramFile(fileId: string): Promise<{ base64: string; mime: string } | null> {
  const cfg = getConfig();
  const token = cfg.TELEGRAM_BOT_TOKEN!;
  const meta = (await fetch(`${TG_API}/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`).then((r) =>
    r.json(),
  )) as { ok?: boolean; result?: { file_path?: string } };
  if (!meta.ok || !meta.result?.file_path) return null;
  const url = `${TG_API}/file/bot${token}/${meta.result.file_path}`;
  const buf = await fetch(url).then((r) => r.arrayBuffer());
  const mime = meta.result.file_path.endsWith(".png") ? "image/png" : "image/jpeg";
  return { base64: Buffer.from(buf).toString("base64"), mime };
}

export async function handleTelegramUpdate(update: Record<string, unknown>) {
  const msg = update.message as Record<string, unknown> | undefined;
  if (!msg || !msg.chat) return;
  const chat = msg.chat as { id: number };
  const chatId = String(chat.id);
  let text = typeof msg.text === "string" ? msg.text.trim() : "";

  const linkMatch = text.match(/^\/link(?:@\w+)?\s+([A-Fa-f0-9]+)\s*$/i);
  if (linkMatch) {
    const r = await tryLinkTelegramByCode(linkMatch[1], chatId);
    await sendTelegramMessage(chatId, r.message);
    return;
  }

  const user = await getOrCreateTelegramUser(chatId);

  if (/^\/stop(?:@\w+)?$/i.test(text)) {
    await prisma.user.update({ where: { id: user.id }, data: { reengagementOptOut: true } });
    await sendTelegramMessage(chatId, "Daily nudges are off. Send /notify anytime to turn them back on.");
    return;
  }
  if (/^\/notify(?:@\w+)?$/i.test(text)) {
    await prisma.user.update({ where: { id: user.id }, data: { reengagementOptOut: false } });
    await sendTelegramMessage(chatId, "Daily nudges are on. Send /stop to mute again.");
    return;
  }

  if (/^\/start(?:@\w+)?\s*$/i.test(text) && !(msg.photo as unknown[])?.length) {
    await sendTelegramMessage(chatId, user.telegramOnboardingSent ? "Send a food photo or question anytime." : ONBOARDING);
    if (!user.telegramOnboardingSent) {
      await prisma.user.update({ where: { id: user.id }, data: { telegramOnboardingSent: true } });
    }
    return;
  }

  text = text.replace(/^\/start(?:@\w+)?\s*/i, "").trim();

  const photos = msg.photo as { file_id: string }[] | undefined;
  let imageBase64: string | undefined;
  let mimeType: string | undefined;
  if (photos?.length) {
    const best = photos[photos.length - 1];
    const dl = await downloadTelegramFile(best.file_id);
    if (dl) {
      imageBase64 = dl.base64;
      mimeType = dl.mime;
    }
  }

  let barcode: string | undefined;
  const m = text.match(/\b(\d{8,14})\b/);
  if (m) barcode = m[1];

  if (!user.telegramOnboardingSent && (text || imageBase64)) {
    await prisma.user.update({ where: { id: user.id }, data: { telegramOnboardingSent: true } });
    await sendTelegramMessage(chatId, ONBOARDING);
  }

  if (!text && !imageBase64) return;

  const thread = await getOrCreateChannelConversation(user.id, "telegram");
  const out = await handleChatTurn({
    userId: user.id,
    conversationId: thread.id,
    text: text || undefined,
    imageBase64,
    mimeType,
    barcode,
    channel: "telegram",
  });

  await sendTelegramMessage(chatId, out.reply);
}
