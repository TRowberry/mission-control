'use client';

import Link from 'next/link';
import { Bot, Brain, TestTube2, Settings, ChevronRight } from 'lucide-react';

const settingsSections = [
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

export default function SettingsPage() {
  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Settings className="w-8 h-8 text-gray-400" />
          <h1 className="text-2xl font-bold text-white">Settings</h1>
        </div>
        <p className="text-gray-400">
          Workspace administration and configuration
        </p>
      </div>

      <div className="grid gap-4">
        {settingsSections.map((section) => {
          const Icon = section.icon;
          return (
            <Link
              key={section.href}
              href={section.href}
              className="group flex items-center gap-4 p-4 bg-gray-800/50 border border-gray-700/50 rounded-lg hover:bg-gray-700/50 hover:border-gray-600 transition-colors"
            >
              <div className={`p-3 rounded-lg ${section.color}`}>
                <Icon className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h3 className="font-medium text-white group-hover:text-indigo-400 transition-colors">
                  {section.title}
                </h3>
                <p className="text-sm text-gray-400">
                  {section.description}
                </p>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-500 group-hover:text-gray-400 transition-colors" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
