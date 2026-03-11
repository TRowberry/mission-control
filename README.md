# Mission Control 🚀

All-in-one project management suite with Kanban boards and Discord-style chat.

## Features

- **Kanban Board** - Drag-and-drop task management with projects, tags, and assignments
- **Real-time Chat** - Channels, DMs, threads, file sharing, @mentions
- **User Management** - Invite system, roles (admin/member/guest)
- **Notifications** - Real-time alerts + configurable digests
- **API Hooks** - Integration points for bots and automation

## Tech Stack

- **Frontend:** Next.js 14 (React) with App Router
- **Styling:** Tailwind CSS
- **Database:** PostgreSQL (SQLite for dev)
- **ORM:** Prisma
- **Real-time:** Socket.io
- **Auth:** JWT with bcrypt

## Getting Started

```bash
# Install dependencies
npm install

# Set up database
cp .env.example .env
npm run db:push
npm run db:seed

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Project Structure

```
mission-control/
├── app/                    # Next.js App Router
│   ├── (auth)/            # Auth pages (login, register, invite)
│   ├── (dashboard)/       # Main app pages
│   │   ├── chat/          # Chat channels and DMs
│   │   ├── kanban/        # Kanban boards
│   │   ├── settings/      # User and workspace settings
│   │   └── page.tsx       # Dashboard home
│   ├── api/               # API routes
│   │   ├── auth/          # Auth endpoints
│   │   ├── chat/          # Chat endpoints
│   │   ├── kanban/        # Kanban endpoints
│   │   └── socket/        # WebSocket handler
│   ├── layout.tsx
│   └── page.tsx
├── components/            # Reusable UI components
│   ├── chat/             # Chat-specific components
│   ├── kanban/           # Kanban-specific components
│   ├── ui/               # Base UI components
│   └── layout/           # Layout components
├── lib/                  # Utilities and helpers
│   ├── db.ts            # Prisma client
│   ├── auth.ts          # Auth utilities
│   ├── socket.ts        # Socket.io client
│   └── utils.ts         # General utilities
├── hooks/               # Custom React hooks
├── stores/              # Zustand state stores
├── prisma/              # Database schema and migrations
│   ├── schema.prisma
│   └── seed.js
├── public/              # Static assets
└── types/               # TypeScript types
```

## Deployment

Mission Control can be deployed via Docker on any Linux server, NAS, or cloud instance.

1. Clone this repo
2. Copy `.env.example` to `.env` and configure
3. Run `docker compose up -d`
4. Access at `http://your-server:3000`

See [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md) for detailed instructions.
