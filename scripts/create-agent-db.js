#!/usr/bin/env node

/**
 * Create an agent directly in the database.
 * Usage: node create-agent-db.js <username> <displayName> <email>
 * 
 * This script connects directly to the database and creates an agent account.
 */

const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

const prisma = new PrismaClient();

function generateApiKey() {
  return `mc_agent_${crypto.randomBytes(16).toString('hex')}`;
}

async function hashPassword(password) {
  const bcrypt = require('bcryptjs');
  return bcrypt.hash(password, 10);
}

async function main() {
  const [,, username, displayName, email] = process.argv;

  if (!username || !displayName || !email) {
    console.error('Usage: node create-agent-db.js <username> <displayName> <email>');
    console.error('Example: node create-agent-db.js scout "Scout 🔍" scout@agents.local');
    process.exit(1);
  }

  try {
    // Check if agent already exists
    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          { username: { equals: username.toLowerCase(), mode: 'insensitive' } },
          { email: { equals: email.toLowerCase(), mode: 'insensitive' } },
        ],
      },
    });

    if (existing) {
      console.log(`Agent "${username}" already exists!`);
      console.log(`ID: ${existing.id}`);
      console.log(`API Key: ${existing.apiKey || 'not set'}`);
      return;
    }

    const apiKey = generateApiKey();
    const randomPassword = await hashPassword(crypto.randomUUID());

    const agent = await prisma.user.create({
      data: {
        username: username.toLowerCase(),
        displayName,
        email: email.toLowerCase(),
        password: randomPassword,
        isAgent: true,
        apiKey,
        status: 'offline',
      },
    });

    console.log(`✅ Created agent: ${displayName}`);
    console.log(`   Username: ${agent.username}`);
    console.log(`   ID: ${agent.id}`);
    console.log(`   API Key: ${apiKey}`);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
