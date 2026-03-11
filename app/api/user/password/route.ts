import { NextRequest } from 'next/server';
import { hashPassword, verifyPassword } from '@/lib/auth';
import prisma from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/modules/api/middleware';
import { ok, badRequest, notFound } from '@/lib/modules/api/response';

// POST /api/user/password - Change password
export const POST = withAuth(async (req: NextRequest, user: AuthUser) => {
  const { currentPassword, newPassword } = await req.json();

  if (!currentPassword || !newPassword) {
    return badRequest('Current password and new password are required');
  }

  if (newPassword.length < 8) {
    return badRequest('New password must be at least 8 characters');
  }

  // Get user with password hash
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, password: true },
  });

  if (!dbUser) {
    return notFound('User not found');
  }

  // Verify current password
  const isValid = await verifyPassword(currentPassword, dbUser.password);
  if (!isValid) {
    return badRequest('Current password is incorrect');
  }

  // Hash and save new password
  const hashedPassword = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: user.id },
    data: { password: hashedPassword },
  });

  return ok({ success: true, message: 'Password updated successfully' });
});
