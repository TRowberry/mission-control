const { PrismaClient } = require("@prisma/client");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  const agents = [
    { username: "scout", displayName: "Scout 🔍", email: "scout@agents.local" },
    { username: "coder", displayName: "Coder 💻", email: "coder@agents.local" },
    { username: "creator", displayName: "Creator 🎨", email: "creator@agents.local" },
    { username: "monitor", displayName: "Monitor 📊", email: "monitor@agents.local" }
  ];

  console.log("Creating agents...\n");

  for (const agent of agents) {
    const existing = await prisma.user.findFirst({
      where: { username: agent.username }
    });
    
    if (existing) {
      console.log(agent.username + ": already exists");
      console.log("  API Key: " + existing.apiKey);
      continue;
    }

    const apiKey = "mc_agent_" + crypto.randomBytes(16).toString("hex");
    const randomPassword = await bcrypt.hash(crypto.randomUUID(), 10);

    await prisma.user.create({
      data: {
        username: agent.username,
        displayName: agent.displayName,
        email: agent.email,
        password: randomPassword,
        isAgent: true,
        apiKey: apiKey,
        status: "offline"
      }
    });
    console.log(agent.username + ": CREATED");
    console.log("  API Key: " + apiKey);
  }

  console.log("\nDone!");
  await prisma.$disconnect();
}

main().catch(console.error);
