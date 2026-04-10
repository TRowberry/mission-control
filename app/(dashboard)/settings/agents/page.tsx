'use client';

import AgentList from '@/components/agents/AgentList';

export default function AgentsSettingsPage() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto p-4 md:p-6">
        <AgentList />
      </div>
    </div>
  );
}
