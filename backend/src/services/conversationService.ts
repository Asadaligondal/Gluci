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
  const groups = await prisma.message.groupBy({
    by: ["userId"],
    where: { conversationId: null },
  });
  for (const g of groups) {
    const conv = await prisma.conversation.create({
      data: {
        userId: g.userId,
        title: "Previous messages",
        messagingChannel: null,
      },
    });
    await prisma.message.updateMany({
      where: { userId: g.userId, conversationId: null },
      data: { conversationId: conv.id },
    });
  }
}
