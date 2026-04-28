import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";

const ALLOWED_CLIENT_NAMES = new Set([
  "app_open",
  "onboarding_complete",
  "share_link_copy",
  "profile_update",
  "checkout_open",
]);

export function isAllowedClientEventName(name: string): boolean {
  return ALLOWED_CLIENT_NAMES.has(name);
}

export async function logAnalytics(params: {
  userId?: string | null;
  name: string;
  properties?: Record<string, unknown>;
  source: string;
}): Promise<void> {
  try {
    const properties = params.properties
      ? (JSON.parse(JSON.stringify(params.properties)) as Prisma.InputJsonValue)
      : undefined;
    await prisma.analyticsEvent.create({
      data: {
        userId: params.userId ?? undefined,
        name: params.name,
        properties,
        source: params.source,
      },
    });
  } catch (e) {
    console.warn("analytics log failed", e);
  }
}
