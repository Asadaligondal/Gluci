import { prisma } from "../db.js";

function parseMem(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try { return JSON.parse(raw) as Record<string, unknown>; } catch { return {}; }
}

export async function getPendingSetup(userId: string): Promise<string | null> {
  const p = await prisma.profile.findUnique({ where: { userId } });
  const mem = parseMem(p?.memoryJson ?? null);
  return typeof mem.pendingSetup === "string" ? mem.pendingSetup : null;
}

export async function setPendingSetup(userId: string, step: string | null): Promise<void> {
  const p = await prisma.profile.upsert({ where: { userId }, create: { userId }, update: {} });
  const mem = parseMem(p.memoryJson);
  if (step === null) delete mem.pendingSetup;
  else mem.pendingSetup = step;
  await prisma.profile.update({ where: { userId }, data: { memoryJson: JSON.stringify(mem) } });
}

export async function saveGoal(userId: string, value: string): Promise<void> {
  await prisma.profile.upsert({
    where: { userId },
    create: { userId, goal: value },
    update: { goal: value },
  });
}

export async function saveDietaryField(userId: string, field: "allergies" | "preferences", value: string): Promise<void> {
  const p = await prisma.profile.upsert({ where: { userId }, create: { userId }, update: {} });
  const d = parseMem(p.dietaryJson) as Record<string, string>;
  d[field] = value;
  await prisma.profile.update({ where: { userId }, data: { dietaryJson: JSON.stringify(d) } });
}
