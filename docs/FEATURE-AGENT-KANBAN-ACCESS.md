# Feature Spec: Agent Kanban Access

**Status:** Draft  
**Author:** Rico  
**Date:** 2026-03-08  
**Priority:** High (blocks Media Review feature)

## Overview

Enable AI agents to create, update, and manage tasks in Mission Control's kanban system with proper permission controls. This allows agents like Rico to track their work directly in MC instead of maintaining separate local kanbans.

## Goals

1. **Permission-based access** - Agents can only access projects they're explicitly granted access to
2. **Full task management** - Create, update, move, and complete tasks via API
3. **Audit trail** - Track which agent made which changes
4. **Future-proof** - Design aligns with upcoming user permission system

## Non-Goals (This Phase)

- User permission system (separate feature)
- Agent-to-agent task assignment
- Real-time WebSocket updates for agents

## Data Model

### New Table: AgentProjectAccess

```prisma
model AgentProjectAccess {
  id        String   @id @default(cuid())
  
  agentId   String
  agent     User     @relation("AgentAccess", fields: [agentId], references: [id], onDelete: Cascade)
  
  projectId String
  project   Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  
  // Permission level for future expansion
  role      String   @default("member")  // "member" | "admin" | "readonly"
  
  grantedById String
  grantedBy   User   @relation("GrantedAccess", fields: [grantedById], references: [id])
  
  createdAt DateTime @default(now())
  
  @@unique([agentId, projectId])
}
```

### User Model Updates

```prisma
model User {
  // ... existing fields ...
  
  // Agent project access (when this user is an agent)
  projectAccess  AgentProjectAccess[] @relation("AgentAccess")
  
  // Access grants made by this user
  accessGrants   AgentProjectAccess[] @relation("GrantedAccess")
}
```

### Project Model Updates

```prisma
model Project {
  // ... existing fields ...
  
  agentAccess AgentProjectAccess[]
}
```

## API Changes

### New Endpoint: Manage Agent Access

```
GET    /api/agents/[agentId]/projects     # List projects agent can access
POST   /api/agents/[agentId]/projects     # Grant agent access to project
DELETE /api/agents/[agentId]/projects     # Revoke access
```

**Request (POST):**
```json
{
  "projectId": "clxx...",
  "role": "member"
}
```

### Updated Kanban Routes

Change middleware from `withAuth` to `withAnyAuth` for these routes:
- `/api/kanban/projects` (GET only - list accessible projects)
- `/api/kanban/tasks` (all methods)
- `/api/kanban/subtasks` (all methods)

Add permission check helper:

```typescript
// lib/modules/api/permissions.ts
export async function canAccessProject(
  actor: AuthActor,
  projectId: string
): Promise<boolean> {
  // Users can access all projects (for now - until user permissions)
  if (isUser(actor)) return true;
  
  // Agents need explicit access
  const access = await prisma.agentProjectAccess.findUnique({
    where: {
      agentId_projectId: {
        agentId: actor.id,
        projectId,
      },
    },
  });
  
  return !!access;
}

export async function getAgentProjectIds(agentId: string): Promise<string[]> {
  const access = await prisma.agentProjectAccess.findMany({
    where: { agentId },
    select: { projectId: true },
  });
  return access.map(a => a.projectId);
}
```

### Example: Updated Tasks Route

```typescript
// app/api/kanban/tasks/route.ts
import { withAnyAuth, AuthActor, isAgent } from '@/lib/modules/api/middleware';
import { canAccessProject, getAgentProjectIds } from '@/lib/modules/api/permissions';

export const POST = withAnyAuth(async (req: NextRequest, actor: AuthActor) => {
  const { title, columnId, ... } = await req.json();
  
  // Get project from column
  const column = await prisma.column.findUnique({
    where: { id: columnId },
    select: { projectId: true },
  });
  
  if (!column) return notFound('Column not found');
  
  // Check permission
  if (!await canAccessProject(actor, column.projectId)) {
    return forbidden('No access to this project');
  }
  
  // Create task with actor as creator
  const task = await prisma.task.create({
    data: {
      title,
      columnId,
      createdById: actor.id,
      // ...
    },
  });
  
  return created(task);
});
```

## UI Changes

### Agent Settings Page

Add "Project Access" section to agent management:

```
┌─────────────────────────────────────────────┐
│ Rico 🤖                                     │
│ Agent Settings                              │
├─────────────────────────────────────────────┤
│ Project Access                              │
│ ┌─────────────────────────────────────────┐ │
│ │ ✓ Mission Control        [Remove]       │ │
│ │ ✓ Rico's Projects        [Remove]       │ │
│ │ + Add project access...                 │ │
│ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

## Implementation Plan

### Phase 1: Database & Permissions (1-2 hours)
1. Add `AgentProjectAccess` to Prisma schema
2. Run migration
3. Create permission helper functions
4. Add agent access management API

### Phase 2: Update Kanban Routes (1 hour)
1. Change task routes to `withAnyAuth`
2. Add permission checks
3. Update project list to filter by agent access
4. Test with Rico's agent key

### Phase 3: UI (30 min)
1. Add project access section to agent settings
2. Grant Rico access to "Mission Control" project

### Phase 4: Cleanup
1. Delete old local kanban (`kanban/projects.json`)
2. Update HEARTBEAT.md to remove kanban references
3. Document new workflow

## Security Considerations

1. **Agent isolation** - Agents cannot see projects they don't have access to
2. **Audit trail** - `createdById` tracks who created tasks (user or agent)
3. **Admin control** - Only workspace admins can grant/revoke agent access
4. **Cascading deletes** - Removing agent or project cleans up access records

## Migration Path

1. Deploy schema changes
2. Manually grant Rico access to existing projects via API/DB
3. Update routes
4. Test agent task creation
5. Remove old local kanban

## Success Criteria

- [ ] Rico can list projects he has access to
- [ ] Rico can create tasks in "Mission Control" project
- [ ] Rico can update and move tasks
- [ ] Rico cannot access projects without explicit grant
- [ ] UI shows agent project access management

---

## Decisions (from Tim - 2026-03-08)

1. **Agent task assignment:** ✅ Yes - agents can assign tasks to users (enables back-and-forth workflows)
2. **Activity tracking:** ✅ Both - use audit log AND track via task activity feed same as users
3. **Project agent selection:** ✅ When creating a project, prompt user to select which agents get member access. Can add/remove agents after creation too.
