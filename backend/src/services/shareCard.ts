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
      const prev = pts[i - 1];
      const curr = pts[i];
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
 * Renders a PNG that replicates the Android GlucoseCurveChart card:
 * cream background, food title + pink underline, Y-axis labels, pink/green
 * colour zones, Gaussian curve fill, peak dot + ticks, optional food thumbnail.
 * 1080 × 700 px — suits Telegram, WhatsApp, and social sharing.
 */
function buildAndroidCardSVG(params: {
  W: number;
  H: number;
  foodName: string;
  glucoseCurve: CurvePoint[];
  imageDataUri: string | null;
  subtitle: string;
}): string {
  const { W, H, foodName, glucoseCurve, imageDataUri, subtitle } = params;

  // ── Layout (all values in px; 1dp ≈ 3px at this size) ────────────────────
  const H_PAD = 42;        // 14dp
  const TOP_PAD = 30;      // 10dp
  const Y_AXIS_W = 156;    // 52dp
  const TITLE_H = 100;     // title row height
  const XAXIS_H = 58;      // x-axis row height
  const FOOTER_H = 36;     // watermark strip height

  const CHART_H = H - TITLE_H - XAXIS_H - FOOTER_H;
  const CHART_PAD = 24;    // 8dp inner padding top/bottom

  const chartLeft = H_PAD + Y_AXIS_W;
  const chartRight = W - H_PAD;
  const chartW = chartRight - chartLeft;
  const chartTop = TITLE_H + CHART_PAD;
  const chartBottom = TITLE_H + CHART_H - CHART_PAD;
  const chartInnerH = chartBottom - chartTop;

  const threshY = chartTop + chartInnerH * (1 - CURVE_THRESHOLD / CURVE_MAX_Y);

  // ── Gaussian curve points ─────────────────────────────────────────────────
  type Pt = { x: number; y: number };
  const curvePts: Pt[] = [];
  let scaleCeiling = CURVE_MAX_Y;
  let peakX = chartLeft + chartW * 0.5;
  let peakY = chartTop + chartInnerH * 0.2;

  if (glucoseCurve.length >= 2) {
    const peakRaw = glucoseCurve.reduce((b, p) => (p.mg_dl > b.mg_dl ? p : b), glucoseCurve[0]);
    const peakMin = peakRaw.minute;
    const peakVal = peakRaw.mg_dl;
    const actualMax = Math.max(...glucoseCurve.map((p) => p.mg_dl));
    scaleCeiling = Math.max(actualMax * 1.1, CURVE_MAX_Y);
    const riseW = Math.max(peakMin / 2.5, 12);
    const fallW = Math.max((180 - peakMin) / 2.5, 12);

    for (let i = 0; i <= 80; i++) {
      const t = (i / 80) * 180;
      const gY = gaussY(t, peakMin, peakVal, riseW, fallW);
      curvePts.push({
        x: chartLeft + (t / 180) * chartW,
        y: chartBottom - Math.min((gY / scaleCeiling) * chartInnerH * 0.85, chartInnerH * 0.88),
      });
    }
    peakX = chartLeft + (peakMin / 180) * chartW;
    peakY = chartBottom - Math.min((peakVal / scaleCeiling) * chartInnerH * 0.85, chartInnerH * 0.88);
  }

  // ── Build curve path with midpoint cubic bezier ───────────────────────────
  function buildPath(pts: Pt[], yShift: number): string {
    if (pts.length < 2) return "";
    let d = `M ${pts[0].x.toFixed(1)} ${chartBottom} L ${pts[0].x.toFixed(1)} ${(pts[0].y + yShift).toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1];
      const curr = pts[i];
      const cpx = (prev.x + curr.x) / 2;
      d += ` C ${cpx.toFixed(1)} ${(prev.y + yShift).toFixed(1)} ${cpx.toFixed(1)} ${(curr.y + yShift).toFixed(1)} ${curr.x.toFixed(1)} ${(curr.y + yShift).toFixed(1)}`;
    }
    d += ` L ${pts[pts.length - 1].x.toFixed(1)} ${chartBottom} Z`;
    return d;
  }

  const mainPath = buildPath(curvePts, 0);
  const texA = buildPath(curvePts, -18);  // -6dp texture
  const texB = buildPath(curvePts, -9);   // -3dp texture

  // ── Peak tick marks ───────────────────────────────────────────────────────
  const tickLen = 36;
  const peakTicks = curvePts.length >= 2
    ? [-150, -120, -90, -60, -30].map((deg) => {
        const rad = (deg * Math.PI) / 180;
        return `<line x1="${peakX.toFixed(1)}" y1="${peakY.toFixed(1)}" x2="${(peakX + Math.cos(rad) * tickLen).toFixed(1)}" y2="${(peakY + Math.sin(rad) * tickLen).toFixed(1)}" stroke="#333333" stroke-width="4.5" stroke-linecap="round"/>`;
      }).join("\n  ")
    : "";

  // ── Food image thumbnail + radiating ticks ────────────────────────────────
  const imgCx = chartRight - 93;   // 31dp from right
  const imgCy = chartTop + 93;     // 31dp from top
  const imgSize = 150;             // 50dp
  const imgX = imgCx - imgSize / 2;
  const imgY = imgCy - imgSize / 2;

  const radTicks = imageDataUri
    ? [0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
        const rad = (deg * Math.PI) / 180;
        const innerR = 87; const outerR = 105;
        return `<line x1="${(imgCx + Math.cos(rad) * innerR).toFixed(1)}" y1="${(imgCy + Math.sin(rad) * innerR).toFixed(1)}" x2="${(imgCx + Math.cos(rad) * outerR).toFixed(1)}" y2="${(imgCy + Math.sin(rad) * outerR).toFixed(1)}" stroke="#333333" stroke-opacity="0.55" stroke-width="4.5" stroke-linecap="round"/>`;
      }).join("\n  ")
    : "";

  // ── Y-axis minor ticks at 20, 40, 60 mg/dL ───────────────────────────────
  const yTicks = [20, 40, 60].map((v) => {
    const ty = chartBottom - (v / scaleCeiling) * chartInnerH * 0.85;
    return `<line x1="${chartLeft}" y1="${ty.toFixed(1)}" x2="${chartLeft + 15}" y2="${ty.toFixed(1)}" stroke="#888888" stroke-width="3"/>`;
  }).join("\n  ");

  // ── Asterisk decoration (6-spoke, next to title) ──────────────────────────
  const asterCx = H_PAD + 280;
  const asterCy = TOP_PAD + 38;
  const asterR = 14;
  const asterisk = [0, 60, 120, 180, 240, 300].map((deg) => {
    const rad = (deg * Math.PI) / 180;
    return `<line x1="${asterCx}" y1="${asterCy}" x2="${(asterCx + Math.cos(rad) * asterR).toFixed(1)}" y2="${(asterCy + Math.sin(rad) * asterR).toFixed(1)}" stroke="#888888" stroke-width="3.6" stroke-linecap="round"/>`;
  }).join("\n  ");

  // ── Threshold dotted overlay ──────────────────────────────────────────────
  const dotLen = 12; const dotGap = 15;
  const threshDots: string[] = [];
  for (let dx = chartLeft; dx < chartRight; dx += dotLen + dotGap) {
    const x2 = Math.min(dx + dotLen, chartRight);
    threshDots.push(`<line x1="${dx.toFixed(1)}" y1="${threshY.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${threshY.toFixed(1)}" stroke="black" stroke-opacity="0.25" stroke-width="9" stroke-linecap="round"/>`);
  }

  const title = escapeXml(foodName.slice(0, 34));
  const sub = escapeXml(subtitle);
  const xAxisY = TITLE_H + CHART_H + 40;

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}">
  <defs>
    <clipPath id="chartClip">
      <rect x="${chartLeft}" y="${chartTop}" width="${chartW}" height="${chartInnerH}"/>
    </clipPath>
    ${imageDataUri ? `<clipPath id="imgClip"><rect x="${imgX}" y="${imgY}" width="${imgSize}" height="${imgSize}" rx="24"/></clipPath>` : ""}
  </defs>

  <!-- Card background + border -->
  <rect width="${W}" height="${H}" fill="#FAF8F5" rx="42"/>
  <rect x="1.5" y="1.5" width="${W - 3}" height="${H - 3}" fill="none" stroke="#111111" stroke-width="3" rx="41"/>

  <!-- Title + pink underline -->
  <text x="${H_PAD}" y="${TOP_PAD + 55}" font-family="Georgia,'Times New Roman',serif" font-weight="bold" font-size="42" fill="#111111">${title}</text>
  <rect x="${H_PAD}" y="${TOP_PAD + 65}" width="144" height="6" fill="#E91E8C" rx="3"/>

  <!-- Asterisk decoration -->
  ${asterisk}

  <!-- Y-axis labels -->
  <text x="${H_PAD + Y_AXIS_W - 12}" y="${chartTop + 28}" font-family="Georgia,'Times New Roman',serif" font-size="34" fill="#555555" text-anchor="end">+60</text>
  <text x="${H_PAD + Y_AXIS_W - 12}" y="${(threshY + 4).toFixed(1)}" font-family="Georgia,'Times New Roman',serif" font-size="34" fill="#E91E8C" font-weight="bold" text-anchor="end">spike</text>
  <text x="${H_PAD + Y_AXIS_W - 12}" y="${(chartBottom - 6).toFixed(1)}" font-family="Georgia,'Times New Roman',serif" font-size="34" fill="#555555" text-anchor="end">baseline</text>

  <!-- Colour zones -->
  <rect x="${chartLeft}" y="${chartTop}" width="${chartW}" height="${(threshY - chartTop).toFixed(1)}" fill="#FFD6E0" clip-path="url(#chartClip)"/>
  <rect x="${chartLeft}" y="${threshY.toFixed(1)}" width="${chartW}" height="${(chartBottom - threshY).toFixed(1)}" fill="#D8EFDA" clip-path="url(#chartClip)"/>

  <!-- Threshold border + dots -->
  <line x1="${chartLeft}" y1="${threshY.toFixed(1)}" x2="${chartRight}" y2="${threshY.toFixed(1)}" stroke="#333333" stroke-opacity="0.55" stroke-width="4.5"/>
  ${threshDots.join("\n  ")}

  <!-- Y-axis minor ticks -->
  ${yTicks}

  <!-- Dashed baseline -->
  <line x1="${chartLeft}" y1="${(chartBottom - 1.5).toFixed(1)}" x2="${chartRight}" y2="${(chartBottom - 1.5).toFixed(1)}" stroke="#CCCCCC" stroke-width="4.5" stroke-dasharray="18,12"/>

  <!-- Gaussian curve — texture + main fill -->
  ${mainPath ? `
  <path d="${texA}" fill="#111111" fill-opacity="0.04" clip-path="url(#chartClip)"/>
  <path d="${texB}" fill="#111111" fill-opacity="0.09" clip-path="url(#chartClip)"/>
  <path d="${mainPath}" fill="#111111" fill-opacity="0.88" clip-path="url(#chartClip)"/>` : ""}

  <!-- Peak ticks + dot -->
  ${peakTicks}
  ${curvePts.length >= 2 ? `
  <circle cx="${peakX.toFixed(1)}" cy="${peakY.toFixed(1)}" r="15" fill="white"/>
  <circle cx="${peakX.toFixed(1)}" cy="${peakY.toFixed(1)}" r="9" fill="#333333"/>` : ""}

  <!-- Radiating ticks around food image -->
  ${radTicks}

  <!-- Food image thumbnail -->
  ${imageDataUri ? `<image href="${imageDataUri}" x="${imgX}" y="${imgY}" width="${imgSize}" height="${imgSize}" clip-path="url(#imgClip)" preserveAspectRatio="xMidYMid slice"/>` : ""}

  <!-- X-axis labels -->
  <text x="${chartLeft + 12}" y="${xAxisY}" font-family="Georgia,'Times New Roman',serif" font-size="33" fill="#555555">eating time</text>
  <text x="${chartRight}" y="${xAxisY}" font-family="Georgia,'Times New Roman',serif" font-size="33" fill="#555555" text-anchor="end">&#x2192; +3 hours</text>

  <!-- Watermark + invite subtitle -->
  <text x="${chartRight}" y="${H - 10}" font-family="Georgia,'Times New Roman',serif" font-weight="bold" font-size="34" fill="#E91E8C" fill-opacity="0.45" text-anchor="end">gluci</text>
  <text x="${H_PAD}" y="${H - 10}" font-family="Georgia,'Times New Roman',serif" font-size="26" fill="#AAAAAA">${sub}</text>
</svg>`;
}

/** Renders the Android-style GlucoseCurveChart card as a 1080×700 PNG. */
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

  const imageDataUri = await loadFoodImageDataUri(params.heroImagePath, params.heroImageUrl);

  const svgStr = buildAndroidCardSVG({
    W: 1080,
    H: 700,
    foodName: (params.foodName ?? "Your meal").trim() || "Your meal",
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
