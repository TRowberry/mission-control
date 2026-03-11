const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const channels = await prisma.channel.findMany({
    select: { id: true, name: true, slug: true, agentMode: true }
  });
  
  console.log('Channels:');
  channels.forEach(c => {
    console.log(`  ${c.id} | ${c.name} | slug: ${c.slug} | agentMode: ${c.agentMode}`);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
