import { NextRequest, NextResponse } from 'next/server';
import { readFile, stat } from 'fs/promises';
import path from 'path';
import prisma from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { getAgentFromApiKey } from '@/lib/agent-auth';

/**
 * Serve uploaded files with access control.
 * 
 * Access rules:
 * - Avatar files (referenced in user profiles): public
 * - Message attachments: only accessible to users/agents with access to the channel
 * - Files not linked to any attachment: require authentication (any logged-in user)
 * - Unauthenticated requests: denied for non-avatar files
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path: pathSegments } = await params;
    const filePath = path.join(process.cwd(), 'public', ...pathSegments);
    
    // Security: ensure we're only serving from public/
    const resolvedPath = path.resolve(filePath);
    const publicDir = path.resolve(process.cwd(), 'public');
    
    if (!resolvedPath.startsWith(publicDir)) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 403 });
    }
    
    // Check if file exists
    try {
      await stat(resolvedPath);
    } catch {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    // Build the URL path as stored in the database
    const urlPath = `/api/files/${pathSegments.join('/')}`;

    // Check if this is an avatar file (referenced in user profiles)
    const isAvatar = await prisma.user.findFirst({
      where: { avatar: urlPath },
      select: { id: true },
    });

    if (isAvatar) {
      // Avatars are always public
      return serveFile(resolvedPath);
    }

    // For all other files, require authentication
    const user = await getCurrentUser();
    const agent = !user ? await getAgentFromApiKey() : null;
    
    if (!user && !agent) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const actorId = user?.id || agent?.id;

    // Look up attachment by URL to determine channel context
    const attachment = await prisma.attachment.findFirst({
      where: { url: urlPath },
      include: {
        message: {
          select: {
            channelId: true,
            channel: {
              select: {
                id: true,
                workspaceId: true,
              },
            },
          },
        },
      },
    });

    if (attachment?.message?.channelId) {
      // File is a message attachment — check channel access
      const channelId = attachment.message.channelId;
      
      if (agent) {
        // Agents can access files in channels with agentMode != 'disabled'
        const channel = await prisma.channel.findUnique({
          where: { id: channelId },
          select: { agentMode: true },
        });
        if (channel?.agentMode === 'disabled') {
          return NextResponse.json({ error: 'Access denied' }, { status: 403 });
        }
      } else if (user) {
        // Users can access files in channels they belong to via workspace membership
        const channel = attachment.message.channel;
        if (channel?.workspaceId) {
          const membership = await prisma.workspaceMember.findFirst({
            where: {
              userId: user.id,
              workspaceId: channel.workspaceId,
            },
          });
          if (!membership) {
            return NextResponse.json({ error: 'Access denied' }, { status: 403 });
          }
        }
      }
    }
    
    // File is either: linked to an accessible channel, or unlinked (allow for any authenticated user)
    // Thumbnails and other generated files won't have attachment records — allow if authenticated
    return serveFile(resolvedPath);

  } catch (error) {
    console.error('Error serving file:', error);
    const isProduction = process.env.NODE_ENV === 'production';
    return NextResponse.json(
      { error: isProduction ? 'Internal server error' : 'Failed to serve file' },
      { status: 500 }
    );
  }
}

/**
 * Serve a file with appropriate headers
 */
function serveFile(resolvedPath: string): NextResponse {
  const ext = path.extname(resolvedPath).toLowerCase();
  const contentTypes: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.json': 'application/json',
    '.css': 'text/css',
    '.js': 'application/javascript',
  };
  
  const contentType = contentTypes[ext] || 'application/octet-stream';
  
  // Use readFile synchronously since we need to return the response
  // In a real production setup, use streaming
  const fs = require('fs');
  const fileBuffer = fs.readFileSync(resolvedPath);
  
  return new NextResponse(fileBuffer, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
