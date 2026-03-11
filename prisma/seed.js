const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create users
  const timPassword = await bcrypt.hash('password123', 12);
  const ricoPassword = await bcrypt.hash('password123', 12);

  const tim = await prisma.user.upsert({
    where: { email: 'tim@missioncontrol.local' },
    update: {},
    create: {
      email: 'tim@missioncontrol.local',
      username: 'tim',
      displayName: 'Tim',
      password: timPassword,
      status: 'online',
    },
  });

  const rico = await prisma.user.upsert({
    where: { email: 'rico@missioncontrol.local' },
    update: {},
    create: {
      email: 'rico@missioncontrol.local',
      username: 'rico',
      displayName: 'Rico',
      password: ricoPassword,
      status: 'online',
    },
  });

  console.log('✅ Created users:', tim.username, rico.username);

  // Create workspace
  const workspace = await prisma.workspace.upsert({
    where: { slug: 'mission-control' },
    update: {},
    create: {
      name: 'Mission Control',
      slug: 'mission-control',
      description: 'Our command center for all projects',
      members: {
        create: [
          { userId: tim.id, role: 'owner' },
          { userId: rico.id, role: 'admin' },
        ],
      },
    },
  });

  console.log('✅ Created workspace:', workspace.name);

  // Create channels
  const channels = await Promise.all([
    prisma.channel.upsert({
      where: { workspaceId_slug: { workspaceId: workspace.id, slug: 'general' } },
      update: {},
      create: {
        name: 'general',
        slug: 'general',
        type: 'text',
        workspaceId: workspace.id,
        position: 0,
      },
    }),
    prisma.channel.upsert({
      where: { workspaceId_slug: { workspaceId: workspace.id, slug: 'dev' } },
      update: {},
      create: {
        name: 'dev',
        slug: 'dev',
        type: 'text',
        description: 'Development discussions',
        workspaceId: workspace.id,
        position: 1,
      },
    }),
    prisma.channel.upsert({
      where: { workspaceId_slug: { workspaceId: workspace.id, slug: 'random' } },
      update: {},
      create: {
        name: 'random',
        slug: 'random',
        type: 'text',
        workspaceId: workspace.id,
        position: 2,
      },
    }),
  ]);

  console.log('✅ Created channels:', channels.map(c => c.name).join(', '));

  // Create a project
  const project = await prisma.project.upsert({
    where: { id: 'tends2trend-project' },
    update: {},
    create: {
      id: 'tends2trend-project',
      name: 'Tends2Trend',
      description: 'Automated trend detection and publishing',
      color: '#5865F2',
      workspaceId: workspace.id,
    },
  });

  // Create columns
  const columns = await Promise.all([
    prisma.column.create({
      data: { name: 'Backlog', position: 0, projectId: project.id },
    }),
    prisma.column.create({
      data: { name: 'In Progress', position: 1, projectId: project.id, limit: 3 },
    }),
    prisma.column.create({
      data: { name: 'Review', position: 2, projectId: project.id },
    }),
    prisma.column.create({
      data: { name: 'Done', position: 3, projectId: project.id },
    }),
  ]);

  console.log('✅ Created project with columns:', project.name);

  // Create some sample tasks
  await prisma.task.createMany({
    data: [
      {
        title: 'Implement video hash deduplication',
        description: 'Add MD5 + visual hash checking to prevent duplicate uploads',
        priority: 'high',
        columnId: columns[1].id, // In Progress
        createdById: rico.id,
        assigneeId: rico.id,
      },
      {
        title: 'Lower score threshold',
        description: 'Adjust min_score to ensure consistent posting',
        priority: 'medium',
        columnId: columns[3].id, // Done
        createdById: tim.id,
        assigneeId: rico.id,
      },
      {
        title: 'Add retry logic for failed downloads',
        description: 'Handle "video processing" errors from Reddit',
        priority: 'medium',
        columnId: columns[0].id, // Backlog
        createdById: rico.id,
      },
    ],
  });

  console.log('✅ Created sample tasks');

  // Add a welcome message
  await prisma.message.create({
    data: {
      content: '👋 Welcome to Mission Control! This is where we coordinate all our projects.',
      type: 'system',
      authorId: rico.id,
      channelId: channels[0].id,
    },
  });

  console.log('✅ Added welcome message');
  console.log('');
  console.log('🎉 Database seeded successfully!');
  console.log('');
  console.log('Test accounts:');
  console.log('  tim@missioncontrol.local / password123');
  console.log('  rico@missioncontrol.local / password123');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
