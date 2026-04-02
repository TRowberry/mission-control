'use client';

interface ActivityPanelProps {
  projectId: string;
  onClose?: () => void;
}

export default function ActivityPanel({ projectId, onClose }: ActivityPanelProps) {
  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-white">Activity</h2>
        {onClose && (
          <button 
            onClick={onClose}
            className="text-zinc-400 hover:text-white"
          >
            ✕
          </button>
        )}
      </div>
      <p className="text-zinc-400 text-sm">Activity panel coming soon...</p>
    </div>
  );
}
