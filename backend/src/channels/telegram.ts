import { prisma } from "../db.js";
import { getConfig } from "../config.js";
import { getOrCreateTelegramUser } from "../services/users.js";
import { handleChatTurn } from "../services/orchestrator.js";
import { getOrCreateChannelConversation } from "../services/conversationService.js";
import { tryLinkTelegramByCode } from "../services/linking.js";
import { getPendingSetup, setPendingSetup, saveGoal, saveDietaryField } from "../services/profileService.js";

const TG_API = "https://api.telegram.org";

function isImageDocument(doc: { file_id?: string; mime_type?: string; file_name?: string } | undefined): boolean {
  if (!doc?.file_id) return false;
  if (doc.mime_type?.startsWith("image/")) return true;
  const n = (doc.file_name ?? "").toLowerCase();
  return /\.(jpe?g|png|gif|webp|heic|heif|bmp)$/.test(n);
}

const TG_COMMANDS =
  "Commands you can use anytime:\n" +
  "/setgoal — update your health goal\n" +
  "/setallergies — update allergies or foods to avoid\n" +
  "/setdiet — update dietary preferences\n" +
  "/stop — mute nudges\n" +
  "/notify — resume daily nudges\n" +
  "/nudge_less — nudge every 3 days\n" +
  "/nudge_daily — back to daily nudges";

const Q_GOAL = "What's your main health goal? (e.g. lose weight, manage blood sugar, eat healthier, build muscle)\nReply with your goal or type 'skip'.";
const Q_ALLERGIES = "Any allergies or foods to avoid? (e.g. gluten, dairy, nuts, shellfish)\nReply or type 'skip'.";
const Q_DIET = "Any dietary preferences? (e.g. vegetarian, vegan, low carb, halal, keto)\nReply or type 'skip'.";

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

async function sendTelegramPhoto(chatId: string, photoUrl: string, caption: string) {
  await tgMethod("sendPhoto", {
    chat_id: chatId,
    photo: photoUrl,
    caption: caption.slice(0, 1024),
  });
}

function mimeFromPathOrHint(filePath: string, mimeHint?: string): string {
  if (mimeHint && mimeHint.startsWith("image/")) return mimeHint;
  const p = filePath.toLowerCase();
  if (p.endsWith(".png")) return "image/png";
  if (p.endsWith(".webp")) return "image/webp";
  if (p.endsWith(".gif")) return "image/gif";
  return "image/jpeg";
}

async function downloadTelegramFile(
  fileId: string,
  mimeHint?: string,
): Promise<{ base64: string; mime: string } | null> {
  const cfg = getConfig();
  const token = cfg.TELEGRAM_BOT_TOKEN!;
  const meta = (await fetch(`${TG_API}/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`).then((r) =>
    r.json(),
  )) as { ok?: boolean; result?: { file_path?: string } };
  if (!meta.ok || !meta.result?.file_path) return null;
  const url = `${TG_API}/file/bot${token}/${meta.result.file_path}`;
  const buf = await fetch(url).then((r) => r.arrayBuffer());
  const mime = mimeFromPathOrHint(meta.result.file_path, mimeHint);
  return { base64: Buffer.from(buf).toString("base64"), mime };
}

export async function handleTelegramUpdate(update: Record<string, unknown>) {
  const msg = update.message as Record<string, unknown> | undefined;
  if (!msg || !msg.chat) return;
  const chat = msg.chat as { id: number };
  const chatId = String(chat.id);
  let text = typeof msg.text === "string" ? msg.text.trim() : "";
  if (!text && typeof msg.caption === "string") text = msg.caption.trim();

  const linkMatch = text.match(/^\/link(?:@\w+)?\s+([A-Fa-f0-9]+)\s*$/i);
  if (linkMatch) {
    const r = await tryLinkTelegramByCode(linkMatch[1], chatId);
    await sendTelegramMessage(chatId, r.message);
    return;
  }

  const from = msg.from as { first_name?: string; last_name?: string; username?: string } | undefined;
  const firstName = from?.first_name || "there";

  const { user, isNew } = await getOrCreateTelegramUser(chatId);

  if (/^\/stop(?:@\w+)?$/i.test(text)) {
    await prisma.user.update({ where: { id: user.id }, data: { reengagementOptOut: true } });
    await sendTelegramMessage(chatId, "Nudges are off. Send /notify for daily nudges or /nudge_less for every-3-day nudges.");
    return;
  }
  if (/^\/notify(?:@\w+)?$/i.test(text)) {
    await prisma.user.update({ where: { id: user.id }, data: { reengagementOptOut: false, reengagementFrequencyDays: 1 } });
    await sendTelegramMessage(chatId, "Daily nudges are on. Send /stop to mute or /nudge_less for every-3-day nudges.");
    return;
  }
  if (/^\/nudge_less(?:@\w+)?$/i.test(text)) {
    await prisma.user.update({ where: { id: user.id }, data: { reengagementOptOut: false, reengagementFrequencyDays: 3 } });
    await sendTelegramMessage(chatId, "Got it — I'll nudge you every 3 days. Send /notify for daily or /stop to mute.");
    return;
  }
  if (/^\/nudge_daily(?:@\w+)?$/i.test(text)) {
    await prisma.user.update({ where: { id: user.id }, data: { reengagementOptOut: false, reengagementFrequencyDays: 1 } });
    await sendTelegramMessage(chatId, "Daily nudges are on. Send /nudge_less for every-3-day nudges or /stop to mute.");
    return;
  }

  // Personalization commands — work anytime
  if (/^\/setgoal(?:@\w+)?$/i.test(text)) {
    await setPendingSetup(user.id, "goal");
    await sendTelegramMessage(chatId, Q_GOAL);
    return;
  }
  if (/^\/setallergies(?:@\w+)?$/i.test(text)) {
    await setPendingSetup(user.id, "allergies");
    await sendTelegramMessage(chatId, Q_ALLERGIES);
    return;
  }
  if (/^\/setdiet(?:@\w+)?$/i.test(text)) {
    await setPendingSetup(user.id, "diet");
    await sendTelegramMessage(chatId, Q_DIET);
    return;
  }

  // New user: start onboarding Q&A
  if (isNew) {
    await sendTelegramMessage(
      chatId,
      `👋 Welcome to Gluci, ${firstName}!\n\nI'm your personal glucose coach — I'll score your meals, flag glucose spikes, and suggest smarter choices.\n\nFirst, let me personalise your experience.\n\n${Q_GOAL}`,
    );
    await setPendingSetup(user.id, "goal");
    await prisma.user.update({ where: { id: user.id }, data: { telegramOnboardingSent: true } });
    return;
  }

  if (
    /^\/start(?:@\w+)?\s*$/i.test(text) &&
    !(msg.photo as unknown[])?.length &&
    !isImageDocument(msg.document as { file_id?: string; mime_type?: string; file_name?: string } | undefined)
  ) {
    await sendTelegramMessage(chatId, "Send a food photo, restaurant question, or grocery barcode anytime.\n\n" + TG_COMMANDS);
    return;
  }

  text = text.replace(/^\/start(?:@\w+)?\s*/i, "").trim();

  const photos = msg.photo as { file_id: string }[] | undefined;
  const document = msg.document as { file_id?: string; mime_type?: string; file_name?: string } | undefined;
  let imageBase64: string | undefined;
  let mimeType: string | undefined;
  if (photos?.length) {
    const best = photos[photos.length - 1];
    const dl = await downloadTelegramFile(best.file_id);
    if (dl) {
      imageBase64 = dl.base64;
      mimeType = dl.mime;
    }
  } else if (document && isImageDocument(document)) {
    const dl = await downloadTelegramFile(document.file_id!, document.mime_type);
    if (dl) {
      imageBase64 = dl.base64;
      mimeType = dl.mime;
    }
  }

  let barcode: string | undefined;
  const m = text.match(/\b(\d{8,14})\b/);
  if (m) barcode = m[1];

  const hadImagePayload = Boolean(photos?.length) || isImageDocument(document);
  if (hadImagePayload && !imageBase64) {
    await sendTelegramMessage(
      chatId,
      "I could not read that image. Try again, or send the picture as a photo (not a file) if the problem continues.",
    );
    return;
  }
  if (!text && !imageBase64) return;

  // Handle pending personalization setup step
  const pending = await getPendingSetup(user.id);
  if (pending) {
    const answer = text.trim().toLowerCase() === "skip" ? "" : text.trim();
    if (pending === "goal") {
      if (answer) await saveGoal(user.id, answer);
      await setPendingSetup(user.id, "allergies");
      await sendTelegramMessage(chatId, Q_ALLERGIES);
      return;
    }
    if (pending === "allergies") {
      if (answer) await saveDietaryField(user.id, "allergies", answer);
      await setPendingSetup(user.id, "diet");
      await sendTelegramMessage(chatId, Q_DIET);
      return;
    }
    if (pending === "diet") {
      if (answer) await saveDietaryField(user.id, "preferences", answer);
      await setPendingSetup(user.id, null);
      await sendTelegramMessage(
        chatId,
        "✅ All set! I'll personalise every response to your profile.\n\nSend me a food photo, restaurant question, or grocery barcode to get started.\n\n" + TG_COMMANDS,
      );
      return;
    }
  }

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

  // Format restaurant top 3 picks as a readable message
  if (out.structured.intent === "restaurant" && out.structured.topOrders?.length) {
    const picks = out.structured.topOrders
      .map((o, i) => `${i + 1}. ${o.name} — ${o.score}/10\n   💡 ${o.tweaks}`)
      .join("\n\n");
    await sendTelegramMessage(chatId, `${out.reply}\n\n🍽 Top picks for stable blood sugar:\n\n${picks}`);
    return;
  }

  const ctaSuffix = out.shareCardUrl ? "\n\n📊 Sending your glucose card below!" : "";
  await sendTelegramMessage(chatId, out.reply + ctaSuffix);

  if (out.shareCardUrl) {
    const cfg = getConfig();
    const cardUrl = out.shareCardUrl.startsWith("http")
      ? out.shareCardUrl
      : `${cfg.PUBLIC_BASE_URL}${out.shareCardUrl}`;
    const scoreLabel = out.structured.glucoseGalScore != null ? `Score: ${out.structured.glucoseGalScore}/10` : "";
    const verdictLabel = out.structured.verdict ? ` | ${out.structured.verdict.toUpperCase()}` : "";
    await sendTelegramPhoto(chatId, cardUrl, `${scoreLabel}${verdictLabel}`.trim() || "Your Gluci result");
    const sharePageUrl = `${cfg.PUBLIC_BASE_URL}/share?card=${encodeURIComponent(cardUrl)}`;
    await sendTelegramMessage(chatId, `📤 Share your result:\n${sharePageUrl}`);
  }

  const mealCount = await prisma.usageEvent.count({ where: { userId: user.id } });
  if (mealCount > 0 && mealCount % 3 === 0) {
    await sendTelegramMessage(
      chatId,
      `🌟 You've analyzed ${mealCount} meals with Gluci!\n\n` +
        "Want to track your progress over time?\n" +
        "Download the Gluci app to see your glucose history, weekly trends, and more.",
    );
  }
}
