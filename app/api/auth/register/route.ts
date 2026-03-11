import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { hashPassword, generateToken, setAuthCookie } from '@/lib/auth';
import { generateSlug } from '@/lib/utils';

export async function POST(request: NextRequest) {
  try {
    const { email, username, displayName, password } = await request.json();

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

    // Create default workspace for user
    const workspace = await prisma.workspace.create({
      data: {
        name: `${displayName}'s Workspace`,
        slug: generateSlug(`${username}-workspace`),
        members: {
          create: {
            userId: user.id,
            role: 'owner',
          },
        },
        channels: {
          create: [
            { name: 'general', slug: 'general', type: 'text', position: 0 },
            { name: 'random', slug: 'random', type: 'text', position: 1 },
          ],
        },
      },
    });

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
      workspace: {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { error: 'Failed to create account' },
      { status: 500 }
    );
  }
}
