import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/modules/api/middleware';
import { ok, badRequest, notFound } from '@/lib/modules/api/response';

// GET /api/user/profile - Get current user's profile
export const GET = withAuth(async (req: NextRequest, user: AuthUser) => {
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      email: true,
      username: true,
      displayName: true,
      avatar: true,
      status: true,
      isAgent: true,
      createdAt: true,
      workspaces: {
        select: {
          role: true,
          workspace: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  });

  if (!dbUser) {
    return notFound('User not found');
  }

  return ok(dbUser);
});

// PATCH /api/user/profile - Update current user's profile
export const PATCH = withAuth(async (req: NextRequest, user: AuthUser) => {
  const { displayName, username, email, avatar, status } = await req.json();

  // Build update object with only provided fields
  const updateData: Record<string, string> = {};
  
  if (displayName !== undefined) {
    if (typeof displayName !== 'string' || displayName.trim().length === 0) {
      return badRequest('Display name cannot be empty');
    }
    updateData.displayName = displayName.trim();
  }

  if (username !== undefined) {
    if (typeof username !== 'string' || username.trim().length < 3) {
      return badRequest('Username must be at least 3 characters');
    }
    // Check uniqueness
    const existing = await prisma.user.findFirst({
      where: {
        username: username.trim().toLowerCase(),
        NOT: { id: user.id },
      },
    });
    if (existing) {
      return badRequest('Username already taken');
    }
    updateData.username = username.trim().toLowerCase();
  }

  if (email !== undefined) {
    if (typeof email !== 'string' || !email.includes('@')) {
      return badRequest('Invalid email address');
    }
    // Check uniqueness
    const existing = await prisma.user.findFirst({
      where: {
        email: email.trim().toLowerCase(),
        NOT: { id: user.id },
      },
    });
    if (existing) {
      return badRequest('Email already in use');
    }
    updateData.email = email.trim().toLowerCase();
  }

  if (avatar !== undefined) {
    updateData.avatar = avatar;
  }

  if (status !== undefined) {
    const validStatuses = ['online', 'idle', 'dnd', 'offline'];
    if (!validStatuses.includes(status)) {
      return badRequest('Invalid status');
    }
    updateData.status = status;
  }

  if (Object.keys(updateData).length === 0) {
    return badRequest('No valid fields to update');
  }

  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: updateData,
    select: {
      id: true,
      email: true,
      username: true,
      displayName: true,
      avatar: true,
      status: true,
      isAgent: true,
      createdAt: true,
    },
  });

  return ok(updatedUser);
});
