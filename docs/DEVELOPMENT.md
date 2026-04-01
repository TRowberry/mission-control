# Mission Control Development Guide

## ⚠️ Development Workflow (MANDATORY)

### Before Writing Code
- [ ] **Read this document** - understand architecture and file locations
- [ ] **Check existing code** - don't duplicate functionality that exists

### While Coding
- [ ] **Update docs** as you add features or change architecture
- [ ] **Keep DEVELOPMENT.md current** - if you discover something, document it

### Before Deploying
- [ ] **Verify file paths** - double-check scp destinations match source structure
- [ ] **Build passes** - no TypeScript or compilation errors
- [ ] **Sync files correctly** - confirm files landed in right directories

### After Deploying
- [ ] **Run QA tests** (if configured)
- [ ] **Hard refresh** and manually verify changes work

---

## Overview

Mission Control is a self-hosted project management suite with Discord-style chat, designed to run via Docker on any Linux server or NAS.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Your Server/NAS                         │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Docker Compose Stack                    │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────────────────┐  │   │
│  │  │PostgreSQL│  │  Redis  │  │    Next.js App     │  │   │
│  │  │  :5432   │  │  :6379  │  │  :3000 (public)    │  │   │
│  │  │  (db-1)  │  │(redis-1)│  │     (app-1)        │  │   │
│  │  └─────────┘  └─────────┘  └─────────────────────┘  │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
mission-control/
├── app/                    # Next.js App Router
│   ├── (dashboard)/       # Authenticated routes (layout with sidebar)
│   │   ├── chat/[channelId]/
│   │   ├── kanban/
│   │   ├── pages/
│   │   └── settings/
│   ├── api/               # API Routes
│   │   ├── agents/        # Agent API (uses X-API-Key auth)
│   │   ├── auth/          # Login/logout/register
│   │   ├── chat/          # Messages, reactions, threads
│   │   ├── kanban/        # Tasks, projects, columns
│   │   └── ...
│   ├── login/
│   └── register/
├── components/            # React Components
│   ├── chat/             # Chat UI (MessageItem, MessageList, etc.)
│   ├── kanban/           # Kanban UI (KanbanBoard, TaskPanel, etc.)
│   ├── layout/           # Sidebar, navigation
│   └── ui/               # Shared UI components
├── lib/                  # Utilities
│   ├── auth.ts          # JWT auth helpers
│   ├── db.ts            # Prisma client export
│   └── utils.ts         # General utilities
├── prisma/
│   └── schema.prisma    # Database schema
├── docs/                 # Documentation
├── server.js            # Custom server (Socket.io)
├── docker-compose.yml
├── Dockerfile
└── .env                 # Environment variables (DO NOT COMMIT)
```

## Key Files

| File | Purpose |
|------|---------|
| `lib/db.ts` | Prisma client - import as `import { prisma } from '@/lib/db'` |
| `lib/auth.ts` | `getCurrentUser()`, `verifyToken()` |
| `lib/agent-auth.ts` | `getAgentFromRequest()` for X-API-Key auth |
| `server.js` | Custom Next.js server with Socket.io |
| `prisma/schema.prisma` | Database models |

## Environment Setup

### Docker Compose (IMPORTANT!)

**`docker-compose.yml` is NOT tracked in git** - it contains secrets!

1. Copy the template:
   ```bash
   cp docker-compose.template.yml docker-compose.yml
   ```

2. Edit `docker-compose.yml` and replace all `<PLACEHOLDER>` values:
   - `<YOUR_DB_PASSWORD>` - PostgreSQL password
   - `<YOUR_HOST_IP>` - Your server's IP (e.g., `10.0.0.206`)
   - `<YOUR_JWT_SECRET>` - Random string for JWT signing
   - `<YOUR_PUBLIC_URL>` - Public URL (e.g., `https://yourapp.example.com`)
   - `<YOUR_OPENCLAW_GATEWAY_URL>` - OpenClaw gateway URL
   - `<YOUR_OPENCLAW_TOKEN>` - OpenClaw auth token

3. Similarly for Caddyfile:
   ```bash
   cp Caddyfile.template Caddyfile
   # Edit with your domain
   ```

⚠️ **Never commit `docker-compose.yml` or `Caddyfile`** - they contain secrets!

### Application Environment

Copy `.env.example` to `.env` and configure:

```bash
# Database (for Docker internal network)
DATABASE_URL=postgresql://postgres:postgres@db:5432/mission_control

# JWT Secret (generate a random string)
JWT_SECRET=your-secret-key-here

# Server URL (your deployment URL)
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Development Workflow

### 1. Make Changes Locally

Edit files in your local `mission-control/` directory.

### 2. Commit and Push to GitHub

```bash
cd mission-control
git add -A
git commit -m "feat: description of changes"
git push origin main
```

### 3. Pull Changes on Server (GraySkull)

```bash
ssh grayskull
cd ~/apps/mission-control
git pull origin main
```

### 4. Build and Deploy

```bash
docker compose build --no-cache app
docker compose up -d --force-recreate app
```

Build takes ~2-3 minutes. Watch for:
- `✓ Compiled successfully` - Webpack passed
- `Linting and checking validity of types` - TypeScript check
- `Generating static pages` - Build nearly done

### Quick Deploy (One-liner from local)

```bash
ssh grayskull "cd ~/apps/mission-control && git pull && docker compose build && docker compose up -d"
```

⚠️ **IMPORTANT:** Always use git for deployments. Do NOT use SCP to copy files directly.

### 5. Verify

- Open your Mission Control URL
- Hard refresh (Ctrl+Shift+R) to clear cache
- Check browser console for errors

## Common Operations

### View Container Logs
```bash
docker logs mission-control-app-1 --tail 100
```

### Restart Without Rebuild
```bash
docker compose restart app
```

### Database Access
```bash
docker exec -it mission-control-db-1 psql -U postgres -d mission_control
```

### Run Prisma Migrations
```bash
docker exec mission-control-app-1 npx prisma migrate deploy
```

## Agent Integration

Agents authenticate via `X-API-Key` header, not cookies.

### Agent API Endpoints
- `GET /api/agents/feed?since=<ISO>` - Poll for new messages
- `POST /api/agents/messages` - Send a message
- `GET /api/agents/channels` - List channels

### Testing Agent API
```bash
curl -H "X-API-Key: your_agent_api_key" "http://localhost:3000/api/agents/feed?since=2026-01-01T00:00:00Z"
```

## Troubleshooting

### Build Fails with Module Not Found
- Check file was copied to correct directory
- Verify import paths match actual file locations
- Run `ls` on remote to confirm files exist

### TypeScript Errors
- Check for missing imports (especially types like `ReactNode`)
- Verify function signatures match expected types
- Look at the exact line number in the error

### Changes Not Appearing
- Hard refresh browser (Ctrl+Shift+R)
- Check container was actually recreated: `docker ps` shows recent start time
- View logs for startup errors

### Database Connection Issues
- Container uses internal Docker DNS: `DATABASE_URL=postgresql://postgres:postgres@db:5432/mission_control`
- From host machine, use IP: `postgresql://postgres:postgres@localhost:5432/mission_control`

## Security Checklist

Before deploying changes:
- [ ] No hardcoded secrets in code
- [ ] API routes check authentication (`getCurrentUser()` or `getAgentFromRequest()`)
- [ ] Destructive operations verify ownership/admin role
- [ ] User input is sanitized before rendering
