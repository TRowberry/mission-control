const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // The real channels (ones Tim uses)
  const keepIds = ['channel-general', 'channel-ops', 'channel-approvals'];
  
  // Get all channels with message counts
  const channels = await prisma.channel.findMany({
    include: {
      _count: { select: { messages: true } }
    }
  });

  console.log('Channel analysis:');
  console.log('='.repeat(80));
  
  const toDelete = [];
  const toKeep = [];

  for (const ch of channels) {
    const isKeep = keepIds.includes(ch.id);
    const status = isKeep ? '✅ KEEP' : '❌ DELETE';
    console.log(`${status} | ${ch.id.padEnd(30)} | ${ch.name.padEnd(12)} | ${ch._count.messages} messages`);
    
    if (!isKeep) {
      toDelete.push(ch);
    } else {
      toKeep.push(ch);
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log(`Keeping: ${toKeep.length} channels`);
  console.log(`Deleting: ${toDelete.length} channels (including ${toDelete.reduce((a,c) => a + c._count.messages, 0)} messages)`);

  if (toDelete.length > 0 && process.argv.includes('--execute')) {
    console.log('\nDeleting duplicate channels...');
    for (const ch of toDelete) {
      // Delete messages first (cascade should handle this, but being explicit)
      const deleted = await prisma.message.deleteMany({ where: { channelId: ch.id } });
      await prisma.channel.delete({ where: { id: ch.id } });
      console.log(`  Deleted: ${ch.id} (${ch.name}) - ${deleted.count} messages removed`);
    }
    console.log('Done!');
  } else if (toDelete.length > 0) {
    console.log('\nRun with --execute to delete duplicate channels');
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
