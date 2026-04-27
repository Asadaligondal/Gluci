import { prisma } from "../db.js";

export async function getOrCreateChannelConversation(userId: string, channel: "telegram" | "whatsapp") {
  const messagingChannel = channel;
  const title = channel === "telegram" ? "Telegram" : "WhatsApp";
  return prisma.conversation.upsert({
    where: {
      userId_messagingChannel: { userId, messagingChannel },
    },
    create: { userId, title, messagingChannel },
    update: {},
  });
}

export async function listConversations(userId: string) {
  return prisma.conversation.findMany({
    where: { userId, messagingChannel: null },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
}

export async function createAppConversation(userId: string, title = "New chat") {
  return prisma.conversation.create({
    data: { userId, title, messagingChannel: null },
  });
}

export async function getConversationForUser(userId: string, conversationId: string) {
  return prisma.conversation.findFirst({
    where: { id: conversationId, userId },
  });
}

export async function migrateOrphanedMessages() {
  const rows = await prisma.message.findMany({
    where: { conversationId: null },
    select: { userId: true },
  });
  const userIds = [...new Set(rows.map((r) => r.userId))];
  for (const userId of userIds) {
    const conv = await prisma.conversation.create({
      data: {
        userId,
        title: "Previous messages",
        messagingChannel: null,
      },
    });
    await prisma.message.updateMany({
      where: { userId, conversationId: null },
      data: { conversationId: conv.id },
    });
  }
}
