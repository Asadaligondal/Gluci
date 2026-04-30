-- Core Gluci tables (User, chats, usage). Kept separate from pgvector / GI seed migrations.
-- EXISTING DATABASE (Supabase already has these tables): do NOT run this file by hand.
-- Mark as applied without executing:
--   npx prisma migrate resolve --applied "20250427120000_init_core_tables"
-- Then run: npx prisma migrate deploy

CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT,
    "appToken" TEXT,
    "telegramChatId" TEXT,
    "whatsappWaId" TEXT,
    "linkCode" TEXT,
    "linkCodeExpiresAt" TIMESTAMP(3),
    "freeChecksUsed" INTEGER NOT NULL DEFAULT 0,
    "subscriptionStatus" TEXT NOT NULL DEFAULT 'free',
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "subscriptionPriceId" TEXT,
    "subscriptionCurrentPeriodEnd" TIMESTAMP(3),
    "subscriptionCancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "reengagementOptOut" BOOLEAN NOT NULL DEFAULT false,
    "reengagementFrequencyDays" INTEGER NOT NULL DEFAULT 1,
    "lastReengagementAt" TIMESTAMP(3),
    "shareRef" TEXT,
    "appOnboardingComplete" BOOLEAN NOT NULL DEFAULT false,
    "telegramOnboardingSent" BOOLEAN NOT NULL DEFAULT false,
    "whatsappOnboardingSent" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AnalyticsEvent" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "properties" JSONB,
    "source" TEXT NOT NULL,

    CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'New chat',
    "messagingChannel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Profile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "goal" TEXT,
    "dietaryJson" TEXT,
    "memoryJson" TEXT,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "imageUrl" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UsageEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "score" DOUBLE PRECISION,
    "verdict" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

CREATE UNIQUE INDEX "User_appToken_key" ON "User"("appToken");

CREATE UNIQUE INDEX "User_telegramChatId_key" ON "User"("telegramChatId");

CREATE UNIQUE INDEX "User_whatsappWaId_key" ON "User"("whatsappWaId");

CREATE UNIQUE INDEX "User_linkCode_key" ON "User"("linkCode");

CREATE UNIQUE INDEX "User_stripeCustomerId_key" ON "User"("stripeCustomerId");

CREATE UNIQUE INDEX "User_stripeSubscriptionId_key" ON "User"("stripeSubscriptionId");

CREATE UNIQUE INDEX "User_shareRef_key" ON "User"("shareRef");

CREATE INDEX "AnalyticsEvent_userId_idx" ON "AnalyticsEvent"("userId");

CREATE INDEX "AnalyticsEvent_name_createdAt_idx" ON "AnalyticsEvent"("name", "createdAt");

CREATE INDEX "Conversation_userId_idx" ON "Conversation"("userId");

CREATE UNIQUE INDEX "Conversation_userId_messagingChannel_key" ON "Conversation"("userId", "messagingChannel");

CREATE UNIQUE INDEX "Profile_userId_key" ON "Profile"("userId");

CREATE INDEX "Message_conversationId_idx" ON "Message"("conversationId");

CREATE INDEX "Message_userId_conversationId_idx" ON "Message"("userId", "conversationId");

ALTER TABLE "AnalyticsEvent" ADD CONSTRAINT "AnalyticsEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Profile" ADD CONSTRAINT "Profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Message" ADD CONSTRAINT "Message_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
