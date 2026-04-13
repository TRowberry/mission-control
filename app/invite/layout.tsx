import { WorkspaceProvider } from '@/components/providers/WorkspaceContext';

export default function InviteLayout({ children }: { children: React.ReactNode }) {
  return <WorkspaceProvider>{children}</WorkspaceProvider>;
}
