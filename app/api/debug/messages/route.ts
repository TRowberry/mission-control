import { NextResponse } from 'next/server';
import prisma from '@/lib/db';

// Debug endpoint to check messages (remove in production)
export async function GET() {
  try {
    const messages = await prisma.message.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        author: { select: { displayName: true, username: true } },
        attachments: true,
      },
    });
    
    return NextResponse.json({
      count: messages.length,
      messages: messages.map(m => ({
        id: m.id,
        content: m.content?.substring(0, 50),
        author: m.author.displayName || m.author.username,
        attachments: m.attachments.length,
        createdAt: m.createdAt,
      })),
    });
  } catch (error) {
    console.error('Debug error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
