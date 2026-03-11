// Create an agent account
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const prisma = new PrismaClient();

async function main() {
  const username = process.argv[2] || 'rico';
  const displayName = process.argv[3] || 'Rico';
  const email = process.argv[4] || 'rico@agent.local';

  // Generate API key
  const apiKey = `mc_agent_${crypto.randomBytes(16).toString('hex')}`;
  
  // Check if already exists
  const existing = await prisma.user.findFirst({
    where: { username: { equals: username, mode: 'insensitive' } },
  });

  if (existing) {
    if (existing.isAgent) {
      console.log(`Agent ${username} already exists!`);
      console.log('API Key:', existing.apiKey);
      return;
    } else {
      // Convert to agent
      const updated = await prisma.user.update({
        where: { id: existing.id },
        data: { isAgent: true, apiKey },
      });
      console.log(`Converted ${username} to agent!`);
      console.log('API Key:', apiKey);
      return;
    }
  }

  // Create new agent
  const agent = await prisma.user.create({
    data: {
      username: username.toLowerCase(),
      displayName,
      email: email.toLowerCase(),
      password: await bcrypt.hash(crypto.randomUUID(), 12),
      isAgent: true,
      apiKey,
      status: 'offline',
    },
  });

  console.log(`Created agent: ${agent.username}`);
  console.log('API Key:', apiKey);
  console.log('\nSave this API key - it will not be shown again!');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
