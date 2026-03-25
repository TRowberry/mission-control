import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAuthParams, AuthUser } from '@/lib/modules/api/middleware';
import { ok, notFound, badRequest, forbidden } from '@/lib/modules/api/response';

const DEFAULT_WORKSPACE_ID = 'default-workspace';

/**
 * GET /api/llm-providers/[id]
 */
export const GET = withAuthParams(async (
  req: NextRequest,
  user: AuthUser,
  params: Promise<Record<string, string>>
) => {
  const { id } = await params;

  const provider = await prisma.lLMProvider.findUnique({
    where: { id },
  });

  if (!provider) {
    return notFound('Provider not found');
  }

  return ok({
    provider: { ...provider, apiKey: provider.apiKey ? '••••••••' : null },
  });
});

/**
 * PATCH /api/llm-providers/[id]
 */
export const PATCH = withAuthParams(async (
  req: NextRequest,
  user: AuthUser,
  params: Promise<Record<string, string>>
) => {
  const { id } = await params;

  // Check admin access
  const isAdmin = await prisma.workspaceMember.findFirst({
    where: {
      userId: user.id,
      workspaceId: DEFAULT_WORKSPACE_ID,
      role: { in: ['owner', 'admin'] },
    },
  });

  if (!isAdmin) {
    return forbidden('Admin access required');
  }

  const provider = await prisma.lLMProvider.findUnique({
    where: { id },
  });

  if (!provider) {
    return notFound('Provider not found');
  }

  const body = await req.json();
  const {
    displayName,
    endpoint,
    apiKey,
    orgId,
    isDefault,
    isEnabled,
    models,
    costPerInputToken,
    costPerOutputToken,
  } = body;

  // If setting as default, unset other defaults
  if (isDefault) {
    await prisma.lLMProvider.updateMany({
      where: { 
        workspaceId: DEFAULT_WORKSPACE_ID, 
        isDefault: true,
        id: { not: id },
      },
      data: { isDefault: false },
    });
  }

  const updateData: Record<string, unknown> = {};
  if (displayName !== undefined) updateData.displayName = displayName;
  if (endpoint !== undefined) updateData.endpoint = endpoint;
  if (apiKey !== undefined) updateData.apiKey = apiKey;
  if (orgId !== undefined) updateData.orgId = orgId;
  if (isDefault !== undefined) updateData.isDefault = isDefault;
  if (isEnabled !== undefined) updateData.isEnabled = isEnabled;
  if (models !== undefined) updateData.models = models;
  if (costPerInputToken !== undefined) updateData.costPerInputToken = costPerInputToken;
  if (costPerOutputToken !== undefined) updateData.costPerOutputToken = costPerOutputToken;

  const updated = await prisma.lLMProvider.update({
    where: { id },
    data: updateData,
  });

  return ok({
    provider: { ...updated, apiKey: updated.apiKey ? '••••••••' : null },
  });
});

/**
 * DELETE /api/llm-providers/[id]
 */
export const DELETE = withAuthParams(async (
  req: NextRequest,
  user: AuthUser,
  params: Promise<Record<string, string>>
) => {
  const { id } = await params;

  // Check admin access
  const isAdmin = await prisma.workspaceMember.findFirst({
    where: {
      userId: user.id,
      workspaceId: DEFAULT_WORKSPACE_ID,
      role: { in: ['owner', 'admin'] },
    },
  });

  if (!isAdmin) {
    return forbidden('Admin access required');
  }

  const provider = await prisma.lLMProvider.findUnique({
    where: { id },
  });

  if (!provider) {
    return notFound('Provider not found');
  }

  await prisma.lLMProvider.delete({
    where: { id },
  });

  return ok({ success: true });
});
