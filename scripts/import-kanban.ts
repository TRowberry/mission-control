/**
 * Import kanban/projects.json into Mission Control database
 * 
 * Usage: npx tsx scripts/import-kanban.ts
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

interface JsonSubtask {
  text: string;
  done: boolean;
}

interface JsonProject {
  id: string;
  title: string;
  description: string;
  status: 'backlog' | 'in-progress' | 'done';
  priority: 'low' | 'medium' | 'high';
  tags: string[];
  dueDate: string | null;
  subtasks: JsonSubtask[];
  createdAt: string;
  completedAt?: string;
}

interface KanbanData {
  projects: JsonProject[];
  archived: { id: string; title: string; status: string; tags: string[] }[];
}

async function main() {
  // Read the JSON file
  const jsonPath = path.resolve(__dirname, '../../kanban/projects.json');
  
  if (!fs.existsSync(jsonPath)) {
    console.error('❌ kanban/projects.json not found at:', jsonPath);
    process.exit(1);
  }

  const data: KanbanData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  console.log(`📂 Found ${data.projects.length} active projects, ${data.archived.length} archived`);

  // Find or create a workspace
  let workspace = await prisma.workspace.findFirst();
  if (!workspace) {
    workspace = await prisma.workspace.create({
      data: {
        name: 'Mission Control',
        slug: 'mission-control',
      },
    });
    console.log('✅ Created workspace:', workspace.name);
  } else {
    console.log('✅ Using workspace:', workspace.name);
  }

  // Create a single project called "Rico's Projects" to hold all tasks
  let project = await prisma.project.findFirst({
    where: { id: 'rico-projects' },
  });
  
  if (!project) {
    project = await prisma.project.create({
      data: {
        id: 'rico-projects',
        name: "Rico's Projects",
        description: 'Imported from kanban/projects.json',
        workspaceId: workspace.id,
      },
    });
    console.log('✅ Created project:', project.name);
  } else {
    console.log('✅ Found project:', project.name);
  }

  // Find or create a default user for task ownership
  let user = await prisma.user.findFirst({
    where: { email: 'tim@missioncontrol.local' },
  });
  if (!user) {
    user = await prisma.user.create({
      data: {
        username: 'tim',
        email: 'tim@missioncontrol.local',
        displayName: 'Tim',
        password: '', // Won't be used for login
      },
    });
    console.log('✅ Created user:', user.displayName);
  } else {
    console.log('✅ Using user:', user.displayName);
  }

  // Create default columns if they don't exist
  const columnDefs = [
    { name: 'Backlog', position: 0 },
    { name: 'In Progress', position: 1 },
    { name: 'Done', position: 2 },
  ];

  const columns: Record<string, string> = {};
  for (const colDef of columnDefs) {
    // Column doesn't have a unique constraint on projectId+name, so check manually
    let col = await prisma.column.findFirst({
      where: { projectId: project.id, name: colDef.name },
    });
    
    if (!col) {
      col = await prisma.column.create({
        data: {
          name: colDef.name,
          position: colDef.position,
          projectId: project.id,
        },
      });
    }
    columns[colDef.name.toLowerCase().replace(' ', '-')] = col.id;
  }
  console.log('✅ Columns ready');

  // Map status to column
  const statusToColumn: Record<string, string> = {
    'backlog': columns['backlog'],
    'in-progress': columns['in-progress'],
    'done': columns['done'],
  };

  // Collect all unique tags
  const allTags = new Set<string>();
  for (const proj of data.projects) {
    proj.tags?.forEach(t => allTags.add(t));
  }

  // Create tags with colors (tags are project-scoped)
  const tagColors: Record<string, string> = {
    'tends2trend': '#FF6B35',
    'feature': '#8B6BFF',
    'milestone': '#FFB43C',
    'infrastructure': '#00C8B4',
    'ai': '#6366F1',
    'research': '#EC4899',
    'side-project': '#14B8A6',
    'backend': '#F97316',
    'active': '#22C55E',
    'bug': '#EF4444',
    'website': '#3B82F6',
    'analytics': '#A855F7',
    'ml': '#06B6D4',
    'creative': '#F472B6',
    'worldbuilding': '#84CC16',
    'frontend': '#0EA5E9',
  };

  const tagMap: Record<string, string> = {};
  for (const tagName of allTags) {
    const tag = await prisma.tag.upsert({
      where: { 
        projectId_name: {
          projectId: project.id,
          name: tagName,
        }
      },
      update: {},
      create: {
        name: tagName,
        color: tagColors[tagName] || '#6B7280',
        projectId: project.id,
      },
    });
    tagMap[tagName] = tag.id;
  }
  console.log(`✅ Created ${allTags.size} tags`);

  // Import active projects as tasks
  let taskOrder = 0;
  for (const proj of data.projects) {
    const columnId = statusToColumn[proj.status] || columns['backlog'];
    
    // Check if task already exists (by matching title in same project)
    const existing = await prisma.task.findFirst({
      where: {
        columnId: { in: Object.values(columns) },
        title: proj.title,
      },
    });

    if (existing) {
      console.log(`⏭️  Skipping existing: ${proj.title}`);
      continue;
    }

    const task = await prisma.task.create({
      data: {
        title: proj.title,
        description: proj.description || null,
        priority: proj.priority || 'medium',
        position: taskOrder++,
        columnId,
        dueDate: proj.dueDate ? new Date(proj.dueDate) : null,
        createdById: user.id,
      },
    });

    // Add tags
    if (proj.tags?.length) {
      await prisma.taskTag.createMany({
        data: proj.tags.map(t => ({
          taskId: task.id,
          tagId: tagMap[t],
        })),
        skipDuplicates: true,
      });
    }

    // Add subtasks
    if (proj.subtasks?.length) {
      await prisma.subtask.createMany({
        data: proj.subtasks.map((st, i) => ({
          title: st.text,
          completed: st.done,
          position: i,
          taskId: task.id,
        })),
      });
    }

    console.log(`✅ Imported: ${proj.title} (${proj.status})`);
  }

  console.log('\n🎉 Import complete!');
  console.log(`   Project: ${project.name}`);
  console.log(`   Tasks: ${data.projects.length}`);
  console.log(`   Tags: ${allTags.size}`);
}

main()
  .catch((e) => {
    console.error('❌ Import failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
