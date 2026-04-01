import Link from 'next/link';
import { Rocket, MessageSquare, LayoutGrid, Users, Zap } from 'lucide-react';

export default function Home() {
  const registrationEnabled = process.env.REGISTRATION_DISABLED !== 'true';
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1a1b1e] via-[#2f3136] to-[#1a1b1e]">
      {/* Header */}
      <header className="container mx-auto px-4 py-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Rocket className="w-8 h-8 text-primary" />
          <span className="text-xl font-bold">Mission Control</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/login" className="btn btn-ghost">
            Log in
          </Link>
          {registrationEnabled && (
            <Link href="/register" className="btn btn-primary">
              Get Started
            </Link>
          )}
        </div>
      </header>

      {/* Hero */}
      <main className="container mx-auto px-4 py-20">
        <div className="text-center max-w-3xl mx-auto">
          <h1 className="text-5xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-white via-gray-200 to-gray-400 bg-clip-text text-transparent">
            Your Team&apos;s Command Center
          </h1>
          <p className="text-xl text-gray-400 mb-10">
            Kanban boards, real-time chat, and seamless collaboration — all in one place.
            Built for teams who ship fast.
          </p>
          <div className="flex items-center justify-center gap-4">
            {registrationEnabled ? (
              <Link href="/register" className="btn btn-primary px-8 py-3 text-lg">
                Start for Free
              </Link>
            ) : (
              <Link href="/login" className="btn btn-primary px-8 py-3 text-lg">
                Sign In
              </Link>
            )}
            <Link href="/demo" className="btn btn-secondary px-8 py-3 text-lg">
              Live Demo
            </Link>
          </div>
        </div>

        {/* Features */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mt-24">
          <FeatureCard
            icon={<LayoutGrid className="w-8 h-8" />}
            title="Kanban Boards"
            description="Drag-and-drop task management with projects, tags, and deadlines."
          />
          <FeatureCard
            icon={<MessageSquare className="w-8 h-8" />}
            title="Real-time Chat"
            description="Discord-style channels, threads, and direct messages."
          />
          <FeatureCard
            icon={<Users className="w-8 h-8" />}
            title="Team Workspaces"
            description="Invite members, set roles, and collaborate seamlessly."
          />
          <FeatureCard
            icon={<Zap className="w-8 h-8" />}
            title="Instant Updates"
            description="Real-time sync across all devices. Never miss a beat."
          />
        </div>

        {/* Screenshot/Preview placeholder */}
        <div className="mt-24 rounded-xl bg-[#202225] border border-gray-700 p-4 shadow-2xl">
          <div className="aspect-video rounded-lg bg-gradient-to-br from-[#36393F] to-[#2F3136] flex items-center justify-center">
            <p className="text-gray-500 text-lg">App Preview</p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="container mx-auto px-4 py-10 text-center text-gray-500">
        <p>Built with ❤️ by Tim & Rico</p>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="card hover:bg-[#34373C] transition-colors">
      <div className="text-primary mb-4">{icon}</div>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-gray-400 text-sm">{description}</p>
    </div>
  );
}
