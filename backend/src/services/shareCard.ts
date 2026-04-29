import fs from "fs";
import sharp from "sharp";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { getConfig } from "../config.js";

const DATA_DIR = path.join(process.cwd(), "data", "cards");

export type CurvePoint = { minute: number; mg_dl: number };

const CURVE_MAX_Y = 80;
const CURVE_THRESHOLD = 30;

/** Light-theme curve panel: pink top / green bottom, dashed +30 line, filled “mountain” shape. */
export function generateCurveSVG(points: CurvePoint[], width: number, height: number): string {
  const threshY = height * (1 - CURVE_THRESHOLD / CURVE_MAX_Y);
  const peak = points.length ? Math.max(...points.map((p) => p.mg_dl)) : 0;
  const color = peak < 25 ? "#2E7D32" : peak < 50 ? "#E65100" : "#1A1A1A";

  const zonePink = `<rect width="${width}" height="${threshY}" fill="#FFDDE1"/>`;
  const zoneGreen = `<rect y="${threshY}" width="${width}" height="${height - threshY}" fill="#D6F0E0"/>`;
  const threshLine = `<line x1="0" y1="${threshY}" x2="${width}" y2="${threshY}" stroke="#BDBDBD" stroke-width="1" stroke-dasharray="8,4"/>`;

  if (!points.length) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    ${zonePink}
    ${zoneGreen}
    ${threshLine}
    <text x="8" y="20" font-family="sans-serif" font-size="18" fill="#9E9E9E">+60</text>
    <text x="8" y="${Math.min(36, threshY - 8)}" font-family="sans-serif" font-size="18" fill="#9E9E9E">spike +30</text>
    <text x="8" y="${height - 28}" font-family="sans-serif" font-size="18" fill="#9E9E9E">baseline</text>
    <text x="8" y="${height - 8}" font-family="sans-serif" font-size="18" fill="#9E9E9E">eating time</text>
    <text x="${width}" y="${height - 8}" text-anchor="end" font-family="sans-serif" font-size="18" fill="#9E9E9E">+ 2 hours</text>
  </svg>`;
  }

  const pts = points.map((p) => ({
    x: (p.minute / 120) * width,
    y: height - (p.mg_dl / CURVE_MAX_Y) * height,
  }));

  let d = `M ${pts[0].x} ${height} L ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const curr = pts[i];
    const cp1x = prev.x + (curr.x - prev.x) * 0.5;
    const cp2x = curr.x - (curr.x - prev.x) * 0.5;
    d += ` C ${cp1x} ${prev.y} ${cp2x} ${curr.y} ${curr.x} ${curr.y}`;
  }
  d += ` L ${pts[pts.length - 1].x} ${height} Z`;

  const lblSpikeY = threshY > 22 ? threshY - 6 : 22;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    ${zonePink}
    ${zoneGreen}
    ${threshLine}
    <path d="${d}" fill="${color}"/>
    <text x="8" y="20" font-family="sans-serif" font-size="18" fill="#9E9E9E">+60</text>
    <text x="8" y="${lblSpikeY}" font-family="sans-serif" font-size="18" fill="#9E9E9E">spike +30</text>
    <text x="8" y="${height - 28}" font-family="sans-serif" font-size="18" fill="#9E9E9E">baseline</text>
    <text x="8" y="${height - 8}" font-family="sans-serif" font-size="18" fill="#9E9E9E">eating time</text>
    <text x="${width}" y="${height - 8}" text-anchor="end" font-family="sans-serif" font-size="18" fill="#9E9E9E">+ 2 hours</text>
  </svg>`;
}

function scoreDisplayColor(score: number): string {
  if (score < 5) return "#F44336";
  if (score <= 7) return "#FF9800";
  return "#4CAF50";
}

function verdictPillLight(verdict: string): { bg: string; fg: string; stroke: string } {
  const v = verdict.trim().toLowerCase();
  if (v.includes("avoid")) return { bg: "#FFEBEE", fg: "#C62828", stroke: "#FFCDD2" };
  if (v.includes("modify")) return { bg: "#FFF3E0", fg: "#E65100", stroke: "#FFE0B2" };
  if (v.includes("eat")) return { bg: "#E8F5E9", fg: "#2E7D32", stroke: "#C8E6C9" };
  return { bg: "#F5F5F5", fg: "#424242", stroke: "#E0E0E0" };
}

function verdictBadgeLabel(verdict: string): string {
  const v = verdict.trim().toLowerCase();
  if (v.includes("avoid")) return "AVOID";
  if (v.includes("modify")) return "MODIFY";
  if (v.includes("eat")) return "EAT";
  return verdict.slice(0, 14).toUpperCase();
}

/** Instagram portrait 1080×1350, all light / white styling. */
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
  const H = 1350;

  const hasHero = Boolean(params.heroImagePath && fs.existsSync(params.heroImagePath!));

  let baseBuf = await sharp({
    create: { width: W, height: H, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .png()
    .toBuffer();

  if (hasHero) {
    const heroStrip = await sharp(params.heroImagePath!)
      .rotate()
      .resize(W, 540, { fit: "cover", position: "center" })
      .png()
      .toBuffer();

    const fadeSvg = `<svg width="${W}" height="540" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="fade" gradientUnits="userSpaceOnUse" x1="0" y1="440" x2="0" y2="540">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="0"/>
          <stop offset="100%" stop-color="#ffffff" stop-opacity="1"/>
        </linearGradient>
      </defs>
      <rect x="0" y="440" width="${W}" height="100" fill="url(#fade)"/>
    </svg>`;
    const fadeBuf = await sharp(Buffer.from(fadeSvg)).png().toBuffer();

    baseBuf = await sharp(baseBuf)
      .composite([
        { input: heroStrip, left: 0, top: 0 },
        { input: fadeBuf, left: 0, top: 0 },
      ])
      .png()
      .toBuffer();
  }

  const foodTitle = escapeXml((params.foodName ?? "Your meal").slice(0, 90));
  const scoreNum = escapeXml(params.score.toFixed(1));
  const scoreCol = scoreDisplayColor(params.score);
  const vp = verdictPillLight(params.verdict);
  const badgeVerdict = verdictBadgeLabel(params.verdict);
  const insightHtml = escapeHtml(params.insight.slice(0, 700));
  const footer = escapeXml(params.subtitle ?? "gluci.app");

  const mainSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <text x="540" y="580" text-anchor="middle" font-family="sans-serif" font-size="48" font-weight="bold" fill="#E91E8C">Gluci</text>
    <text x="540" y="650" text-anchor="middle" font-family="sans-serif" font-size="36" fill="#1A1A1A">${foodTitle}</text>
    <text x="540" y="780" text-anchor="middle" font-family="sans-serif">
      <tspan font-size="96" font-weight="bold" fill="${scoreCol}">${scoreNum}</tspan><tspan font-size="48" fill="#757575"> /10</tspan>
    </text>
    <rect x="440" y="850" width="200" height="60" rx="30" ry="30" fill="${vp.bg}" stroke="${vp.stroke}" stroke-width="1"/>
    <text x="540" y="892" text-anchor="middle" font-family="sans-serif" font-size="28" font-weight="bold" fill="${vp.fg}">${escapeXml(badgeVerdict)}</text>
    <foreignObject x="90" y="1240" width="900" height="100">
      <div xmlns="http://www.w3.org/1999/xhtml" style="font-family:sans-serif;font-size:28px;line-height:1.4;color:#616161;text-align:center;margin:0;padding:0;">
        ${insightHtml}
      </div>
    </foreignObject>
    <rect x="0" y="1310" width="${W}" height="40" fill="#F5F5F5"/>
    <text x="540" y="1337" text-anchor="middle" font-family="sans-serif" font-size="22" fill="#9E9E9E">${footer}</text>
  </svg>`;

  const overlayPng = await sharp(Buffer.from(mainSvg)).png().toBuffer();

  const innerW = 884;
  const innerH = 284;
  const curveInner = await sharp(Buffer.from(generateCurveSVG(params.glucoseCurve ?? [], innerW, innerH)))
    .png()
    .toBuffer();

  const borderSvg = `<svg width="900" height="300" xmlns="http://www.w3.org/2000/svg">
    <rect x="1" y="1" width="898" height="298" rx="16" ry="16" fill="#FFFFFF" stroke="#EEEEEE" stroke-width="2"/>
  </svg>`;
  let curvePlate = await sharp(Buffer.from(borderSvg)).png().toBuffer();
  curvePlate = await sharp(curvePlate)
    .composite([{ input: curveInner, left: 8, top: 8 }])
    .png()
    .toBuffer();

  await sharp(baseBuf)
    .composite([
      { input: overlayPng, left: 0, top: 0 },
      { input: curvePlate, left: 90, top: 940 },
    ])
    .png()
    .toFile(absolutePath);

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
  const lines = s.slice(0, 900).split(/\n+/);
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
