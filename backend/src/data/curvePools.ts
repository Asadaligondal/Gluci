import type { CurvePoint } from "../services/shareCard.js";

export type CurveCategory = "SEVERE" | "HIGH" | "MODERATE" | "LOW" | "MINIMAL";

type BumpParams = { time: number; mgDl: number; width: number };

type CategoryParams = {
  peakTime: number;
  peakMgDl: number;
  decayHalfLife: number;
  bumps?: BumpParams[];
};

const CATEGORY_PARAMS: Record<CurveCategory, CategoryParams> = {
  SEVERE:   { peakTime: 25, peakMgDl: 77, decayHalfLife: 30 },
  HIGH:     { peakTime: 35, peakMgDl: 57, decayHalfLife: 40 },
  MODERATE: { peakTime: 45, peakMgDl: 35, decayHalfLife: 50 },
  LOW:      { peakTime: 60, peakMgDl: 20, decayHalfLife: 55 },
  MINIMAL:  { peakTime: 70, peakMgDl:  8, decayHalfLife: 60 },
};

export function renderCurveFromParams(p: {
  peakTime: number;
  peakMgDl: number;
  decayHalfLife: number;
  bumps?: BumpParams[];
}): CurvePoint[] {
  return generateCurvePoints("MODERATE", p);
}

export function generateCurvePoints(category: CurveCategory, override?: Partial<CategoryParams>): CurvePoint[] {
  const base = CATEGORY_PARAMS[category];
  const { peakTime, peakMgDl, decayHalfLife, bumps } = { ...base, ...override };
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

    // Additional glucose waves (GPT-provided bumps array)
    for (const bump of bumps ?? []) {
      const d = minute - bump.time;
      value += bump.mgDl * Math.exp(-(d * d) / (2 * bump.width * bump.width));
    }

    points.push({ minute, mg_dl: Math.max(0, Math.round(value * 10) / 10) });
  }

  return points;
}
