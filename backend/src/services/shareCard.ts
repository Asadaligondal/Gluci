import fs from "fs";
import sharp from "sharp";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { getConfig } from "../config.js";

const DATA_DIR = path.join(process.cwd(), "data", "cards");

export type CurvePoint = { minute: number; mg_dl: number };

/** Generates SVG markup for the Instagram-style pink/green glucose curve plot (standalone raster target). */
export function generateCurveSVG(points: CurvePoint[], width: number, height: number): string {
  if (!points.length) {
    return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#fafafa"/>
      <text x="${width / 2}" y="${height / 2}" font-family="sans-serif" font-size="22" fill="#bdbdbd" text-anchor="middle">No curve data</text>
    </svg>`;
  }

  const peak = Math.max(...points.map((p) => p.mg_dl), 1);
  const maxMg = Math.max(peak, 60);
  const curveColor = curveStrokeFromPeak(peak);

  const thresholdY = height - (30 / maxMg) * height;

  function xy(minute: number, mg: number): [number, number] {
    const x = (minute / 120) * width;
    const y = height - (mg / maxMg) * height;
    return [x, y];
  }

  const pts = points.map((p) => xy(p.minute, p.mg_dl));

  let curvePath = "";
  if (pts.length >= 2) {
    curvePath = `M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`;
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1];
      const curr = pts[i];
      const cp1x = prev[0] + (curr[0] - prev[0]) * 0.5;
      const cp1y = prev[1];
      const cp2x = curr[0] - (curr[0] - prev[0]) * 0.5;
      const cp2y = curr[1];
      curvePath += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${curr[0].toFixed(2)} ${curr[1].toFixed(2)}`;
    }
  }

  let areaPath = curvePath;
  if (pts.length >= 2) {
    const last = pts[pts.length - 1];
    const first = pts[0];
    areaPath += ` L ${last[0].toFixed(2)} ${height.toFixed(2)} L ${first[0].toFixed(2)} ${height.toFixed(2)} Z`;
  }

  const peakIdx = points.reduce((best, p, i, arr) => (p.mg_dl > arr[best].mg_dl ? i : best), 0);
  const pk = pts[peakIdx];

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="${thresholdY.toFixed(2)}" width="${width}" height="${(height - thresholdY).toFixed(2)}" fill="#E8F5E9"/>
  <rect x="0" y="0" width="${width}" height="${thresholdY.toFixed(2)}" fill="#FFEBEE"/>
  <line x1="0" y1="${thresholdY.toFixed(2)}" x2="${width}" y2="${thresholdY.toFixed(2)}"
        stroke="#BDBDBD" stroke-width="1" stroke-dasharray="4,4"/>
  ${pts.length >= 2 ? `<path d="${areaPath}" fill="${curveColor}" fill-opacity="0.25"/>` : ""}
  ${pts.length >= 2 ? `<path d="${curvePath}" fill="none" stroke="${curveColor}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>` : ""}
  ${pts.length >= 2 ? `<circle cx="${pk[0].toFixed(2)}" cy="${pk[1].toFixed(2)}" r="5" fill="${curveColor}"/>` : ""}
</svg>`;
}

function curveStrokeFromPeak(peak: number): string {
  if (peak < 30) return "#4CAF50";
  if (peak <= 60) return "#FF6F00";
  return "#1A1A1A";
}

export async function renderShareCard(params: {
  score: number;
  verdict: string;
  insight: string;
  subtitle?: string;
  heroImagePath?: string;
  glucoseCurve?: CurvePoint[];
  foodName?: string;
}): Promise<{ relativeUrl: string; absolutePath: string }> {
  await mkdir(DATA_DIR, { recursive: true });
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const filename = `card-${id}.png`;
  const absolutePath = path.join(DATA_DIR, filename);

  const W = 1080;
  const H = 1920;
  const scoreStr = `${params.score.toFixed(1)}/10`;
  const foodTitle = escapeXml((params.foodName ?? "Your meal").slice(0, 120));

  const hasHero = Boolean(params.heroImagePath && fs.existsSync(params.heroImagePath!));

  let bgBuf: Buffer;
  if (hasHero) {
    bgBuf = await sharp(params.heroImagePath!)
      .rotate()
      .resize(W, H, { fit: "cover", position: "center" })
      .blur(14)
      .modulate({ saturation: 0.88 })
      .ensureAlpha()
      .png()
      .toBuffer();
  } else {
    bgBuf = await sharp({
      create: { width: W, height: H, channels: 3, background: { r: 245, g: 248, b: 246 } },
    })
      .png()
      .toBuffer();
  }

  const cardW = Math.round(W * 0.82);
  const cardLeft = Math.floor((W - cardW) / 2);
  const cardTop = 160;
  const cardH = 1380;

  const vc = verdictBadgeColors(params.verdict);
  const badgeVerdict = verdictBadgeLabel(params.verdict);

  const curve = params.glucoseCurve ?? [];
  const plotW = cardW - 120;
  const plotH = 340;
  const curveSvgStr = generateCurveSVG(curve, plotW, plotH);
  const curveBuf = await sharp(Buffer.from(curveSvgStr)).png().toBuffer();

  const insightShort = escapeHtml(params.insight.slice(0, 520));

  const innerSvg = `
  <svg width="${cardW}" height="${cardH}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="cardShadow" x="-15%" y="-15%" width="130%" height="130%">
        <feDropShadow dx="0" dy="14" stdDeviation="18" flood-opacity="0.22"/>
      </filter>
    </defs>
    <rect x="0" y="0" width="${cardW}" height="${cardH}" rx="28" ry="28" fill="#ffffff" filter="url(#cardShadow)"/>
    <text x="${cardW / 2}" y="76" font-family="sans-serif" font-size="44" fill="#2e7d32" text-anchor="middle" font-weight="bold">Gluci</text>
    <text x="${cardW / 2}" y="138" font-family="sans-serif" font-size="34" fill="#111111" text-anchor="middle">${foodTitle}</text>
    <text x="${cardW / 2}" y="248" font-family="sans-serif" font-size="104" fill="#111111" text-anchor="middle" font-weight="bold">${escapeXml(scoreStr)}</text>
    <rect x="${(cardW - 300) / 2}" y="278" rx="30" ry="30" width="300" height="60" fill="${vc.bg}" stroke="${vc.stroke}" stroke-width="2"/>
    <text x="${cardW / 2}" y="322" font-family="sans-serif" font-size="30" fill="${vc.fg}" text-anchor="middle" font-weight="bold">${escapeXml(badgeVerdict)}</text>
    <rect x="60" y="380" width="${plotW}" height="${plotH}" rx="18" ry="18" fill="#fafafa"/>
    <foreignObject x="52" y="780" width="${cardW - 104}" height="520">
      <div xmlns="http://www.w3.org/1999/xhtml" style="color:#333;font-family:sans-serif;font-size:30px;line-height:1.35;">
        ${insightShort}
      </div>
    </foreignObject>
    <text x="${cardW / 2}" y="${cardH - 36}" font-family="sans-serif" font-size="26" fill="#9e9e9e" text-anchor="middle">${escapeXml(params.subtitle ?? "gluci.app")}</text>
  </svg>`;

  let cardBuf = await sharp(Buffer.from(innerSvg)).png().toBuffer();
  cardBuf = await sharp(cardBuf)
    .composite([{ input: curveBuf, left: 60, top: 380 }])
    .png()
    .toBuffer();

  await sharp(bgBuf)
    .composite([{ input: cardBuf, left: cardLeft, top: cardTop }])
    .png()
    .toFile(absolutePath);

  const base = getConfig().PUBLIC_BASE_URL.replace(/\/$/, "");
  return { relativeUrl: `${base}/static/cards/${filename}`, absolutePath };
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
