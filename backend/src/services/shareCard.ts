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
  contentType: string,
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

const CURVE_MAX_Y = 80;
const CURVE_THRESHOLD = 30;

function gaussY(t: number, peakMin: number, peakVal: number, riseWidth: number, fallWidth: number): number {
  if (peakVal <= 0) return 0;
  const sigma = t <= peakMin ? riseWidth : fallWidth;
  return peakVal * Math.exp(-((t - peakMin) * (t - peakMin)) / (2 * sigma * sigma));
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapText(text: string, maxChars: number): string[] {
  if (!text) return [];
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (test.length > maxChars && line) { lines.push(line); line = word; }
    else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

type Pt = { x: number; y: number };

function catmullRomPath(pts: Pt[], closeAtY?: number): string {
  if (pts.length < 2) return "";
  let d = closeAtY != null
    ? `M ${pts[0].x.toFixed(1)} ${closeAtY.toFixed(1)} L ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`
    : `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = i > 0 ? pts[i - 1] : pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = i < pts.length - 2 ? pts[i + 2] : pts[i + 1];
    d += ` C ${(p1.x + (p2.x - p0.x) / 6).toFixed(1)} ${(p1.y + (p2.y - p0.y) / 6).toFixed(1)}`
       + ` ${(p2.x - (p3.x - p1.x) / 6).toFixed(1)} ${(p2.y - (p3.y - p1.y) / 6).toFixed(1)}`
       + ` ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  if (closeAtY != null) d += ` L ${pts[pts.length - 1].x.toFixed(1)} ${closeAtY.toFixed(1)} Z`;
  return d;
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
    <text x="8" y="22" font-family="Arial,sans-serif" font-size="22" fill="#555555">+60</text>
    <text x="8" y="${Math.max(26, threshold30Y - 14)}" font-family="Arial,sans-serif" font-size="22" fill="#E91E8C">spike</text>
    <text x="8" y="${plotH - 8}" font-family="Arial,sans-serif" font-size="22" fill="#555555">baseline</text>
    <text x="8" y="${xLblY}" font-family="Arial,sans-serif" font-size="22" fill="#555555">eating time</text>
    <text x="${width - 8}" y="${xLblY}" font-family="Arial,sans-serif" font-size="22" fill="#555555" text-anchor="end">&#x2192; +3 hours</text>`;
  let fillPath = "";
  if (points.length >= 2) {
    const pts = points.map((p) => ({
      x: (p.minute / 180) * width,
      y: plotH - Math.min(Math.max(p.mg_dl / CURVE_MAX_Y, 0), 1.25) * plotH,
    }));
    fillPath = `M ${pts[0].x} ${plotH} L ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1]; const curr = pts[i];
      const cpx = (prev.x + curr.x) / 2;
      fillPath += ` C ${cpx} ${prev.y} ${cpx} ${curr.y} ${curr.x} ${curr.y}`;
    }
    fillPath += ` L ${pts[pts.length - 1].x} ${plotH} Z`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${totalHeight}">
    ${zonePink}${zoneGreen}${threshLine}
    ${fillPath ? `<path d="${fillPath}" fill="${color}" fill-opacity="0.92"/>` : ""}
    ${yLabels}
  </svg>`;
}

async function loadFoodImageDataUri(
  heroImagePath?: string,
  heroImageUrl?: string,
): Promise<string | null> {
  let raw: Buffer | null = null;
  if (heroImagePath && fs.existsSync(heroImagePath)) {
    raw = await sharp(heroImagePath).rotate().resize(150, 150, { fit: "cover" }).jpeg({ quality: 85 }).toBuffer();
  } else if (heroImageUrl?.startsWith("http")) {
    try {
      const res = await fetch(heroImageUrl);
      if (res.ok) raw = Buffer.from(await res.arrayBuffer());
      if (raw) raw = await sharp(raw).resize(150, 150, { fit: "cover" }).jpeg({ quality: 85 }).toBuffer();
    } catch { /* skip */ }
  }
  return raw ? `data:image/jpeg;base64,${raw.toString("base64")}` : null;
}

/**
 * Renders a 900×(1020|860)px PNG matching the new 4-section card design:
 * bluish outer bg, Meal / Score+Verdict / Glucose Curve / Tip sections.
 */
function buildAndroidCardSVG(params: {
  W: number;
  foodName: string;
  score: number;
  verdict: string;
  tip: string;
  glucoseCurve: CurvePoint[];
  imageDataUri: string | null;
  subtitle: string;
}): string {
  const { W, foodName, score, verdict, tip, glucoseCurve, imageDataUri, subtitle } = params;

  const OUTER = 24, GAP = 10, RX = 24, iPAD = 30;
  const inner_w = W - 2 * OUTER;   // 852
  const hasTip = tip.trim().length > 0;

  // Section Y positions
  const meal_y = OUTER;              const meal_h = 210;
  const sv_y = meal_y + meal_h + GAP;  const sv_h = 260;
  const curve_y = sv_y + sv_h + GAP;   const curve_h = 410;
  const tip_y = curve_y + curve_h + GAP;
  const tip_h = 148;
  const H = hasTip ? tip_y + tip_h + OUTER + 36 : curve_y + curve_h + OUTER + 34;

  // ── Meal section ─────────────────────────────────────────────────────────
  const hasImg = imageDataUri !== null;
  const imgX = OUTER + iPAD, imgY = meal_y + OUTER, imgSize = 110;
  const textX = hasImg ? imgX + imgSize + 18 : OUTER + iPAD;

  const rawName = foodName.trim() || "Your meal";
  const withIdx = rawName.toLowerCase().indexOf(" with ");
  const mainName = escapeXml((withIdx > 0 ? rawName.slice(0, withIdx) : rawName).slice(0, 22));
  const subName = withIdx > 0 ? escapeXml(`with ${rawName.slice(withIdx + 6)}`.slice(0, 32)) : null;
  const nameY = meal_y + (subName ? 150 : 168);

  // ── Score + Verdict section ───────────────────────────────────────────────
  const halfW = Math.floor(inner_w / 2);
  const vInnerX = OUTER + halfW + 10;
  const vInnerY = sv_y + 16;
  const vInnerW = inner_w - halfW - 20;
  const vInnerH = sv_h - 32;
  const verdictLines = wrapText(verdict.trim() || "—", 16).slice(0, 3);

  // ── Curve section ─────────────────────────────────────────────────────────
  const cLeft = OUTER + 44, cRight = W - OUTER;       // 68, 876
  const cTop = curve_y + 60, cBottom = curve_y + 335; // chart pixel boundaries
  const cW = cRight - cLeft;
  const cBottomPad = 10, cTopPad = 30;
  const cDrawH = (cBottom - cTop) - cBottomPad - cTopPad;
  const axisY = cBottom - cBottomPad;
  const midX = cLeft + cW / 2;

  const curvePts: Pt[] = [];
  let peakX = cLeft + cW * 0.5, peakY = cTop + cTopPad + cDrawH * 0.1;
  let peakMin = 60;
  let xMax = 120;
  let scaleCeiling = 100;

  if (glucoseCurve.length >= 2) {
    const sorted = [...glucoseCurve].sort((a, b) => a.minute - b.minute);
    const actualMax = Math.max(...sorted.map((p) => p.mg_dl));
    // Match Android: (peak*1.5).coerceIn(45, max(100, peak*1.15))
    scaleCeiling = Math.min(Math.max(actualMax * 1.5, 45), Math.max(100, actualMax * 1.15));
    // Match Android dynamic x-axis: trim to where curve returns near baseline
    const threshold = Math.max(actualMax * 0.1, 5);
    const lastMin = sorted.filter((p) => p.mg_dl >= threshold).slice(-1)[0]?.minute ?? 120;
    xMax = Math.min(180, Math.max(90, Math.ceil((lastMin + 29) / 30) * 30));
    for (const pt of sorted.filter((p) => p.minute <= xMax)) {
      curvePts.push({
        x: cLeft + (pt.minute / xMax) * cW,
        y: axisY - (pt.mg_dl / scaleCeiling) * cDrawH,
      });
    }
    const peakRaw = glucoseCurve.reduce((b, p) => (p.mg_dl > b.mg_dl ? p : b), glucoseCurve[0]);
    peakMin = peakRaw.minute;
    peakX = cLeft + (peakRaw.minute / xMax) * cW;
    peakY = axisY - (peakRaw.mg_dl / scaleCeiling) * cDrawH;
  }

  // Green "normal" dashed reference line at 20 mg/dL + dynamic Y-axis labels (matches Android)
  const refY = axisY - (20 / scaleCeiling) * cDrawH;
  const labelStep = Math.max(Math.floor((scaleCeiling / 2) / 5) * 5, 5);
  const yLabelVals = [0, labelStep, labelStep * 2].filter((v) => v <= scaleCeiling);
  const yLabelsSvg = yLabelVals
    .map((mgDl) => {
      const yPos = axisY - (mgDl / scaleCeiling) * cDrawH;
      const textY = Math.max(yPos + 6, cTop + 16);
      return `<text x="${cLeft + 4}" y="${textY.toFixed(1)}" font-family="Arial,sans-serif" font-size="20" fill="#888888">${mgDl}</text>`;
    })
    .join("\n  ");

  const fillD = catmullRomPath(curvePts, axisY);
  const strokeD = catmullRomPath(curvePts);
  const xL1 = cBottom + 28, xL2 = cBottom + 50;

  // ── Tip section ───────────────────────────────────────────────────────────
  const tipLines = wrapText(tip.trim(), 52).slice(0, 2);

  // ── SVG ───────────────────────────────────────────────────────────────────
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}">
  <defs>
    <clipPath id="chartClip"><rect x="${cLeft}" y="${cTop}" width="${cW}" height="${cBottom - cTop}"/></clipPath>
    ${hasImg ? `<clipPath id="imgClip"><rect x="${imgX}" y="${imgY}" width="${imgSize}" height="${imgSize}" rx="16"/></clipPath>` : ""}
  </defs>

  <!-- Outer background -->
  <rect width="${W}" height="${H}" fill="#EDF0FC" rx="42"/>

  <!-- ─ Meal ─ -->
  <rect x="${OUTER}" y="${meal_y}" width="${inner_w}" height="${meal_h}" rx="${RX}" fill="white"/>
  ${hasImg ? `<image href="${imageDataUri}" x="${imgX}" y="${imgY}" width="${imgSize}" height="${imgSize}" clip-path="url(#imgClip)" preserveAspectRatio="xMidYMid slice"/>` : ""}
  <text x="${textX}" y="${meal_y + 76}" font-family="Arial,sans-serif" font-size="25" fill="#999999">Meal</text>
  <text x="${textX}" y="${nameY}" font-family="Arial,sans-serif" font-weight="bold" font-size="36" fill="#1A1A1A">${mainName}</text>
  ${subName ? `<text x="${textX}" y="${meal_y + 190}" font-family="Arial,sans-serif" font-size="28" fill="#888888">${subName}</text>` : ""}

  <!-- ─ Score + Verdict outer card ─ -->
  <rect x="${OUTER}" y="${sv_y}" width="${inner_w}" height="${sv_h}" rx="${RX}" fill="white"/>
  <text x="${OUTER + iPAD}" y="${sv_y + 52}" font-family="Arial,sans-serif" font-size="26" fill="#888888">Glucose Score</text>
  <text x="${OUTER + iPAD}" y="${sv_y + 200}" font-family="Arial,sans-serif">
    <tspan font-size="100" font-weight="bold" fill="#5C6BC0">${score.toFixed(1)}</tspan><tspan font-size="40" fill="#AAAAAA"> /10</tspan>
  </text>
  <!-- ─ Verdict inner card ─ -->
  <rect x="${vInnerX}" y="${vInnerY}" width="${vInnerW}" height="${vInnerH}" rx="16" fill="#F2F4FC"/>
  <text x="${vInnerX + iPAD}" y="${vInnerY + 46}" font-family="Arial,sans-serif" font-size="26" fill="#888888">Verdict</text>
  ${verdictLines.map((l, i) => `<text x="${vInnerX + iPAD}" y="${vInnerY + 102 + i * 52}" font-family="Arial,sans-serif" font-weight="bold" font-size="38" fill="#1A1A1A">${escapeXml(l)}</text>`).join("\n  ")}

  <!-- ─ Curve card ─ -->
  <rect x="${OUTER}" y="${curve_y}" width="${inner_w}" height="${curve_h}" rx="${RX}" fill="white"/>
  <text x="${OUTER + iPAD}" y="${curve_y + 42}" font-family="Arial,sans-serif" font-weight="600" font-size="30" fill="#333333">Your Glucose Curve</text>
  <text transform="rotate(-90,${OUTER + 16},${(cTop + cBottom) / 2})" x="${OUTER + 16}" y="${(cTop + cBottom) / 2}" font-family="Arial,sans-serif" font-size="24" fill="#888888" text-anchor="middle">Glucose</text>
  <line x1="${cLeft}" y1="${cTop}" x2="${cLeft}" y2="${axisY}" stroke="#BBBBBB" stroke-width="2"/>
  <line x1="${cLeft}" y1="${axisY}" x2="${cRight}" y2="${axisY}" stroke="#BBBBBB" stroke-width="2"/>
  ${fillD ? `<path d="${fillD}" fill="#5C6BC0" fill-opacity="0.10" clip-path="url(#chartClip)"/>` : ""}
  ${strokeD ? `<path d="${strokeD}" fill="none" stroke="#5C6BC0" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" clip-path="url(#chartClip)"/>` : ""}
  ${curvePts.length >= 2 ? `
  <line x1="${cLeft}" y1="${refY.toFixed(1)}" x2="${cRight}" y2="${refY.toFixed(1)}" stroke="#43A047" stroke-opacity="0.5" stroke-width="1.5" stroke-dasharray="9,6" clip-path="url(#chartClip)"/>
  <text x="${cRight - 4}" y="${(refY - 5).toFixed(1)}" font-family="Arial,sans-serif" font-size="18" fill="#43A047" fill-opacity="0.8" text-anchor="end">normal</text>
  ${yLabelsSvg}
  <line x1="${peakX.toFixed(1)}" y1="${(peakY + 8).toFixed(1)}" x2="${peakX.toFixed(1)}" y2="${axisY}" stroke="#5C6BC0" stroke-opacity="0.45" stroke-width="2" stroke-dasharray="10,6"/>
  <circle cx="${peakX.toFixed(1)}" cy="${peakY.toFixed(1)}" r="9" fill="white"/>
  <circle cx="${peakX.toFixed(1)}" cy="${peakY.toFixed(1)}" r="6" fill="#5C6BC0"/>` : ""}
  <text x="${cLeft}" y="${xL1}" font-family="Arial,sans-serif" font-size="24" font-weight="500" fill="#666666">0m</text>
  <text x="${cLeft}" y="${xL2}" font-family="Arial,sans-serif" font-size="22" fill="#999999">Meal</text>
  <text x="${peakX.toFixed(1)}" y="${xL1}" font-family="Arial,sans-serif" font-size="24" font-weight="500" fill="#666666" text-anchor="middle">+${peakMin}m</text>
  <text x="${peakX.toFixed(1)}" y="${xL2}" font-family="Arial,sans-serif" font-size="22" fill="#5C6BC0" font-weight="600" text-anchor="middle">Peak</text>
  <text x="${cRight}" y="${xL1}" font-family="Arial,sans-serif" font-size="24" font-weight="500" fill="#666666" text-anchor="end">+${xMax}m</text>
  <text x="${cRight}" y="${xL2}" font-family="Arial,sans-serif" font-size="22" fill="#999999" text-anchor="end">~Done</text>
  <text x="${cRight}" y="${(xL2 + 26)}" font-family="Arial,sans-serif" font-size="20" fill="#BBBBBB" text-anchor="end">Time →</text>

  ${hasTip ? `<!-- ─ Tip card ─ -->
  <rect x="${OUTER}" y="${tip_y}" width="${inner_w}" height="${tip_h}" rx="${RX}" fill="white"/>
  <circle cx="${OUTER + 22}" cy="${tip_y + 46}" r="9" fill="#5C6BC0"/>
  <text x="${OUTER + 46}" y="${tip_y + 54}" font-family="Arial,sans-serif" font-weight="bold" font-size="28" fill="#1A1A1A">Want a flatter curve?</text>
  ${tipLines.map((l, i) => `<text x="${OUTER + 46}" y="${tip_y + 92 + i * 32}" font-family="Arial,sans-serif" font-size="24" fill="#666666">${escapeXml(l)}</text>`).join("\n  ")}` : ""}

  <!-- Watermark -->
  <text x="${W - OUTER}" y="${H - 12}" font-family="Arial,sans-serif" font-weight="bold" font-size="28" fill="#5C6BC0" fill-opacity="0.45" text-anchor="end">gluci</text>
</svg>`;
}

/** Renders a 900px-wide PNG matching the new 4-section card design. */
export async function renderShareCard(params: {
  score: number;
  verdict: string;
  tip: string;
  subtitle?: string;
  heroImagePath?: string;
  heroImageUrl?: string;
  glucoseCurve?: CurvePoint[];
  foodName?: string;
}): Promise<{ relativeUrl: string; absolutePath: string }> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const filename = `card-${id}.png`;

  const imageDataUri = await loadFoodImageDataUri(params.heroImagePath, params.heroImageUrl);

  const svgStr = buildAndroidCardSVG({
    W: 900,
    foodName: (params.foodName ?? "Your meal").trim() || "Your meal",
    score: params.score,
    verdict: params.verdict,
    tip: params.tip,
    glucoseCurve: params.glucoseCurve ?? [],
    imageDataUri,
    subtitle: params.subtitle ?? "gluci.app",
  });

  const pngBuf = await sharp(Buffer.from(svgStr))
    .png({ compressionLevel: 4 })
    .toBuffer();

  const supabaseUrl = await uploadToSupabase("cards", filename, pngBuf, "image/png");
  if (supabaseUrl) {
    return { relativeUrl: supabaseUrl, absolutePath: "" };
  }

  const absolutePath = path.join(DATA_DIR, filename);
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(absolutePath, pngBuf);
  const base = getConfig().PUBLIC_BASE_URL.replace(/\/$/, "");
  return { relativeUrl: `${base}/static/cards/${filename}`, absolutePath };
}

export async function saveUploadBase64(base64: string, mime: string): Promise<string> {
  const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
  const name = `up-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const buf = Buffer.from(base64, "base64");

  const supabaseUrl = await uploadToSupabase("uploads", name, buf, mime);
  if (supabaseUrl) return supabaseUrl;

  const dir = path.join(process.cwd(), "data", "uploads");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), buf);
  return name;
}
