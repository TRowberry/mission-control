import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { hashPassword, generateToken, setAuthCookie } from '@/lib/auth';
import { generateSlug } from '@/lib/utils';
import { checkRateLimit, getClientIp, RATE_LIMITS } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 3 registration attempts per hour per IP
    const clientIp = getClientIp(request);
    const rateCheck = checkRateLimit(`register:${clientIp}`, RATE_LIMITS.register);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'Too many registration attempts. Please try again later.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil(rateCheck.retryAfterMs / 1000)),
          },
        }
      );
    }

    const { email, username, displayName, password, inviteToken } = await request.json();

    // Validate invite token if registration is disabled
    let validInvite: { id: string; workspaceId: string; role: string } | null = null;
    if (process.env.REGISTRATION_DISABLED === 'true') {
      if (!inviteToken) {
        return NextResponse.json(
          { error: 'An invite is required to create an account' },
          { status: 403 }
        );
      }
      const invite = await prisma.invite.findUnique({ where: { token: inviteToken } });
      if (!invite || invite.usedAt || invite.expiresAt < new Date()) {
        return NextResponse.json(
          { error: 'Invalid or expired invite link' },
          { status: 403 }
        );
      }
      validInvite = { id: invite.id, workspaceId: invite.workspaceId, role: invite.role };
    }

    // Validate input
    if (!email || !username || !displayName || !password) {
      return NextResponse.json(
        { error: 'All fields are required' },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    // Check if user exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email }, { username }],
      },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: existingUser.email === email ? 'Email already in use' : 'Username already taken' },
        { status: 400 }
      );
    }

    // Create user
    const hashedPassword = await hashPassword(password);
    const user = await prisma.user.create({
      data: {
        email,
        username: username.toLowerCase(),
        displayName,
        password: hashedPassword,
        status: 'online',
      },
    });

    let workspace;

    if (validInvite) {
      // Join the invited workspace instead of creating a new one
      workspace = await prisma.workspace.findUnique({ where: { id: validInvite.workspaceId } });
      await prisma.workspaceMember.create({
        data: { userId: user.id, workspaceId: validInvite.workspaceId, role: validInvite.role },
      });
      // Mark email-specific invites as used
      const invite = await prisma.invite.findUnique({ where: { id: validInvite.id } });
      if (invite?.email) {
        await prisma.invite.update({ where: { id: validInvite.id }, data: { usedAt: new Date() } });
      }
    } else {
      // Create default workspace for user (open registration path)
      workspace = await prisma.workspace.create({
        data: {
          name: `${displayName}'s Workspace`,
          slug: generateSlug(`${username}-workspace`),
          members: {
            create: { userId: user.id, role: 'owner' },
          },
          channels: {
            create: [
              { name: 'general', slug: 'general', type: 'text', position: 0 },
              { name: 'random', slug: 'random', type: 'text', position: 1 },
            ],
          },
        },
      });
    }

    // Generate token and set cookie
    const token = generateToken({
      userId: user.id,
      email: user.email,
      username: user.username,
    });
    await setAuthCookie(token);

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        displayName: user.displayName,
      },
      workspace: workspace ? {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
      } : null,
    });
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { error: 'Failed to create account' },
      { status: 500 }
    );
  }
}
