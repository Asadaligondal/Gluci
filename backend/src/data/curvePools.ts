import type { CurvePoint } from "../services/shareCard.js";

export type CurveCategory = "SEVERE" | "HIGH" | "MODERATE" | "LOW" | "MINIMAL";

// Control points: t = time fraction (0–1 of 180 min), v = value fraction (0–1 of amplitude)
type ShapePoint = { t: number; v: number };

const templates: Record<CurveCategory, ShapePoint[][]> = {
  SEVERE: [
    // A: Sharp early spike, fast return
    [{t:0,v:0},{t:0.12,v:0.2},{t:0.25,v:0.85},{t:0.32,v:1.0},{t:0.45,v:0.45},{t:0.6,v:0.15},{t:0.8,v:0.05},{t:1.0,v:0.02}],
    // B: Sharp spike then reactive crash
    [{t:0,v:0},{t:0.15,v:0.15},{t:0.28,v:0.95},{t:0.35,v:1.0},{t:0.48,v:0.28},{t:0.58,v:0.04},{t:0.72,v:0.03},{t:1.0,v:0.02}],
    // C: Twin spikes (ultra-processed, two-wave digestion)
    [{t:0,v:0},{t:0.14,v:0.25},{t:0.26,v:1.0},{t:0.38,v:0.58},{t:0.48,v:0.92},{t:0.61,v:0.35},{t:0.76,v:0.1},{t:1.0,v:0.02}],
  ],
  HIGH: [
    // A: Broad tall bell, sustained elevation
    [{t:0,v:0},{t:0.15,v:0.18},{t:0.3,v:0.65},{t:0.45,v:1.0},{t:0.6,v:0.72},{t:0.75,v:0.3},{t:0.9,v:0.1},{t:1.0,v:0.03}],
    // B: Double hump (carbs + sauce/sugar at different rates)
    [{t:0,v:0},{t:0.18,v:0.4},{t:0.32,v:1.0},{t:0.44,v:0.62},{t:0.55,v:0.88},{t:0.68,v:0.38},{t:0.85,v:0.1},{t:1.0,v:0.03}],
    // C: High plateau (pasta, rice — slow but sustained)
    [{t:0,v:0},{t:0.15,v:0.2},{t:0.3,v:0.6},{t:0.42,v:0.92},{t:0.52,v:1.0},{t:0.64,v:0.95},{t:0.78,v:0.5},{t:0.9,v:0.15},{t:1.0,v:0.03}],
  ],
  MODERATE: [
    // A: Classic gentle bell
    [{t:0,v:0},{t:0.2,v:0.2},{t:0.38,v:0.72},{t:0.52,v:1.0},{t:0.66,v:0.6},{t:0.82,v:0.22},{t:1.0,v:0.04}],
    // B: Gradual rise to flat top, slow return
    [{t:0,v:0},{t:0.2,v:0.1},{t:0.35,v:0.5},{t:0.5,v:0.88},{t:0.62,v:1.0},{t:0.72,v:0.88},{t:0.86,v:0.4},{t:1.0,v:0.05}],
    // C: Slight secondary bump (whole grain + fruit, etc.)
    [{t:0,v:0},{t:0.2,v:0.3},{t:0.35,v:0.88},{t:0.5,v:1.0},{t:0.6,v:0.75},{t:0.7,v:0.88},{t:0.85,v:0.3},{t:1.0,v:0.05}],
  ],
  LOW: [
    // A: Soft late bell
    [{t:0,v:0},{t:0.22,v:0.1},{t:0.42,v:0.42},{t:0.57,v:0.82},{t:0.68,v:1.0},{t:0.8,v:0.52},{t:0.92,v:0.2},{t:1.0,v:0.06}],
    // B: Very gradual wide spread
    [{t:0,v:0},{t:0.28,v:0.15},{t:0.45,v:0.55},{t:0.62,v:1.0},{t:0.75,v:0.78},{t:0.88,v:0.38},{t:1.0,v:0.08}],
    // C: Small double bump entirely in green zone
    [{t:0,v:0},{t:0.25,v:0.38},{t:0.4,v:0.7},{t:0.52,v:0.58},{t:0.65,v:1.0},{t:0.78,v:0.55},{t:0.9,v:0.2},{t:1.0,v:0.06}],
  ],
  MINIMAL: [
    // A: Near-flat gentle hump
    [{t:0,v:0},{t:0.25,v:0.1},{t:0.45,v:0.35},{t:0.62,v:0.75},{t:0.72,v:1.0},{t:0.85,v:0.6},{t:0.95,v:0.3},{t:1.0,v:0.12}],
    // B: Micro-wave (fat + protein meal, slow low movement)
    [{t:0,v:0},{t:0.2,v:0.18},{t:0.38,v:0.45},{t:0.52,v:0.82},{t:0.62,v:1.0},{t:0.74,v:0.88},{t:0.85,v:0.65},{t:0.93,v:0.42},{t:1.0,v:0.18}],
    // C: Single tiny gentle rise
    [{t:0,v:0},{t:0.32,v:0.08},{t:0.55,v:0.45},{t:0.68,v:1.0},{t:0.82,v:0.7},{t:1.0,v:0.15}],
  ],
};

// Peak amplitude range per category [min, max] mg/dL above baseline
const amplitudeRange: Record<CurveCategory, [number, number]> = {
  SEVERE:   [72, 82],
  HIGH:     [50, 64],
  MODERATE: [28, 42],
  LOW:      [14, 26],
  MINIMAL:  [4,  12],
};

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function generateCurvePoints(category: CurveCategory): CurvePoint[] {
  const tmplList = templates[category];
  const tmpl = tmplList[Math.floor(Math.random() * tmplList.length)];
  const [ampMin, ampMax] = amplitudeRange[category];
  const amplitude = rand(ampMin, ampMax);

  const pts: CurvePoint[] = tmpl.map(({ t, v }, i) => {
    const isEndpoint = i === 0 || i === tmpl.length - 1;
    const tNoise = isEndpoint ? 0 : (Math.random() - 0.5) * 0.06;
    const vNoise = isEndpoint ? 0 : (Math.random() - 0.5) * 0.1;
    const tFinal = Math.max(0, Math.min(1, t + tNoise));
    const vFinal = Math.max(0.01, Math.min(1.0, v + vNoise));
    return {
      minute: Math.round(tFinal * 180),
      mg_dl: Math.round(vFinal * amplitude * 10) / 10,
    };
  });

  pts.sort((a, b) => a.minute - b.minute);

  // Remove duplicate minutes
  const seen = new Set<number>();
  return pts.filter((p) => {
    if (seen.has(p.minute)) return false;
    seen.add(p.minute);
    return true;
  });
}
