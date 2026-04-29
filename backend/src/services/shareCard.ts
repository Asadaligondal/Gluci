import fs from "fs";
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
  /** Absolute path to uploaded meal/product image (JPEG/PNG/WebP). */
  heroImagePath?: string;
  glucoseCurve?: { minute: number; mg_dl: number }[];
}): Promise<{ relativeUrl: string; absolutePath: string }> {
  await mkdir(DATA_DIR, { recursive: true });
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const filename = `card-${id}.png`;
  const absolutePath = path.join(DATA_DIR, filename);

  const w = 1080;
  const h = 1920;
  const scoreStr = `${params.score.toFixed(1)}/10`;

  const hasHero = Boolean(params.heroImagePath && fs.existsSync(params.heroImagePath!));

  let baseBuf: Buffer;

  if (hasHero) {
    const heroH = 820;
    const bottomH = h - heroH;
    const foH = Math.max(200, bottomH - 380);
    const bottomSvg = `
  <svg width="${w}" height="${bottomH}">
    <defs>
      <linearGradient id="bg2" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#1a1a2e"/>
        <stop offset="100%" stop-color="#16213e"/>
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#bg2)"/>
    <text x="540" y="100" font-family="sans-serif" font-size="48" fill="#e94560" text-anchor="middle" font-weight="bold">GlucoseGal</text>
    <text x="540" y="220" font-family="sans-serif" font-size="110" fill="#ffffff" text-anchor="middle" font-weight="bold">${escapeXml(scoreStr)}</text>
    <text x="540" y="320" font-family="sans-serif" font-size="42" fill="#a8dadc" text-anchor="middle">${escapeXml(params.verdict)}</text>
    <foreignObject x="70" y="360" width="940" height="${foH}">
      <div xmlns="http://www.w3.org/1999/xhtml" style="color:#eee;font-family:sans-serif;font-size:32px;line-height:1.35;">
        ${escapeHtml(params.insight)}
      </div>
    </foreignObject>
    <text x="540" y="${bottomH - 36}" font-family="sans-serif" font-size="26" fill="#888" text-anchor="middle">${escapeXml(params.subtitle ?? "gluci.app")}</text>
  </svg>`;

    const heroBuf = await sharp(params.heroImagePath!)
      .rotate()
      .resize(w, heroH, { fit: "cover", position: "center" })
      .png()
      .toBuffer();
    const bottomBuf = await sharp(Buffer.from(bottomSvg)).png().toBuffer();
    baseBuf = await sharp({
      create: { width: w, height: h, channels: 4, background: { r: 26, g: 26, b: 46, alpha: 1 } },
    })
      .composite([
        { input: heroBuf, top: 0, left: 0 },
        { input: bottomBuf, top: heroH, left: 0 },
      ])
      .png()
      .toBuffer();
  } else {
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
    baseBuf = await sharp(Buffer.from(svg)).png().toBuffer();
  }

  const overlayBuf = await buildShareOverlay(params, hasHero);
  await sharp(baseBuf).composite([{ input: overlayBuf, left: 0, top: 0 }]).png().toFile(absolutePath);

  const base = getConfig().PUBLIC_BASE_URL.replace(/\/$/, "");
  return { relativeUrl: `${base}/static/cards/${filename}`, absolutePath };
}

async function buildShareOverlay(
  params: {
    score: number;
    verdict: string;
    glucoseCurve?: { minute: number; mg_dl: number }[];
  },
  hasHero: boolean,
): Promise<Buffer> {
  const curve = params.glucoseCurve;
  const peak = curve?.length ? Math.max(...curve.map((p) => p.mg_dl)) : 0;
  const stroke = curveStrokeColor(peak);
  const vc = verdictBadgeColors(params.verdict);
  const badgeVerdict = verdictBadgeLabel(params.verdict);

  const parts: string[] = [];
  parts.push(`<svg width="1080" height="1920" xmlns="http://www.w3.org/2000/svg">`);
  parts.push(`<rect width="100%" height="100%" fill="none"/>`);

  parts.push(`<g>`);
  parts.push(
    `<rect x="668" y="28" rx="14" ry="14" width="364" height="72" fill="#0f172a" stroke="#334155" stroke-width="2"/>`,
  );
  parts.push(
    `<text x="850" y="78" font-family="sans-serif" font-size="40" fill="#f8fafc" text-anchor="middle" font-weight="bold">${escapeXml(`${params.score.toFixed(1)}/10`)}</text>`,
  );
  parts.push(`</g>`);

  parts.push(`<g>`);
  parts.push(
    `<rect x="668" y="112" rx="12" ry="12" width="364" height="56" fill="${vc.bg}" stroke="${vc.stroke}" stroke-width="2"/>`,
  );
  parts.push(
    `<text x="850" y="152" font-family="sans-serif" font-size="28" fill="${vc.fg}" text-anchor="middle" font-weight="bold">${escapeXml(badgeVerdict)}</text>`,
  );
  parts.push(`</g>`);

  if (curve?.length) {
    const cx = 90;
    const cy = hasHero ? 980 : 640;
    const cw = 900;
    const ch = 280;
    parts.push(chartSvg(curve, cx, cy, cw, ch, stroke));
  }

  parts.push(`</svg>`);
  const svg = parts.join("");
  return sharp(Buffer.from(svg)).png().toBuffer();
}

function curveStrokeColor(peak: number): string {
  if (peak < 20) return "#22c55e";
  if (peak < 40) return "#f59e0b";
  return "#ef4444";
}

function verdictBadgeColors(verdict: string): { bg: string; fg: string; stroke: string } {
  const v = verdict.trim().toLowerCase();
  if (v.includes("avoid")) return { bg: "#991b1b", fg: "#fef2f2", stroke: "#fca5a5" };
  if (v.includes("modify")) return { bg: "#b45309", fg: "#fffbeb", stroke: "#fcd34d" };
  if (v.includes("eat")) return { bg: "#15803d", fg: "#f0fdf4", stroke: "#86efac" };
  return { bg: "#475569", fg: "#f8fafc", stroke: "#94a3b8" };
}

function verdictBadgeLabel(verdict: string): string {
  const v = verdict.trim().toLowerCase();
  if (v.includes("avoid")) return "AVOID";
  if (v.includes("modify")) return "MODIFY";
  if (v.includes("eat")) return "EAT";
  return verdict.slice(0, 14).toUpperCase();
}

function chartSvg(
  curve: { minute: number; mg_dl: number }[],
  x: number,
  y: number,
  cw: number,
  ch: number,
  stroke: string,
): string {
  const padL = 48;
  const padB = 36;
  const padT = 24;
  const innerW = cw - padL - 16;
  const innerH = ch - padB - padT;
  const pts = curve.map((p) => {
    const px = x + padL + (p.minute / 120) * innerW;
    const capped = Math.min(100, Math.max(0, p.mg_dl));
    const py = y + padT + innerH - (capped / 100) * innerH;
    return `${px.toFixed(1)},${py.toFixed(1)}`;
  });
  const pathD = `M ${pts.join(" L ")}`;

  const gridLines = [0, 25, 50, 75, 100]
    .map((g) => {
      const gy = y + padT + innerH - (g / 100) * innerH;
      return `<line x1="${x + padL}" y1="${gy}" x2="${x + cw - 16}" y2="${gy}" stroke="#334155" stroke-width="1" opacity="0.6"/>`;
    })
    .join("");

  const labels = [0, 30, 60, 90, 120]
    .map((m, i, arr) => {
      const lx = x + padL + (m / 120) * innerW - (i === arr.length - 1 ? 18 : 0);
      return `<text x="${lx}" y="${y + ch - 8}" font-family="sans-serif" font-size="18" fill="#94a3b8">${m}m</text>`;
    })
    .join("");

  return `
  <g>
    <rect x="${x}" y="${y}" width="${cw}" height="${ch}" rx="16" ry="16" fill="#0f172a" fill-opacity="0.92" stroke="#334155"/>
    ${gridLines}
    <text x="${x + padL}" y="${y + padT}" font-family="sans-serif" font-size="22" fill="#cbd5e1">Glucose rise (mg/dL vs baseline)</text>
    <path d="${pathD}" fill="none" stroke="${stroke}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    ${labels}
  </g>`;
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
