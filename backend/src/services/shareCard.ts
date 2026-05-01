import fs from "fs";
import sharp from "sharp";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { getConfig } from "../config.js";

const DATA_DIR = path.join(process.cwd(), "data", "cards");

export type CurvePoint = { minute: number; mg_dl: number };

const CARD_W = 1080;
const CARD_H = 1350;
const PHOTO_H = 540;
const CHART_Y = 740;
const CHART_H = 500;

const CURVE_MAX_Y = 80;
const CURVE_THRESHOLD = 30;

/** Generate inner chart SVG markup (no outer <svg> wrapper) for embedding via <g transform>. */
function generateShareChartSVG(points: CurvePoint[], peak: number): string {
  const W = CARD_W;
  const H = CHART_H;
  const MAX_Y = CURVE_MAX_Y;
  const PADDING_LEFT = 80;
  const PADDING_RIGHT = 20;
  const PADDING_TOP = 30;
  const PADDING_BOTTOM = 60;

  const innerW = W - PADDING_LEFT - PADDING_RIGHT;
  const innerH = H - PADDING_TOP - PADDING_BOTTOM;
  const chartBottom = PADDING_TOP + innerH;

  const threshY = PADDING_TOP + innerH * (1 - CURVE_THRESHOLD / MAX_Y);

  const color = peak < 20 ? "#2E7D32" : peak < 50 ? "#E65100" : "#C62828";

  const pts = points.map((p) => ({
    x: PADDING_LEFT + (p.minute / 180) * innerW,
    y: PADDING_TOP + innerH - Math.min((p.mg_dl / MAX_Y) * innerH, innerH),
  }));

  let curvePath = "";
  if (pts.length >= 2) {
    curvePath = `M ${pts[0].x} ${chartBottom} L ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1];
      const curr = pts[i];
      const cp1x = prev.x + (curr.x - prev.x) * 0.5;
      const cp2x = curr.x - (curr.x - prev.x) * 0.5;
      curvePath += ` C ${cp1x} ${prev.y} ${cp2x} ${curr.y} ${curr.x} ${curr.y}`;
    }
    curvePath += ` L ${pts[pts.length - 1].x} ${chartBottom} Z`;
  }

  return `
    <rect x="${PADDING_LEFT}" y="${threshY}" width="${innerW}" height="${chartBottom - threshY}" fill="#C8E6C9"/>
    <rect x="${PADDING_LEFT}" y="${PADDING_TOP}" width="${innerW}" height="${threshY - PADDING_TOP}" fill="#FFCDD2"/>
    <line x1="${PADDING_LEFT}" y1="${threshY}" x2="${W - PADDING_RIGHT}" y2="${threshY}" stroke="#E57373" stroke-width="2" stroke-dasharray="16,8"/>
    <defs>
      <clipPath id="chartClip">
        <rect x="${PADDING_LEFT}" y="${PADDING_TOP}" width="${innerW}" height="${innerH}"/>
      </clipPath>
    </defs>
    ${curvePath ? `<path d="${curvePath}" fill="${color}" fill-opacity="0.92" clip-path="url(#chartClip)"/>` : ""}
    <text x="${PADDING_LEFT - 10}" y="${PADDING_TOP + 20}" font-family="Arial" font-size="28" fill="#555555" text-anchor="end">+60</text>
    <text x="${PADDING_LEFT - 10}" y="${threshY}" font-family="Arial" font-size="28" fill="#555555" text-anchor="end" dominant-baseline="middle">+30</text>
    <text x="${PADDING_LEFT - 10}" y="${chartBottom}" font-family="Arial" font-size="28" fill="#555555" text-anchor="end" dominant-baseline="hanging">base</text>
    <text x="${PADDING_LEFT}" y="${chartBottom + 44}" font-family="Arial" font-size="28" fill="#555555">eating time</text>
    <text x="${W - PADDING_RIGHT}" y="${chartBottom + 44}" font-family="Arial" font-size="28" fill="#555555" text-anchor="end">+ 3 hours</text>
  `;
}

/** Exported for any consumers that still need a standalone curve SVG (e.g. tests). */
export function generateCurveSVG(points: CurvePoint[], width: number, totalHeight: number): string {
  const plotH = Math.max(160, totalHeight - 32);
  const threshold30Y = plotH * (1 - CURVE_THRESHOLD / CURVE_MAX_Y);
  const peak = points.length ? Math.max(...points.map((p) => p.mg_dl)) : 0;
  const color = peak < 20 ? "#2E7D32" : peak < 50 ? "#E65100" : "#C62828";

  const xLblY = plotH + 22;

  const zonePink = `<rect x="0" y="0" width="${width}" height="${threshold30Y}" fill="#FFCDD2"/>`;
  const zoneGreen = `<rect x="0" y="${threshold30Y}" width="${width}" height="${plotH - threshold30Y}" fill="#C8E6C9"/>`;
  const threshLine = `<line x1="0" y1="${threshold30Y}" x2="${width}" y2="${threshold30Y}" stroke="#E57373" stroke-width="2" stroke-dasharray="12,6"/>`;

  const yLabels = `
    <text x="8" y="22" font-family="Arial, sans-serif" font-size="22" fill="#555555">+60</text>
    <text x="8" y="${Math.max(26, threshold30Y - 14)}" font-family="Arial, sans-serif" font-size="22" fill="#555555">spike +30</text>
    <text x="8" y="${plotH - 8}" font-family="Arial, sans-serif" font-size="22" fill="#555555">baseline</text>
    <text x="8" y="${xLblY}" font-family="Arial, sans-serif" font-size="22" fill="#555555">eating time</text>
    <text x="${width - 8}" y="${xLblY}" font-family="Arial, sans-serif" font-size="22" fill="#555555" text-anchor="end">+ 3 hours</text>`;

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

  const curveMarkup = fillPath
    ? `<path d="${fillPath}" fill="${color}" fill-opacity="0.92"/>`
    : "";

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

/** Instagram portrait 1080×1350 — food photo top half, full-width chart, large score. */
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
  await mkdir(DATA_DIR, { recursive: true });
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const filename = `card-${id}.png`;
  const absolutePath = path.join(DATA_DIR, filename);

  const W = CARD_W;
  const H = CARD_H;

  const composites: sharp.OverlayOptions[] = [];

  // ── Hero photo (top 540px) ────────────────────────────────────────────────
  let heroStripBuf: Buffer | null = null;

  if (params.heroImagePath && fs.existsSync(params.heroImagePath)) {
    heroStripBuf = await sharp(params.heroImagePath)
      .rotate()
      .resize(W, PHOTO_H, { fit: "cover", position: "center" })
      .png()
      .toBuffer();
  } else if (params.heroImageUrl) {
    if (params.heroImageUrl.startsWith("http")) {
      try {
        const imgRes = await fetch(params.heroImageUrl);
        if (imgRes.ok) {
          const rawBuf = Buffer.from(await imgRes.arrayBuffer());
          heroStripBuf = await sharp(rawBuf)
            .resize(W, PHOTO_H, { fit: "cover", position: "center" })
            .png()
            .toBuffer();
        }
      } catch {
        /* fall through to placeholder */
      }
    }
    if (!heroStripBuf) {
      const pName = escapeXml((params.foodName ?? "Your meal").slice(0, 40));
      const placeholderSvg = `<svg width="${W}" height="${PHOTO_H}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#E8F5E9"/>
            <stop offset="100%" stop-color="#F3E5F5"/>
          </linearGradient>
        </defs>
        <rect width="${W}" height="${PHOTO_H}" fill="url(#bg)"/>
        <text x="${W / 2}" y="${PHOTO_H / 2 + 16}" font-family="Arial, sans-serif" font-size="44" fill="#777777" text-anchor="middle">${pName}</text>
      </svg>`;
      heroStripBuf = await sharp(Buffer.from(placeholderSvg)).resize(W, PHOTO_H).png().toBuffer();
    }
  }

  if (heroStripBuf) {
    // Gradient: transparent at y=380, white at y=PHOTO_H
    const fadeSvg = `<svg width="${W}" height="${PHOTO_H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="fade" gradientUnits="userSpaceOnUse" x1="0" y1="380" x2="0" y2="${PHOTO_H}">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="0"/>
          <stop offset="100%" stop-color="#ffffff" stop-opacity="1"/>
        </linearGradient>
      </defs>
      <rect x="0" y="380" width="${W}" height="${PHOTO_H - 380}" fill="url(#fade)"/>
    </svg>`;
    const fadeBuf = await sharp(Buffer.from(fadeSvg)).png().toBuffer();

    const heroLayer = await sharp({
      create: { width: W, height: PHOTO_H, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 0 } },
    })
      .composite([
        { input: heroStripBuf, left: 0, top: 0 },
        { input: fadeBuf, left: 0, top: 0 },
      ])
      .png()
      .toBuffer();

    composites.push({ input: heroLayer, left: 0, top: 0 });
  }

  // ── Content overlay SVG ───────────────────────────────────────────────────
  const foodTitle = escapeXml((params.foodName ?? "Your meal").slice(0, 40));
  const scoreNum = escapeXml(params.score.toFixed(1));
  const scoreCol = scoreDisplayColor(params.score);
  const vp = verdictPillLight(params.verdict);
  const badgeVerdict = escapeXml(verdictBadgeLabel(params.verdict));

  const peak = params.glucoseCurve?.length
    ? Math.max(...params.glucoseCurve.map((p) => p.mg_dl))
    : 0;
  const chartSVG = generateShareChartSVG(params.glucoseCurve ?? [], peak);

  const { line1, line2 } = tipTwoLines(params.insight);
  const tipLine1 = escapeXml(line1);
  const tipLine2 = escapeXml(line2);
  const footer = escapeXml(params.subtitle ?? "gluci.app");

  const contentSVG = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">

  <!-- Gluci logo — top left -->
  <text x="60" y="590" font-family="Arial" font-weight="bold" font-size="52" fill="#E91E63">Gluci</text>

  <!-- Score — top right, large -->
  <text x="${W - 60}" y="572" font-family="Arial" font-weight="bold" font-size="110" fill="${scoreCol}" text-anchor="end">${scoreNum}</text>
  <text x="${W - 60}" y="636" font-family="Arial" font-size="44" fill="#888888" text-anchor="end">/10</text>

  <!-- Food name -->
  <text x="60" y="648" font-family="Arial" font-size="34" fill="#333333">${foodTitle}</text>

  <!-- Verdict badge -->
  <rect x="60" y="664" width="210" height="58" rx="29" fill="${vp.bg}"/>
  <text x="165" y="700" font-family="Arial" font-weight="bold" font-size="29" fill="${vp.fg}" text-anchor="middle">${badgeVerdict}</text>

  <!-- Full-width glucose chart -->
  <g transform="translate(0, ${CHART_Y})">
    ${chartSVG}
  </g>

  <!-- Tip text -->
  ${tipLine1 ? `<text x="60" y="1262" font-family="Arial" font-size="26" fill="#616161">${tipLine1}</text>` : ""}
  ${tipLine2 ? `<text x="60" y="1296" font-family="Arial" font-size="26" fill="#616161">${tipLine2}</text>` : ""}

  <!-- Footer bar -->
  <rect x="0" y="1318" width="${W}" height="32" fill="#F5F5F5"/>
  <text x="${W / 2}" y="1341" font-family="Arial" font-size="22" fill="#9E9E9E" text-anchor="middle">${footer}</text>
</svg>`;

  const contentBuf = await sharp(Buffer.from(contentSVG)).png().toBuffer();
  composites.push({ input: contentBuf, left: 0, top: 0 });

  // ── Composite all layers ──────────────────────────────────────────────────
  await sharp({
    create: { width: W, height: H, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
  })
    .composite(composites)
    .png({ compressionLevel: 4 })
    .toFile(absolutePath);

  const base = getConfig().PUBLIC_BASE_URL.replace(/\/$/, "");
  return { relativeUrl: `${base}/static/cards/${filename}`, absolutePath };
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
