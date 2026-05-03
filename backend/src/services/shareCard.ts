import fs from "fs";
import sharp from "sharp";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { getConfig } from "../config.js";

const DATA_DIR = path.join(process.cwd(), "data", "cards");

function getSupabase() {
  const cfg = getConfig();
  if (!cfg.SUPABASE_URL || !cfg.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createClient(cfg.SUPABASE_URL, cfg.SUPABASE_SERVICE_ROLE_KEY);
}

async function uploadToSupabase(
  bucket: string,
  filename: string,
  data: Buffer,
  contentType: string
): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { error } = await supabase.storage.from(bucket).upload(filename, data, {
    contentType,
    upsert: true,
  });
  if (error) { console.error("Supabase upload error:", error.message); return null; }
  const { data: pub } = supabase.storage.from(bucket).getPublicUrl(filename);
  return pub.publicUrl;
}

export type CurvePoint = { minute: number; mg_dl: number };

const CARD_W = 1080;
const CARD_H = 1350;
const CHART_Y = 260;
const CHART_SVG_H = 700;

const CURVE_MAX_Y = 80;
const CURVE_THRESHOLD = 30;

function generateShareChartSVG(
  points: CurvePoint[],
  peak: number,
  foodName: string,
  svgW = CARD_W,
  svgH = CHART_SVG_H,
): string {
  const SVG_W = svgW;
  const SVG_H = svgH;
  const PAD_LEFT = 100;
  const PAD_RIGHT = 30;
  const PAD_TOP = 80;
  const PAD_BOTTOM = 40;
  const MAX_Y = CURVE_MAX_Y;

  const innerW = SVG_W - PAD_LEFT - PAD_RIGHT;
  const innerH = SVG_H - PAD_TOP - PAD_BOTTOM;
  const chartBottom = PAD_TOP + innerH;
  const threshY = PAD_TOP + innerH * (1 - CURVE_THRESHOLD / MAX_Y);

  const pts = points.map((p) => ({
    x: PAD_LEFT + (p.minute / 180) * innerW,
    y: PAD_TOP + innerH - Math.min((p.mg_dl / MAX_Y) * innerH, innerH),
  }));

  let curvePath = "";
  let tickMarks = "";
  let peakDot = "";

  if (pts.length >= 2) {
    curvePath = `M ${pts[0].x.toFixed(1)} ${chartBottom} L ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1];
      const curr = pts[i];
      const cp1x = prev.x + (curr.x - prev.x) * 0.5;
      const cp2x = curr.x - (curr.x - prev.x) * 0.5;
      curvePath += ` C ${cp1x.toFixed(1)} ${prev.y.toFixed(1)} ${cp2x.toFixed(1)} ${curr.y.toFixed(1)} ${curr.x.toFixed(1)} ${curr.y.toFixed(1)}`;
    }
    curvePath += ` L ${pts[pts.length - 1].x.toFixed(1)} ${chartBottom} Z`;

    const peakIdx = points.reduce((best, p, i) => (p.mg_dl > points[best].mg_dl ? i : best), 0);
    const peakPt = pts[Math.min(peakIdx, pts.length - 1)];
    const tickLen = 20;
    const tickAngles = [-150, -120, -90, -60, -30];
    tickMarks = tickAngles
      .map((deg) => {
        const rad = (deg * Math.PI) / 180;
        const ex = (peakPt.x + Math.cos(rad) * tickLen).toFixed(1);
        const ey = (peakPt.y + Math.sin(rad) * tickLen).toFixed(1);
        return `<line x1="${peakPt.x.toFixed(1)}" y1="${peakPt.y.toFixed(1)}" x2="${ex}" y2="${ey}" stroke="#333333" stroke-width="2.5" stroke-linecap="round"/>`;
      })
      .join("\n    ");
    peakDot = `<circle cx="${peakPt.x.toFixed(1)}" cy="${peakPt.y.toFixed(1)}" r="9" fill="white"/>
    <circle cx="${peakPt.x.toFixed(1)}" cy="${peakPt.y.toFixed(1)}" r="5" fill="#333333"/>`;
  }

  const titleText = escapeXml(foodName.trim().slice(0, 40) || "Your meal");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SVG_W}" height="${SVG_H}">
  <rect width="${SVG_W}" height="${SVG_H}" fill="#FAF8F5" rx="16"/>
  <rect width="${SVG_W}" height="${SVG_H}" fill="none" stroke="#111111" stroke-width="2" rx="16"/>

  <!-- Food title with pink underline -->
  <text x="${PAD_LEFT}" y="46" font-family="Georgia, 'Times New Roman', serif" font-size="30" font-weight="bold" fill="#111111">${titleText}</text>
  <rect x="${PAD_LEFT}" y="54" width="56" height="3" fill="#E91E8C" rx="1.5"/>

  <defs>
    <clipPath id="chartClip">
      <rect x="${PAD_LEFT}" y="${PAD_TOP}" width="${innerW}" height="${innerH}"/>
    </clipPath>
  </defs>

  <!-- Zones -->
  <rect x="${PAD_LEFT}" y="${threshY.toFixed(1)}" width="${innerW}" height="${(chartBottom - threshY).toFixed(1)}" fill="#D8EFDA" clip-path="url(#chartClip)"/>
  <rect x="${PAD_LEFT}" y="${PAD_TOP}" width="${innerW}" height="${(threshY - PAD_TOP).toFixed(1)}" fill="#FFD6E0" clip-path="url(#chartClip)"/>

  <!-- Dashed baseline -->
  <line x1="${PAD_LEFT}" y1="${chartBottom}" x2="${PAD_LEFT + innerW}" y2="${chartBottom}" stroke="#CCCCCC" stroke-width="2" stroke-dasharray="10,6"/>

  <!-- Black filled curve -->
  ${curvePath ? `<path d="${curvePath}" fill="#111111" fill-opacity="0.88" clip-path="url(#chartClip)"/>` : ""}

  <!-- Spike tick marks -->
  ${tickMarks}

  <!-- Peak dot -->
  ${peakDot}

  <!-- Y-axis labels -->
  <text x="${PAD_LEFT - 12}" y="${PAD_TOP + 16}" font-family="Georgia, 'Times New Roman', serif" font-size="26" fill="#555555" text-anchor="end">+60</text>
  <text x="${PAD_LEFT - 12}" y="${(threshY + 9).toFixed(1)}" font-family="Georgia, 'Times New Roman', serif" font-size="26" fill="#E91E8C" font-weight="bold" text-anchor="end">spike</text>
  <text x="${PAD_LEFT - 12}" y="${chartBottom - 4}" font-family="Georgia, 'Times New Roman', serif" font-size="26" fill="#555555" text-anchor="end">baseline</text>

  <!-- X-axis labels -->
  <text x="${PAD_LEFT}" y="${chartBottom + 34}" font-family="Georgia, 'Times New Roman', serif" font-size="26" fill="#555555">eating time</text>
  <text x="${PAD_LEFT + innerW}" y="${chartBottom + 34}" font-family="Georgia, 'Times New Roman', serif" font-size="26" fill="#555555" text-anchor="end">&#x2192; +3 hours</text>
</svg>`;
}

/** Exported for any consumers that still need a standalone curve SVG (e.g. tests). */
export function generateCurveSVG(points: CurvePoint[], width: number, totalHeight: number): string {
  const plotH = Math.max(160, totalHeight - 32);
  const threshold30Y = plotH * (1 - CURVE_THRESHOLD / CURVE_MAX_Y);
  const peak = points.length ? Math.max(...points.map((p) => p.mg_dl)) : 0;
  const color = peak < 20 ? "#2E7D32" : peak < 50 ? "#E65100" : "#C62828";

  const xLblY = plotH + 22;

  const zonePink = `<rect x="0" y="0" width="${width}" height="${threshold30Y}" fill="#FFD6E0"/>`;
  const zoneGreen = `<rect x="0" y="${threshold30Y}" width="${width}" height="${plotH - threshold30Y}" fill="#D8EFDA"/>`;
  const threshLine = `<line x1="0" y1="${threshold30Y}" x2="${width}" y2="${threshold30Y}" stroke="#E91E8C" stroke-width="2" stroke-dasharray="12,6"/>`;

  const yLabels = `
    <text x="8" y="22" font-family="Arial, sans-serif" font-size="22" fill="#555555">+60</text>
    <text x="8" y="${Math.max(26, threshold30Y - 14)}" font-family="Arial, sans-serif" font-size="22" fill="#E91E8C">spike</text>
    <text x="8" y="${plotH - 8}" font-family="Arial, sans-serif" font-size="22" fill="#555555">baseline</text>
    <text x="8" y="${xLblY}" font-family="Arial, sans-serif" font-size="22" fill="#555555">eating time</text>
    <text x="${width - 8}" y="${xLblY}" font-family="Arial, sans-serif" font-size="22" fill="#555555" text-anchor="end">&#x2192; +3 hours</text>`;

  let fillPath = "";
  if (points.length >= 2) {
    const pts = points.map((p) => ({
      x: (p.minute / 180) * width,
      y: plotH - Math.min(Math.max(p.mg_dl / CURVE_MAX_Y, 0), 1.25) * plotH,
    }));
    fillPath = `M ${pts[0].x} ${plotH} L ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1];
      const curr = pts[i];
      const cp1x = prev.x + (curr.x - prev.x) * 0.5;
      const cp2x = curr.x - (curr.x - prev.x) * 0.5;
      fillPath += ` C ${cp1x} ${prev.y} ${cp2x} ${curr.y} ${curr.x} ${curr.y}`;
    }
    fillPath += ` L ${pts[pts.length - 1].x} ${plotH} Z`;
  }

  const curveMarkup = fillPath ? `<path d="${fillPath}" fill="${color}" fill-opacity="0.92"/>` : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${totalHeight}">
    ${zonePink}
    ${zoneGreen}
    ${threshLine}
    ${curveMarkup}
    ${yLabels}
  </svg>`;
}

function scoreDisplayColor(score: number): string {
  if (score >= 7.0) return "#2E7D32";
  if (score >= 4.5) return "#E65100";
  return "#C62828";
}

function verdictPillLight(verdict: string): { bg: string; fg: string } {
  const v = verdict.trim().toLowerCase();
  if (v.includes("avoid")) return { bg: "#FFEBEE", fg: "#C62828" };
  if (v.includes("modify")) return { bg: "#FFF3E0", fg: "#E65100" };
  if (v.includes("eat")) return { bg: "#E8F5E9", fg: "#2E7D32" };
  return { bg: "#F5F5F5", fg: "#424242" };
}

function verdictBadgeLabel(verdict: string): string {
  const v = verdict.trim().toLowerCase();
  if (v.includes("avoid")) return "AVOID";
  if (v.includes("modify")) return "MODIFY";
  if (v.includes("eat")) return "EAT";
  return verdict.slice(0, 14).toUpperCase();
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeHtml(s: string): string {
  return escapeXml(s).replace(/\n/g, "<br/>");
}

/** Wrap tip text to max 2 lines (~58 chars each). */
function tipTwoLines(insight: string): { line1: string; line2: string } {
  const words = insight.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > 58 && cur) {
      lines.push(cur);
      cur = w;
      if (lines.length >= 2) break;
    } else {
      cur = next;
    }
  }
  if (lines.length < 2 && cur) lines.push(cur);
  return { line1: lines[0] ?? "", line2: lines[1] ?? "" };
}

async function buildRoundedThumb(input: sharp.Sharp): Promise<Buffer> {
  const size = 140;
  const resized = await input.resize(size, size, { fit: "cover" }).png().toBuffer();
  const maskSvg = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${size}" height="${size}" rx="16" fill="white"/>
  </svg>`;
  const maskBuf = await sharp(Buffer.from(maskSvg)).png().toBuffer();
  return sharp(resized).composite([{ input: maskBuf, blend: "dest-in" }]).png().toBuffer();
}

/** Instagram portrait 1080×1350 — chart-as-hero layout. */
export async function renderShareCard(params: {
  score: number;
  verdict: string;
  insight: string;
  subtitle?: string;
  heroImagePath?: string;
  heroImageUrl?: string;
  glucoseCurve?: CurvePoint[];
  foodName?: string;
}): Promise<{ relativeUrl: string; absolutePath: string }> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const filename = `card-${id}.png`;
  const absolutePath = path.join(DATA_DIR, filename);

  const W = CARD_W;
  const H = CARD_H;

  const composites: sharp.OverlayOptions[] = [];

  // ── 1. Header SVG (0–260px): logo, score, food name, verdict ─────────────
  const foodTitle = escapeXml((params.foodName ?? "Your meal").slice(0, 36));
  const scoreNum = escapeXml(params.score.toFixed(1));
  const scoreCol = scoreDisplayColor(params.score);
  const vp = verdictPillLight(params.verdict);
  const badgeVerdict = escapeXml(verdictBadgeLabel(params.verdict));
  const underlineW = Math.min(Math.max((params.foodName ?? "").length * 22, 40), 700);

  const headerSVG = `<svg width="${W}" height="260" xmlns="http://www.w3.org/2000/svg">
  <rect width="${W}" height="260" fill="#FAF8F5"/>
  <text x="60" y="75" font-family="Georgia, 'Times New Roman', serif" font-weight="bold" font-size="52" fill="#E91E8C">Gluci</text>
  <text x="${W - 60}" y="110" font-family="Georgia, 'Times New Roman', serif" font-weight="bold" font-size="100" fill="${scoreCol}" text-anchor="end">${scoreNum}</text>
  <text x="${W - 60}" y="152" font-family="Georgia, 'Times New Roman', serif" font-size="40" fill="#888888" text-anchor="end">/10</text>
  <text x="60" y="178" font-family="Georgia, 'Times New Roman', serif" font-weight="bold" font-size="40" fill="#1A1A1A">${foodTitle}</text>
  <line x1="60" y1="188" x2="${60 + underlineW}" y2="188" stroke="#E91E8C" stroke-width="3" stroke-linecap="round"/>
  <rect x="60" y="205" width="200" height="52" rx="26" fill="${vp.bg}"/>
  <text x="160" y="238" font-family="Georgia, 'Times New Roman', serif" font-weight="bold" font-size="26" fill="${vp.fg}" text-anchor="middle">${badgeVerdict}</text>
</svg>`;
  const headerBuf = await sharp(Buffer.from(headerSVG)).png().toBuffer();
  composites.push({ input: headerBuf, left: 0, top: 0 });

  // ── 2. Chart SVG (260–960px, 700px tall) ─────────────────────────────────
  const peak = params.glucoseCurve?.length
    ? Math.max(...params.glucoseCurve.map((p) => p.mg_dl))
    : 0;
  const chartSvgStr = generateShareChartSVG(
    params.glucoseCurve ?? [],
    peak,
    params.foodName ?? "Your meal",
    W,
    CHART_SVG_H,
  );
  const chartBuf = await sharp(Buffer.from(chartSvgStr)).png().toBuffer();
  composites.push({ input: chartBuf, left: 0, top: CHART_Y });

  // ── 3. Food thumbnail inside chart, top-right ─────────────────────────────
  let rawImgBuf: Buffer | null = null;
  if (params.heroImagePath && fs.existsSync(params.heroImagePath)) {
    rawImgBuf = await sharp(params.heroImagePath).rotate().png().toBuffer();
  } else if (params.heroImageUrl?.startsWith("http")) {
    try {
      const imgRes = await fetch(params.heroImageUrl);
      if (imgRes.ok) rawImgBuf = Buffer.from(await imgRes.arrayBuffer());
    } catch { /* skip */ }
  }
  if (rawImgBuf) {
    try {
      const thumb = await buildRoundedThumb(sharp(rawImgBuf));
      composites.push({ input: thumb, left: W - 180, top: CHART_Y + 20 });
    } catch { /* skip on error */ }
  }

  // ── 4. Tip box SVG (990–1150px) ───────────────────────────────────────────
  const { line1, line2 } = tipTwoLines(params.insight);
  const tipLine1 = escapeXml(line1);
  const tipLine2 = escapeXml(line2);
  if (tipLine1) {
    const tipBoxH = tipLine2 ? 130 : 100;
    const tipSVG = `<svg width="${W}" height="160" xmlns="http://www.w3.org/2000/svg">
  <rect x="60" y="10" width="${W - 120}" height="${tipBoxH}" rx="16" fill="white" stroke="#CCCCCC" stroke-width="2"/>
  <text x="90" y="52" font-family="Georgia, 'Times New Roman', serif" font-size="26" fill="#444444">&#x2022; ${tipLine1}</text>
  ${tipLine2 ? `<text x="90" y="92" font-family="Georgia, 'Times New Roman', serif" font-size="26" fill="#444444">${tipLine2}</text>` : ""}
</svg>`;
    const tipBuf = await sharp(Buffer.from(tipSVG)).png().toBuffer();
    composites.push({ input: tipBuf, left: 0, top: 990 });
  }

  // ── 5. Footer (1180–1350px) ───────────────────────────────────────────────
  const footer = escapeXml(params.subtitle ?? "gluci.app");
  const footerSVG = `<svg width="${W}" height="170" xmlns="http://www.w3.org/2000/svg">
  <text x="${W / 2}" y="60" font-family="Georgia, 'Times New Roman', serif" font-size="28" fill="#9E9E9E" text-anchor="middle">${footer}</text>
</svg>`;
  const footerBuf = await sharp(Buffer.from(footerSVG)).png().toBuffer();
  composites.push({ input: footerBuf, left: 0, top: 1180 });

  // ── Composite all layers onto cream base ──────────────────────────────────
  const pngBuf = await sharp({
    create: { width: W, height: H, channels: 4, background: { r: 250, g: 248, b: 245, alpha: 1 } },
  })
    .composite(composites)
    .png({ compressionLevel: 4 })
    .toBuffer();

  // Try Supabase Storage first; fall back to local disk
  const supabaseUrl = await uploadToSupabase("cards", filename, pngBuf, "image/png");
  if (supabaseUrl) {
    return { relativeUrl: supabaseUrl, absolutePath: "" };
  }

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(absolutePath, pngBuf);
  const base = getConfig().PUBLIC_BASE_URL.replace(/\/$/, "");
  return { relativeUrl: `${base}/static/cards/${filename}`, absolutePath };
}

export async function saveUploadBase64(base64: string, mime: string): Promise<string> {
  const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
  const name = `up-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const buf = Buffer.from(base64, "base64");

  // Try Supabase Storage first; fall back to local disk
  const supabaseUrl = await uploadToSupabase("uploads", name, buf, mime);
  if (supabaseUrl) return supabaseUrl;

  const dir = path.join(process.cwd(), "data", "uploads");
  await mkdir(dir, { recursive: true });
  const full = path.join(dir, name);
  await writeFile(full, buf);
  return name;
}
