import { prisma } from "../db.js";
import { getConfig } from "../config.js";
import { getOrCreateWhatsAppUser } from "../services/users.js";
import { handleChatTurn } from "../services/orchestrator.js";
import { getOrCreateChannelConversation } from "../services/conversationService.js";
import { tryLinkWhatsAppByCode } from "../services/linking.js";
import { getPendingSetup, setPendingSetup, saveGoal, saveDietaryField } from "../services/profileService.js";

const processedMsgIds = new Set<string>();

const WA_COMMANDS =
  "Commands you can use anytime:\n" +
  "SET GOAL — update your health goal\n" +
  "SET ALLERGIES — update allergies or foods to avoid\n" +
  "SET DIET — update dietary preferences\n" +
  "STOP — mute nudges\n" +
  "NOTIFY — resume daily nudges\n" +
  "NUDGE LESS — nudge every 3 days\n" +
  "NUDGE DAILY — back to daily nudges";

const Q_GOAL = "What's your main health goal? (e.g. lose weight, manage blood sugar, eat healthier, build muscle)\nReply with your goal or text SKIP.";
const Q_ALLERGIES = "Any allergies or foods to avoid? (e.g. gluten, dairy, nuts, shellfish)\nReply or text SKIP.";
const Q_DIET = "Any dietary preferences? (e.g. vegetarian, vegan, low carb, halal, keto)\nReply or text SKIP.";

export async function sendWhatsAppMessage(to: string, body: string) {
  await waSendText(to, body);
}

async function waSendText(to: string, body: string) {
  const cfg = getConfig();
  const token = cfg.WHATSAPP_ACCESS_TOKEN;
  const phoneId = cfg.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) throw new Error("WhatsApp not configured");

  const url = `https://graph.facebook.com/v21.0/${phoneId}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { preview_url: false, body: body.slice(0, 4000) },
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`WhatsApp send: ${res.status} ${t}`);
  }
}

async function waSendImage(to: string, imageUrl: string, caption: string) {
  const cfg = getConfig();
  const token = cfg.WHATSAPP_ACCESS_TOKEN;
  const phoneId = cfg.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) return;

  const url = `https://graph.facebook.com/v21.0/${phoneId}/messages`;
  await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "image",
      image: { link: imageUrl, caption: caption.slice(0, 1024) },
    }),
  });
}

async function waDownloadMedia(mediaId: string): Promise<{ base64: string; mime: string } | null> {
  const cfg = getConfig();
  const token = cfg.WHATSAPP_ACCESS_TOKEN;
  if (!token) return null;
  const metaRes = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!metaRes.ok) return null;
  const meta = (await metaRes.json()) as { url?: string; mime_type?: string };
  if (!meta.url) return null;
  const bin = await fetch(meta.url, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.arrayBuffer());
  const mime = meta.mime_type && meta.mime_type.startsWith("image/") ? meta.mime_type : "image/jpeg";
  return { base64: Buffer.from(bin).toString("base64"), mime };
}

export function verifyWhatsApp(mode: string | undefined, token: string | undefined, challenge: string | undefined) {
  const cfg = getConfig();
  const verify = cfg.WHATSAPP_VERIFY_TOKEN;
  if (mode === "subscribe" && token === verify && challenge) return challenge;
  return null;
}

export async function handleWhatsAppPayload(body: Record<string, unknown>) {
  const entry = (body.entry as Record<string, unknown>[] | undefined)?.[0];
  const changes = (entry?.changes as Record<string, unknown>[] | undefined)?.[0];
  const value = changes?.value as Record<string, unknown> | undefined;
  const messages = value?.messages as Record<string, unknown>[] | undefined;
  const msg = messages?.[0];
  if (!msg) return;

  const from = String(msg.from ?? "");
  if (!from) return;

  const msgId = String(msg.id ?? "");
  if (msgId && processedMsgIds.has(msgId)) return;
  if (msgId) {
    processedMsgIds.add(msgId);
    if (processedMsgIds.size > 500) {
      const first = processedMsgIds.values().next().value;
      if (first) processedMsgIds.delete(first);
    }
  }

  let text = "";
  if (msg.type === "text" && msg.text && typeof (msg.text as { body?: string }).body === "string") {
    text = (msg.text as { body: string }).body.trim();
  }
  const linkMatch = text.match(/^\/?link\s+([A-Fa-f0-9]+)\s*$/i);
  if (linkMatch) {
    const r = await tryLinkWhatsAppByCode(linkMatch[1], from);
    await waSendText(from, r.message);
    return;
  }
  // Help when user typed "link something" but the code must be hex digits only (from the app), one message, no extra text.
  if (/^\/?link\s+\S+/i.test(text) && !/^\/?link\s+[A-Fa-f0-9]+\s*$/i.test(text)) {
    try {
      await waSendText(
        from,
        "That link code does not look valid. In WhatsApp send exactly: link PASTE_CODE — one space, then the 8 character code from the app (only 0-9 and a-f). No other words on the line.",
      );
    } catch {
      /* if send fails, webhook still returns 200; check Render logs */
    }
    return;
  }

  const user = await getOrCreateWhatsAppUser(from);

  const low = text.toLowerCase();
  if (low === "stop nudges" || low === "/stop" || low === "stop") {
    await prisma.user.update({ where: { id: user.id }, data: { reengagementOptOut: true } });
    await waSendText(from, "Nudges are off. Text NOTIFY to turn them back on, or NUDGE LESS for every-3-day nudges.");
    return;
  }
  if (low === "notify" || low === "notify gluci") {
    await prisma.user.update({ where: { id: user.id }, data: { reengagementOptOut: false, reengagementFrequencyDays: 1 } });
    await waSendText(from, "Daily nudges are on. Text STOP to mute or NUDGE LESS for every-3-day nudges.");
    return;
  }
  if (low === "nudge less") {
    await prisma.user.update({ where: { id: user.id }, data: { reengagementOptOut: false, reengagementFrequencyDays: 3 } });
    await waSendText(from, "Got it — I'll nudge you every 3 days instead. Text NOTIFY for daily or STOP to mute.");
    return;
  }
  if (low === "nudge daily") {
    await prisma.user.update({ where: { id: user.id }, data: { reengagementOptOut: false, reengagementFrequencyDays: 1 } });
    await waSendText(from, "Daily nudges are on. Text NUDGE LESS for every-3-day nudges or STOP to mute.");
    return;
  }

  // Personalization commands — work anytime
  if (low === "set goal") {
    await setPendingSetup(user.id, "goal");
    await waSendText(from, Q_GOAL);
    return;
  }
  if (low === "set allergies") {
    await setPendingSetup(user.id, "allergies");
    await waSendText(from, Q_ALLERGIES);
    return;
  }
  if (low === "set diet") {
    await setPendingSetup(user.id, "diet");
    await waSendText(from, Q_DIET);
    return;
  }

  let imageBase64: string | undefined;
  let mimeType: string | undefined;
  if (msg.type === "image" && msg.image && typeof (msg.image as { id?: string }).id === "string") {
    const id = (msg.image as { id: string }).id;
    const dl = await waDownloadMedia(id);
    if (dl) {
      imageBase64 = dl.base64;
      mimeType = dl.mime;
    }
  }

  let barcode: string | undefined;
  const m = text.match(/\b(\d{8,14})\b/);
  if (m) barcode = m[1];

  // New user: start onboarding Q&A
  if (!user.whatsappOnboardingSent) {
    await prisma.user.update({ where: { id: user.id }, data: { whatsappOnboardingSent: true } });
    await waSendText(
      from,
      "👋 Welcome to Gluci! I'm your personal glucose coach — I'll score your meals, flag glucose spikes, and suggest smarter choices.\n\nFirst, let me personalise your experience.\n\n" + Q_GOAL,
    );
    await setPendingSetup(user.id, "goal");
    return;
  }

  if (!text && !imageBase64) {
    await waSendText(from, "Send a food photo, restaurant question, or grocery barcode number.");
    return;
  }

  // Handle pending personalization setup step
  const pending = await getPendingSetup(user.id);
  if (pending) {
    const answer = text.trim().toLowerCase() === "skip" ? "" : text.trim();
    if (pending === "goal") {
      if (answer) await saveGoal(user.id, answer);
      await setPendingSetup(user.id, "allergies");
      await waSendText(from, Q_ALLERGIES);
      return;
    }
    if (pending === "allergies") {
      if (answer) await saveDietaryField(user.id, "allergies", answer);
      await setPendingSetup(user.id, "diet");
      await waSendText(from, Q_DIET);
      return;
    }
    if (pending === "diet") {
      if (answer) await saveDietaryField(user.id, "preferences", answer);
      await setPendingSetup(user.id, null);
      await waSendText(
        from,
        "✅ All set! I'll personalise every response to your profile.\n\nSend me a food photo, restaurant question, or grocery barcode to get started.\n\n" + WA_COMMANDS,
      );
      return;
    }
  }

  const thread = await getOrCreateChannelConversation(user.id, "whatsapp");
  const out = await handleChatTurn({
    userId: user.id,
    conversationId: thread.id,
    text: text || undefined,
    imageBase64,
    mimeType,
    barcode,
    channel: "whatsapp",
  });

  await waSendText(from, out.reply);

  if (out.shareCardUrl) {
    const cfg = getConfig();
    const cardUrl = out.shareCardUrl.startsWith("http")
      ? out.shareCardUrl
      : `${cfg.PUBLIC_BASE_URL}${out.shareCardUrl}`;
    const scoreLabel = out.structured.glucoseGalScore != null ? `Score: ${out.structured.glucoseGalScore}/10` : "";
    const verdictLabel = out.structured.verdict ? ` | ${out.structured.verdict.toUpperCase()}` : "";
    await waSendImage(from, cardUrl, `${scoreLabel}${verdictLabel}`.trim() || "Your Gluci result");
  }
}
