import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/modules/api/middleware';
import { ok, badRequest, forbidden } from '@/lib/modules/api/response';

const DEFAULT_WORKSPACE_ID = 'default-workspace';

/**
 * GET /api/llm-providers
 * List all LLM providers for the workspace
 */
export const GET = withAuth(async (req: NextRequest, user: AuthUser) => {
  const providers = await prisma.lLMProvider.findMany({
    where: { workspaceId: DEFAULT_WORKSPACE_ID },
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
  });

  // Mask API keys
  const masked = providers.map(p => ({
    ...p,
    apiKey: p.apiKey ? '••••••••' : null,
  }));

  return ok({ providers: masked });
});

/**
 * POST /api/llm-providers
 * Create a new LLM provider
 */
export const POST = withAuth(async (req: NextRequest, user: AuthUser) => {
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

  const body = await req.json();
  const {
    name,
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

  if (!name || !displayName) {
    return badRequest('name and displayName are required');
  }

  // If setting as default, unset other defaults
  if (isDefault) {
    await prisma.lLMProvider.updateMany({
      where: { workspaceId: DEFAULT_WORKSPACE_ID, isDefault: true },
      data: { isDefault: false },
    });
  }

  const provider = await prisma.lLMProvider.create({
    data: {
      name,
      displayName,
      endpoint,
      apiKey,
      orgId,
      isDefault: isDefault ?? false,
      isEnabled: isEnabled ?? true,
      models: models || [],
      costPerInputToken,
      costPerOutputToken,
      workspaceId: DEFAULT_WORKSPACE_ID,
    },
  });

  return ok({
    provider: { ...provider, apiKey: provider.apiKey ? '••••••••' : null },
  });
});
