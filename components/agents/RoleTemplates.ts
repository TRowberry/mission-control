/**
 * Role Templates for Agent Creation
 */

export interface RoleTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  systemPrompt: string;
  llmProvider: string;
  llmModel: string;
  canSendMessages: boolean;
  canEditTasks: boolean;
  canCreateTasks: boolean;
  canCreateSubtasks: boolean;
  canNotifyUsers: boolean;
  actionsPerMinute: number;
  actionsPerHour: number;
  dailyTokenLimit?: number;
  memoryLimitMb: number;
  cpuLimit: number;
  timeoutSeconds: number;
  triggerType: 'manual' | 'scheduled' | 'event';
  cronSchedule?: string;
}

export const ROLE_TEMPLATES: RoleTemplate[] = [
  {
    id: 'project-manager',
    name: 'Project Manager',
    description: 'Monitors deadlines, sends reminders, and creates weekly summaries',
    icon: '📋',
    systemPrompt: `You are a Project Manager agent. Your responsibilities:
1. Monitor task deadlines and notify assignees
2. Track project progress and identify blockers
3. Generate weekly status summaries
4. Flag overdue tasks
Communicate professionally and concisely.`,
    llmProvider: 'ollama',
    llmModel: 'llama3.2',
    canSendMessages: true,
    canEditTasks: true,
    canCreateTasks: false,
    canCreateSubtasks: false,
    canNotifyUsers: true,
    actionsPerMinute: 10,
    actionsPerHour: 100,
    dailyTokenLimit: 50000,
    memoryLimitMb: 512,
    cpuLimit: 0.5,
    timeoutSeconds: 300,
    triggerType: 'scheduled',
    cronSchedule: '0 9 * * 1-5',
  },
  {
    id: 'qa-tester',
    name: 'QA Tester',
    description: 'Runs post-deploy tests and reports failures',
    icon: '🧪',
    systemPrompt: `You are a QA Tester agent. Your responsibilities:
1. Run automated tests after deployments
2. Report test failures with detailed error info
3. Create bug tickets for issues
4. Verify bug fixes
Be precise in error reporting.`,
    llmProvider: 'ollama',
    llmModel: 'llama3.2',
    canSendMessages: true,
    canEditTasks: true,
    canCreateTasks: true,
    canCreateSubtasks: true,
    canNotifyUsers: true,
    actionsPerMinute: 20,
    actionsPerHour: 200,
    dailyTokenLimit: 100000,
    memoryLimitMb: 1024,
    cpuLimit: 1.0,
    timeoutSeconds: 600,
    triggerType: 'event',
  },
  {
    id: 'documentation-bot',
    name: 'Documentation Bot',
    description: 'Detects code changes and suggests documentation updates',
    icon: '📝',
    systemPrompt: `You are a Documentation Bot. Your responsibilities:
1. Monitor code changes and identify doc gaps
2. Suggest updates to README files
3. Generate documentation drafts
4. Flag outdated documentation
Write clear, concise documentation.`,
    llmProvider: 'ollama',
    llmModel: 'llama3.2',
    canSendMessages: true,
    canEditTasks: true,
    canCreateTasks: true,
    canCreateSubtasks: true,
    canNotifyUsers: false,
    actionsPerMinute: 5,
    actionsPerHour: 50,
    dailyTokenLimit: 75000,
    memoryLimitMb: 512,
    cpuLimit: 0.5,
    timeoutSeconds: 300,
    triggerType: 'event',
  },
  {
    id: 'standup-bot',
    name: 'Standup Bot',
    description: 'Collects daily updates and generates team summaries',
    icon: '☀️',
    systemPrompt: `You are a Standup Bot. Your responsibilities:
1. Prompt team members for daily updates
2. Collect and organize responses
3. Generate daily team summaries
4. Track blockers and progress
Be friendly and encouraging.`,
    llmProvider: 'ollama',
    llmModel: 'llama3.2',
    canSendMessages: true,
    canEditTasks: false,
    canCreateTasks: false,
    canCreateSubtasks: false,
    canNotifyUsers: true,
    actionsPerMinute: 15,
    actionsPerHour: 60,
    dailyTokenLimit: 30000,
    memoryLimitMb: 256,
    cpuLimit: 0.25,
    timeoutSeconds: 180,
    triggerType: 'scheduled',
    cronSchedule: '0 9 * * 1-5',
  },
  {
    id: 'custom',
    name: 'Custom Agent',
    description: 'Start from scratch with full customization',
    icon: '⚙️',
    systemPrompt: `You are a custom agent. Define your role here.`,
    llmProvider: 'ollama',
    llmModel: 'llama3.2',
    canSendMessages: true,
    canEditTasks: true,
    canCreateTasks: false,
    canCreateSubtasks: false,
    canNotifyUsers: true,
    actionsPerMinute: 10,
    actionsPerHour: 100,
    memoryLimitMb: 512,
    cpuLimit: 0.5,
    timeoutSeconds: 300,
    triggerType: 'manual',
  },
];

export function getTemplateById(id: string): RoleTemplate | undefined {
  return ROLE_TEMPLATES.find(t => t.id === id);
}

export function getDefaultTemplate(): RoleTemplate {
  return ROLE_TEMPLATES.find(t => t.id === 'custom')!;
}
