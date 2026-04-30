import fs from "fs";
import sharp from "sharp";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { getConfig } from "../config.js";

const DATA_DIR = path.join(process.cwd(), "data", "cards");

export type CurvePoint = { minute: number; mg_dl: number };

const CARD_W = 1080;
const CARD_H = 1350;

const CURVE_MAX_Y = 80;
const CURVE_THRESHOLD = 30;

function curveStrokePath(points: CurvePoint[], width: number, plotH: number): string {
  const pts = points.map((p) => ({
    x: (p.minute / 120) * width,
    y: plotH - Math.min(Math.max(p.mg_dl / CURVE_MAX_Y, 0), 1.25) * plotH,
  }));
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const curr = pts[i];
    const cp1x = prev.x + (curr.x - prev.x) * 0.5;
    const cp2x = curr.x - (curr.x - prev.x) * 0.5;
    d += ` C ${cp1x} ${prev.y} ${cp2x} ${curr.y} ${curr.x} ${curr.y}`;
  }
  return d;
}

/** Inner glucose curve SVG for share card (920×280 padded area). */
export function generateCurveSVG(points: CurvePoint[], width: number, totalHeight: number): string {
  const plotH = Math.max(160, totalHeight - 32);
  const threshold30Y = plotH * (1 - CURVE_THRESHOLD / CURVE_MAX_Y);
  const peak = points.length ? Math.max(...points.map((p) => p.mg_dl)) : 0;
  const color = peak < 20 ? "#2E7D32" : peak < 50 ? "#E65100" : "#C62828";

  const spikeLblY = Math.max(26, threshold30Y - 14);
  const baselineLblY = plotH - 8;
  const xLblY = plotH + 22;

  const zonePink = `<rect x="0" y="0" width="${width}" height="${threshold30Y}" fill="#FFCDD2"/>`;
  const zoneGreen = `<rect x="0" y="${threshold30Y}" width="${width}" height="${plotH - threshold30Y}" fill="#C8E6C9"/>`;
  const threshLine = `<line x1="0" y1="${threshold30Y}" x2="${width}" y2="${threshold30Y}" stroke="#E57373" stroke-width="2" stroke-dasharray="12,6"/>`;

  const yLabels = `
    <text x="8" y="22" font-family="Arial, sans-serif" font-size="22" fill="#555555">+60</text>
    <text x="8" y="${spikeLblY}" font-family="Arial, sans-serif" font-size="22" fill="#555555">spike +30</text>
    <text x="8" y="${baselineLblY}" font-family="Arial, sans-serif" font-size="22" fill="#555555">baseline</text>
    <text x="8" y="${xLblY}" font-family="Arial, sans-serif" font-size="22" fill="#555555">eating time</text>
    <text x="${width - 8}" y="${xLblY}" font-family="Arial, sans-serif" font-size="22" fill="#555555" text-anchor="end">+ 2 hours</text>`;

  let fillPath = "";
  let strokePathD = "";
  if (points.length >= 2) {
    const pts = points.map((p) => ({
      x: (p.minute / 120) * width,
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
    strokePathD = curveStrokePath(points, width, plotH);
  }

  const curveMarkup =
    fillPath && strokePathD
      ? `<path d="${fillPath}" fill="${color}" fill-opacity="0.92"/>
    <path d="${strokePathD}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`
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
  if (score >= 7.5) return "#2E7D32";
  if (score >= 5) return "#E65100";
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

/** Max ~2 lines for tip (~42 chars per line). */
function tipTwoLines(insight: string): string {
  const words = insight.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > 42 && cur) {
      lines.push(cur);
      cur = w;
      if (lines.length >= 2) break;
    } else {
      cur = next;
    }
  }
  if (lines.length < 2 && cur) lines.push(cur);
  const joined = lines.slice(0, 2).join(" ");
  const truncated = insight.trim().length > joined.length + 3 ? `${joined.slice(0, 118)}…` : joined;
  return truncated;
}

/** Instagram portrait 1080×1350 — white/light layers, readable curve & typography. */
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

  const W = CARD_W;
  const H = CARD_H;

  const hasHero = Boolean(params.heroImagePath && fs.existsSync(params.heroImagePath!));

  let baseBuf = await sharp({
    create: { width: W, height: H, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
  })
    .png({ compressionLevel: 6 })
    .toBuffer();

  const composites: sharp.OverlayOptions[] = [];

  if (hasHero) {
    const heroStrip = await sharp(params.heroImagePath!)
      .rotate()
      .resize(W, 480, { fit: "cover", position: "center" })
      .png()
      .toBuffer();

    const fadeSvg = `<svg width="${W}" height="480" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="fade" gradientUnits="userSpaceOnUse" x1="0" y1="380" x2="0" y2="480">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="0"/>
          <stop offset="100%" stop-color="#ffffff" stop-opacity="1"/>
        </linearGradient>
      </defs>
      <rect x="0" y="380" width="${W}" height="100" fill="url(#fade)"/>
    </svg>`;
    const fadeBuf = await sharp(Buffer.from(fadeSvg)).png().toBuffer();

    const heroLayer = await sharp({
      create: { width: W, height: 480, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 0 } },
    })
      .composite([
        { input: heroStrip, left: 0, top: 0 },
        { input: fadeBuf, left: 0, top: 0 },
      ])
      .png()
      .toBuffer();

    composites.push({ input: heroLayer, left: 0, top: 0 });
  }

  const foodTitle = escapeXml((params.foodName ?? "Your meal").slice(0, 52));
  const scoreNum = escapeXml(params.score.toFixed(1));
  const scoreCol = scoreDisplayColor(params.score);
  const vp = verdictPillLight(params.verdict);
  const badgeVerdict = escapeXml(verdictBadgeLabel(params.verdict));
  const tipPlain = tipTwoLines(params.insight);
  const footer = escapeXml(params.subtitle ?? "gluci.app");

  const upperSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <text x="540" y="522" text-anchor="middle" font-family="Arial, sans-serif" font-size="52" font-weight="bold" fill="#E91E63">Gluci</text>
    <text x="540" y="598" text-anchor="middle" font-family="Arial, sans-serif" font-size="38" fill="#1A1A1A">${foodTitle}</text>
    <text x="540" y="698" text-anchor="middle" font-family="Arial, sans-serif">
      <tspan font-size="108" font-weight="bold" fill="${scoreCol}">${scoreNum}</tspan><tspan font-size="52" fill="#888888">/10</tspan>
    </text>
    <rect x="420" y="800" width="240" height="72" rx="36" ry="36" fill="${vp.bg}"/>
    <text x="540" y="848" text-anchor="middle" font-family="Arial, sans-serif" font-size="32" font-weight="bold" fill="${vp.fg}">${badgeVerdict}</text>
  </svg>`;

  composites.push({ input: await sharp(Buffer.from(upperSvg)).png().toBuffer(), left: 0, top: 0 });

  const CHART_X = 60;
  const CHART_Y = 880;
  const OUT_W = 960;
  const OUT_H = 320;
  const PAD = 20;
  const INNER_W = OUT_W - PAD * 2;
  const INNER_H = OUT_H - PAD * 2;

  const curveInnerBuf = await sharp(Buffer.from(generateCurveSVG(params.glucoseCurve ?? [], INNER_W, INNER_H)))
    .png()
    .toBuffer();

  const frameSvg = `<svg width="${OUT_W}" height="${OUT_H}" xmlns="http://www.w3.org/2000/svg">
    <rect x="1" y="1" width="${OUT_W - 2}" height="${OUT_H - 2}" rx="16" ry="16" fill="#FFFFFF" stroke="#EEEEEE" stroke-width="2"/>
  </svg>`;
  const chartPlate = await sharp(Buffer.from(frameSvg))
    .png()
    .composite([{ input: curveInnerBuf, left: PAD, top: PAD }])
    .png()
    .toBuffer();

  composites.push({ input: chartPlate, left: CHART_X, top: CHART_Y });

  const lowerSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <foreignObject x="60" y="1240" width="960" height="88">
      <div xmlns="http://www.w3.org/1999/xhtml" style="font-family:Arial,sans-serif;font-size:28px;line-height:1.35;color:#616161;text-align:center;margin:0;padding:0;">
        ${escapeHtml(tipPlain)}
      </div>
    </foreignObject>
    <rect x="0" y="1300" width="${W}" height="50" fill="#F5F5F5"/>
    <text x="540" y="1334" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" fill="#9E9E9E">${footer}</text>
  </svg>`;

  composites.push({ input: await sharp(Buffer.from(lowerSvg)).png().toBuffer(), left: 0, top: 0 });

  await sharp(baseBuf)
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
