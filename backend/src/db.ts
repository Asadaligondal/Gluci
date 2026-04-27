import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/** Supabase (and similar poolers) in transaction mode → Prisma must skip prepared statements or you get 42P05. */
function prismaDatabaseUrl(): string {
  const raw = process.env.DATABASE_URL ?? "";
  if (!raw || /[?&]pgbouncer=true\b/i.test(raw)) return raw;
  if (/supabase\.(co|com)/i.test(raw)) {
    return raw + (raw.includes("?") ? "&" : "?") + "pgbouncer=true";
  }
  return raw;
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: { db: { url: prismaDatabaseUrl() } },
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
