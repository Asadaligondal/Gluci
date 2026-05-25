import type { CurvePoint } from "../services/shareCard.js";

export type CurveCategory = "SEVERE" | "HIGH" | "MODERATE" | "LOW" | "MINIMAL";

type CategoryParams = {
  peakTime: number;
  peakMgDl: number;
  decayHalfLife: number;
  secondaryBump: boolean;
  bumpTime?: number;  // minutes to second peak (GPT-provided)
  bumpMgDl?: number; // height of second peak in mg/dL (GPT-provided)
};

const CATEGORY_PARAMS: Record<CurveCategory, CategoryParams> = {
  SEVERE:   { peakTime: 25, peakMgDl: 77, decayHalfLife: 30, secondaryBump: false },
  HIGH:     { peakTime: 35, peakMgDl: 57, decayHalfLife: 40, secondaryBump: false },
  MODERATE: { peakTime: 45, peakMgDl: 35, decayHalfLife: 50, secondaryBump: false },
  LOW:      { peakTime: 60, peakMgDl: 20, decayHalfLife: 55, secondaryBump: false },
  MINIMAL:  { peakTime: 70, peakMgDl:  8, decayHalfLife: 60, secondaryBump: false },
};

export function renderCurveFromParams(p: {
  peakTime: number;
  peakMgDl: number;
  decayHalfLife: number;
  secondaryBump?: boolean;
  bumpTime?: number;
  bumpMgDl?: number;
}): CurvePoint[] {
  return generateCurvePoints("MODERATE", p);
}

export function generateCurvePoints(category: CurveCategory, override?: Partial<CategoryParams>): CurvePoint[] {
  const base = CATEGORY_PARAMS[category];
  const { peakTime, peakMgDl, decayHalfLife, secondaryBump, bumpTime, bumpMgDl } = { ...base, ...override };
  const decayK = Math.LN2 / decayHalfLife;
  const points: CurvePoint[] = [];

  for (let minute = 0; minute <= 180; minute += 10) {
    let value: number;

    if (minute <= peakTime) {
      // Smooth S-shaped rise (smoothstep: 3t²−2t³)
      const t = minute / peakTime;
      value = peakMgDl * (t * t * (3 - 2 * t));
    } else {
      // Exponential decay after peak
      value = peakMgDl * Math.exp(-decayK * (minute - peakTime));
    }

    // Optional secondary bump using GPT-provided timing and height
    if (secondaryBump) {
      const bumpCenter = bumpTime ?? peakTime * 1.8;
      const bumpHeight = bumpMgDl ?? peakMgDl * 0.35;
      const bumpWidth = 20;
      const d = minute - bumpCenter;
      value += bumpHeight * Math.exp(-(d * d) / (2 * bumpWidth * bumpWidth));
    }

    points.push({ minute, mg_dl: Math.max(0, Math.round(value * 10) / 10) });
  }

  return points;
}
