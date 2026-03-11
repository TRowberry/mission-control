const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const message = await prisma.message.findFirst({
    where: { 
      author: { username: 'rico' }
    },
    orderBy: { createdAt: 'desc' },
    include: {
      author: { select: { username: true, isAgent: true } }
    }
  });
  
  if (message) {
    console.log('Rico message found:');
    console.log('  id:', message.id);
    console.log('  content:', message.content);
    console.log('  channelId:', message.channelId);
    console.log('  threadId:', message.threadId);
    console.log('  replyToId:', message.replyToId);
    console.log('  createdAt:', message.createdAt);
  } else {
    console.log('No Rico message found');
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
