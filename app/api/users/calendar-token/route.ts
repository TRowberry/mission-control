import { NextRequest } from 'next/server';
import { randomUUID } from 'crypto';
import prisma from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/modules/api/middleware';
import { ok } from '@/lib/modules/api/response';

// GET /api/users/calendar-token
// Returns the user's calendar token, creating one if it doesn't exist yet.
export const GET = withAuth(async (_req: NextRequest, user: AuthUser) => {
  let { calendarToken } = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { calendarToken: true },
  }) as { calendarToken: string | null };

  if (!calendarToken) {
    calendarToken = randomUUID();
    await prisma.user.update({
      where: { id: user.id },
      data: { calendarToken },
    });
  }

  return ok({ calendarToken });
});

// DELETE /api/users/calendar-token
// Regenerates the token — old subscription URLs stop working immediately.
export const DELETE = withAuth(async (_req: NextRequest, user: AuthUser) => {
  const calendarToken = randomUUID();
  await prisma.user.update({
    where: { id: user.id },
    data: { calendarToken },
  });

  return ok({ calendarToken });
});
