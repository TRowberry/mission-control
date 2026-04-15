'use client';

import Link from 'next/link';
import { Bot, Brain, TestTube2, Settings, ChevronRight, Users, Link2, LayoutGrid } from 'lucide-react';
import { useWorkspace } from '@/components/providers/WorkspaceContext';

function WorkspaceAvatar({ name, icon }: { name: string; icon: string | null }) {
  if (icon) return <span className="text-base leading-none">{icon}</span>;
  const initials = name.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  return <span className="text-xs font-bold">{initials}</span>;
}

const workspaceSections = [
  {
    title: 'General',
    description: 'Name, icon, description, and danger zone',
    href: '/settings/workspace',
    icon: Settings,
    color: 'bg-blue-500/20 text-blue-400',
  },
  {
    title: 'Members',
    description: 'View and manage roles, remove members',
    href: '/settings/workspace?tab=members',
    icon: Users,
    color: 'bg-sky-500/20 text-sky-400',
  },
  {
    title: 'Invites',
    description: 'Create invite links and manage pending invitations',
    href: '/settings/workspace?tab=invites',
    icon: Link2,
    color: 'bg-cyan-500/20 text-cyan-400',
  },
];

const platformSections = [
  {
    title: 'Agents',
    description: 'Configure AI agents, their roles, capabilities, and rate limits',
    href: '/settings/agents',
    icon: Bot,
    color: 'bg-indigo-500/20 text-indigo-400',
  },
  {
    title: 'LLM Providers',
    description: 'Manage AI model providers (Ollama, OpenAI, Anthropic, OpenClaw)',
    href: '/settings/llm-providers',
    icon: Brain,
    color: 'bg-purple-500/20 text-purple-400',
  },
  {
    title: 'QA Testing',
    description: 'Run quality assurance tests and view test results',
    href: '/qa',
    icon: TestTube2,
    color: 'bg-green-500/20 text-green-400',
  },
];

function SectionCard({ href, icon: Icon, color, title, description }: {
  href: string;
  icon: React.ElementType;
  color: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 md:gap-4 p-4 min-h-[64px] bg-gray-800/50 border border-gray-700/50 rounded-lg hover:bg-gray-700/50 hover:border-gray-600 transition-colors"
    >
      <div className={`p-3 rounded-lg ${color}`}>
        <Icon className="w-6 h-6" />
      </div>
      <div className="flex-1">
        <h3 className="font-medium text-white group-hover:text-indigo-400 transition-colors">
          {title}
        </h3>
        <p className="text-sm text-gray-400">{description}</p>
      </div>
      <ChevronRight className="w-5 h-5 text-gray-500 group-hover:text-gray-400 transition-colors" />
    </Link>
  );
}

export default function SettingsPage() {
  const { activeWorkspace } = useWorkspace();

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6">
      <div className="mb-6 md:mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Settings className="w-7 h-7 md:w-8 md:h-8 text-gray-400" />
          <h1 className="text-xl sm:text-2xl font-bold text-white">Settings</h1>
        </div>
        <p className="text-gray-400">Workspace and platform configuration</p>
      </div>

      {/* Workspace section */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          {activeWorkspace ? (
            <>
              <div className="w-5 h-5 rounded flex items-center justify-center bg-gray-700 text-white shrink-0">
                <WorkspaceAvatar name={activeWorkspace.name} icon={activeWorkspace.icon} />
              </div>
              <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
                {activeWorkspace.name}
              </h2>
            </>
          ) : (
            <>
              <LayoutGrid className="w-4 h-4 text-gray-500" />
              <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Workspace</h2>
            </>
          )}
        </div>
        <div className="grid gap-3">
          {workspaceSections.map((s) => (
            <SectionCard key={s.href} {...s} />
          ))}
        </div>
      </div>

      {/* Platform section */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Settings className="w-4 h-4 text-gray-500" />
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Platform</h2>
        </div>
        <div className="grid gap-3">
          {platformSections.map((s) => (
            <SectionCard key={s.href} {...s} />
          ))}
        </div>
      </div>
    </div>
  );
}
