const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  try {
    const agents = await prisma.user.findMany({
      where: { isAgent: true },
      select: { username: true, apiKey: true }
    });
    console.log('Agents in database:');
    agents.forEach(a => console.log(`  ${a.username}: ${a.apiKey}`));
  } finally {
    await prisma.$disconnect();
  }
}

main();
