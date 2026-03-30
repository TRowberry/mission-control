import { PagesProvider } from '@/contexts/PagesContext';

export default function PagesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PagesProvider>
      {children}
    </PagesProvider>
  );
}
