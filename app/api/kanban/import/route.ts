import { NextRequest } from 'next/server';
import prisma from '@/lib/db';
import { withAuth, AuthUser } from '@/lib/modules/api/middleware';
import { ok, serverError } from '@/lib/modules/api/response';

interface OldSubtask {
  text: string;
  done: boolean;
}

interface OldProject {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  tags?: string[];
  dueDate?: string | null;
  subtasks?: OldSubtask[];
  createdAt?: string;
  completedAt?: string;
}

interface ImportData {
  projects: OldProject[];
  archived?: OldProject[];
}

// POST /api/kanban/import - Import from old kanban format
export const POST = withAuth(async (req: NextRequest, user: AuthUser) => {
  try {
    const data: ImportData = await req.json();
    const { projects: oldProjects, archived: oldArchived } = data;

    // Get or create default workspace
    let workspace = await prisma.workspace.findFirst();
    if (!workspace) {
      workspace = await prisma.workspace.create({
        data: {
          name: 'Main Workspace',
          slug: 'main',
          members: {
            create: { userId: user.id, role: 'owner' },
          },
        },
      });
    }

    // Group projects by their tags to create Mission Control projects
    const projectGroups: Map<string, OldProject[]> = new Map();
    
    // Combine active and archived
    const allOldProjects = [...(oldProjects || []), ...(oldArchived || [])];
    
    for (const proj of allOldProjects) {
      // Use first tag as project grouping, or "General"
      const projectKey = proj.tags?.[0] || 'general';
      if (!projectGroups.has(projectKey)) {
        projectGroups.set(projectKey, []);
      }
      projectGroups.get(projectKey)!.push(proj);
    }

    const results = {
      projectsCreated: 0,
      tasksCreated: 0,
      subtasksCreated: 0,
    };

    // Create a project for each group
    for (const [groupName, groupProjects] of projectGroups) {
      // Create project with columns
      const project = await prisma.project.create({
        data: {
          name: groupName.charAt(0).toUpperCase() + groupName.slice(1).replace(/-/g, ' '),
          description: `Imported from kanban - ${groupName}`,
          color: getColorForGroup(groupName),
          workspaceId: workspace.id,
          position: results.projectsCreated,
          columns: {
            create: [
              { name: 'Backlog', position: 0, color: '#9CA3AF' },
              { name: 'In Progress', position: 1, color: '#3B82F6' },
              { name: 'Done', position: 2, color: '#10B981' },
            ],
          },
        },
        include: { columns: true },
      });
      results.projectsCreated++;

      // Map status to column
      const columnMap: Record<string, string> = {
        'backlog': project.columns.find(c => c.name === 'Backlog')!.id,
        'in-progress': project.columns.find(c => c.name === 'In Progress')!.id,
        'done': project.columns.find(c => c.name === 'Done')!.id,
      };

      // Create tasks for each old project
      for (let i = 0; i < groupProjects.length; i++) {
        const oldProj = groupProjects[i];
        const columnId = columnMap[oldProj.status] || columnMap['backlog'];
        const isArchived = (oldArchived || []).some(a => a.id === oldProj.id);

        await prisma.task.create({
          data: {
            title: oldProj.title.replace(/✅$/, '').trim(),
            description: oldProj.description,
            priority: mapPriority(oldProj.priority),
            position: i,
            dueDate: oldProj.dueDate ? new Date(oldProj.dueDate) : null,
            completedAt: oldProj.completedAt ? new Date(oldProj.completedAt) : null,
            archived: isArchived,
            columnId,
            createdById: user.id,
            subtasks: oldProj.subtasks ? {
              create: oldProj.subtasks.map((s, idx) => ({
                title: s.text,
                completed: s.done,
                position: idx,
              })),
            } : undefined,
          },
        });
        results.tasksCreated++;
        results.subtasksCreated += oldProj.subtasks?.length || 0;
      }
    }

    return ok({
      success: true,
      ...results,
    });
  } catch (error) {
    console.error('Import failed:', error);
    return serverError('Import failed: ' + String(error));
  }
});

function mapPriority(priority?: string): string {
  switch (priority?.toLowerCase()) {
    case 'high': return 'high';
    case 'urgent': return 'urgent';
    case 'low': return 'low';
    default: return 'medium';
  }
}

function getColorForGroup(group: string): string {
  const colors: Record<string, string> = {
    'tends2trend': '#FF6B35',
    'infrastructure': '#8B6BFF',
    'side-project': '#00C8B4',
    'feature': '#FFB43C',
    'bug': '#EF4444',
    'milestone': '#10B981',
    'general': '#5865F2',
  };
  return colors[group.toLowerCase()] || '#5865F2';
}
