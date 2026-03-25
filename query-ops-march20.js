const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const messages = await prisma.message.findMany({
    where: {
      channelId: 'channel-ops',
      createdAt: {
        gte: new Date('2026-03-20T15:38:00Z'),
        lte: new Date('2026-03-20T21:33:00Z')
      }
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      content: true,
      createdAt: true,
      author: { select: { username: true } }
    }
  });
  
  messages.forEach((m, i) => {
    const content = m.content.replace(/<[^>]*>/g, '').substring(0, 500);
    console.log(`\n--- Message ${i+1} (${m.author?.username}) at ${m.createdAt} ---`);
    console.log(content);
  });
  
  console.log(`\n\nTotal messages found: ${messages.length}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
