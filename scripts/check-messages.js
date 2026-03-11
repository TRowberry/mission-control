const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const messages = await prisma.message.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: {
      author: { select: { username: true, isAgent: true } }
    }
  });
  
  console.log('\nRecent messages:');
  messages.forEach(m => {
    const agent = m.author.isAgent ? '🤖' : '👤';
    console.log(`${agent} [${m.author.username}] ${m.content.substring(0, 50)}... (${m.createdAt.toISOString()})`);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
