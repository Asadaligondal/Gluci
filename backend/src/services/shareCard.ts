import sharp from "sharp";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { getConfig } from "../config.js";

const DATA_DIR = path.join(process.cwd(), "data", "cards");

export async function renderShareCard(params: {
  score: number;
  verdict: string;
  insight: string;
  subtitle?: string;
}): Promise<{ relativeUrl: string; absolutePath: string }> {
  await mkdir(DATA_DIR, { recursive: true });
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const filename = `card-${id}.png`;
  const absolutePath = path.join(DATA_DIR, filename);

  const w = 1080;
  const h = 1920;
  const scoreStr = `${params.score.toFixed(1)}/10`;

  const svg = `
  <svg width="${w}" height="${h}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#1a1a2e"/>
        <stop offset="100%" stop-color="#16213e"/>
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#bg)"/>
    <text x="540" y="220" font-family="sans-serif" font-size="56" fill="#e94560" text-anchor="middle" font-weight="bold">GlucoseGal</text>
    <text x="540" y="320" font-family="sans-serif" font-size="42" fill="#eaeaea" text-anchor="middle">Gluci</text>
    <text x="540" y="520" font-family="sans-serif" font-size="120" fill="#ffffff" text-anchor="middle" font-weight="bold">${escapeXml(scoreStr)}</text>
    <text x="540" y="620" font-family="sans-serif" font-size="48" fill="#a8dadc" text-anchor="middle">${escapeXml(params.verdict)}</text>
    <foreignObject x="120" y="720" width="840" height="900">
      <div xmlns="http://www.w3.org/1999/xhtml" style="color:#eee;font-family:sans-serif;font-size:38px;line-height:1.35;">
        ${escapeHtml(params.insight)}
      </div>
    </foreignObject>
    <text x="540" y="1820" font-family="sans-serif" font-size="32" fill="#888" text-anchor="middle">${escapeXml(params.subtitle ?? "gluci.app — Before you eat, ask Gluci.")}</text>
  </svg>`;

  await sharp(Buffer.from(svg)).png().toFile(absolutePath);
  const base = getConfig().PUBLIC_BASE_URL.replace(/\/$/, "");
  return { relativeUrl: `${base}/static/cards/${filename}`, absolutePath };
}

function escapeXml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeHtml(s: string) {
  const lines = s.slice(0, 800).split(/\n+/);
  return lines.map((l) => `<p>${escapeXml(l)}</p>`).join("");
}

export async function saveUploadBase64(base64: string, mime: string): Promise<string> {
  const dir = path.join(process.cwd(), "data", "uploads");
  await mkdir(dir, { recursive: true });
  const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
  const name = `up-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const full = path.join(dir, name);
  await writeFile(full, Buffer.from(base64, "base64"));
  return name;
}
