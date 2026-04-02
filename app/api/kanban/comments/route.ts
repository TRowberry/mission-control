import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/modules/api/middleware';
import { ok, created, badRequest, notFound, forbidden } from '@/lib/modules/api/response';

// GET comments for a task
export const GET = withAuth(async (req: NextRequest, user: AuthUser) => {
  const { searchParams } = new URL(req.url);
  const taskId = searchParams.get('taskId');

  if (!taskId) {
    return badRequest('taskId required');
  }

  const comments = await prisma.comment.findMany({
    where: { taskId },
    orderBy: { createdAt: 'desc' },
    include: {
      task: false,
    },
  });

  // Fetch author info for each comment
  const authorIds = [...new Set(comments.map(c => c.authorId))];
  const authors = await prisma.user.findMany({
    where: { id: { in: authorIds } },
    select: { id: true, displayName: true, avatar: true },
  });
  const authorMap = new Map(authors.map(a => [a.id, a]));

  const commentsWithAuthors = comments.map(comment => ({
    ...comment,
    author: authorMap.get(comment.authorId) || { displayName: 'Unknown', avatar: null },
  }));

  return ok(commentsWithAuthors);
});

// POST new comment
export const POST = withAuth(async (req: NextRequest, user: AuthUser) => {
  const { taskId, content } = await req.json();

  if (!taskId || !content?.trim()) {
    return badRequest('taskId and content required');
  }

  // Verify task exists
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) {
    return notFound('Task not found');
  }

  const comment = await prisma.comment.create({
    data: {
      taskId,
      content: content.trim(),
      authorId: user.id,
    },
  });

  // Get author info for response
  const author = {
    id: user.id,
    displayName: user.displayName,
    avatar: user.avatar,
  };

  // Log activity
  try {
    const column = await prisma.column.findUnique({ where: { id: task.columnId } });
    await prisma.activity.create({
      data: {
        type: 'comment_added',
        data: { taskId, commentId: comment.id, text: content.trim().substring(0, 100) },
        userId: user.id,
        projectId: column?.projectId || null,
      },
    });
  } catch (e) {
    // Activity logging is best-effort
    console.error('Failed to log activity:', e);
  }

  return created({ ...comment, author });
});

// DELETE comment
export const DELETE = withAuth(async (req: NextRequest, user: AuthUser) => {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) {
    return badRequest('Comment id required');
  }

  // Check comment exists and user owns it
  const comment = await prisma.comment.findUnique({ where: { id } });
  if (!comment) {
    return notFound('Comment not found');
  }
  if (comment.authorId !== user.id) {
    return forbidden('Not authorized');
  }

  await prisma.comment.delete({ where: { id } });

  return ok({ success: true });
});
