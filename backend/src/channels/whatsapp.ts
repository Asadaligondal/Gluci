import { getConfig } from "../config.js";
import { getOrCreateWhatsAppUser } from "../services/users.js";
import { handleChatTurn } from "../services/orchestrator.js";
import { getOrCreateChannelConversation } from "../services/conversationService.js";
import { tryLinkWhatsAppByCode } from "../services/linking.js";

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

  const user = await getOrCreateWhatsAppUser(from);

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

  if (!text && !imageBase64) {
    await waSendText(from, "Send me a food photo, restaurant question, or grocery item (or a barcode number).");
    return;
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
}
