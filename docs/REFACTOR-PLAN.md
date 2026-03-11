# Mission Control Refactor Plan - Modular Architecture

## Philosophy

Build reusable modules once, use everywhere. When adding features, check if a module exists before writing new code.

---

## Module Structure

```
lib/
├── db.ts                    # ✅ Exists - Prisma client
├── auth.ts                  # ✅ Exists - Core auth (needs expansion)
├── modules/
│   ├── api/
│   │   ├── response.ts      # 🆕 Standardized API responses
│   │   ├── errors.ts        # 🆕 Error types and handlers
│   │   ├── middleware.ts    # 🆕 Route wrappers (withAuth, withAgent)
│   │   └── validation.ts    # 🆕 Input validation helpers
│   ├── client/
│   │   └── api.ts           # 🆕 Frontend fetch wrapper
│   └── utils/
│       ├── dates.ts         # 🆕 Consolidated date formatting
│       └── strings.ts       # 🆕 Slug generation, sanitization
```

---

## Module 1: API Response (`lib/modules/api/response.ts`)

**Purpose:** Standardized API responses across all routes.

```typescript
import { NextResponse } from 'next/server';

// Success responses
export function ok<T>(data: T) {
  return NextResponse.json(data, { status: 200 });
}

export function created<T>(data: T) {
  return NextResponse.json(data, { status: 201 });
}

export function noContent() {
  return new NextResponse(null, { status: 204 });
}

// Error responses
export function badRequest(message: string, details?: Record<string, string>) {
  return NextResponse.json({ error: message, details }, { status: 400 });
}

export function unauthorized(message = 'Unauthorized') {
  return NextResponse.json({ error: message }, { status: 401 });
}

export function forbidden(message = 'Forbidden') {
  return NextResponse.json({ error: message }, { status: 403 });
}

export function notFound(message = 'Not found') {
  return NextResponse.json({ error: message }, { status: 404 });
}

export function serverError(message: string, error?: unknown) {
  if (error) console.error(`[API Error] ${message}:`, error);
  return NextResponse.json({ error: message }, { status: 500 });
}
```

**Usage:**
```typescript
// Before
return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

// After
import { unauthorized } from '@/lib/modules/api/response';
return unauthorized();
```

---

## Module 2: API Middleware (`lib/modules/api/middleware.ts`)

**Purpose:** Route wrappers that handle common patterns.

```typescript
import { NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getAgentFromRequest } from '@/lib/agent-auth';
import { unauthorized, serverError } from './response';

type User = { id: string; username: string; /* ... */ };
type Agent = { id: string; username: string; isAgent: true };

// Wrapper for routes requiring user auth
export function withAuth(
  handler: (req: NextRequest, user: User) => Promise<Response>
) {
  return async (req: NextRequest) => {
    try {
      const user = await getCurrentUser();
      if (!user) return unauthorized();
      return await handler(req, user);
    } catch (error) {
      return serverError('Request failed', error);
    }
  };
}

// Wrapper for routes requiring agent auth (X-API-Key)
export function withAgent(
  handler: (req: NextRequest, agent: Agent) => Promise<Response>
) {
  return async (req: NextRequest) => {
    try {
      const agent = await getAgentFromRequest(req);
      if (!agent) return unauthorized('Invalid API key');
      return await handler(req, agent);
    } catch (error) {
      return serverError('Request failed', error);
    }
  };
}

// Wrapper accepting either user OR agent auth
export function withAnyAuth(
  handler: (req: NextRequest, actor: User | Agent) => Promise<Response>
) {
  return async (req: NextRequest) => {
    try {
      // Try agent auth first (API key header)
      const agent = await getAgentFromRequest(req);
      if (agent) return await handler(req, agent);
      
      // Fall back to user auth (cookie)
      const user = await getCurrentUser();
      if (user) return await handler(req, user);
      
      return unauthorized();
    } catch (error) {
      return serverError('Request failed', error);
    }
  };
}
```

**Usage:**
```typescript
// Before (repeated in every route)
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // ... actual logic
  } catch (error) {
    console.error('Failed:', error);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

// After (clean, focused on business logic)
import { withAuth } from '@/lib/modules/api/middleware';
import { ok } from '@/lib/modules/api/response';

export const GET = withAuth(async (req, user) => {
  const data = await prisma.thing.findMany({ where: { userId: user.id } });
  return ok(data);
});
```

---

## Module 3: API Client (`lib/modules/client/api.ts`)

**Purpose:** Frontend fetch wrapper with error handling.

```typescript
type ApiResponse<T> = { data: T; error?: never } | { data?: never; error: string };

class ApiClient {
  private baseUrl = '';

  private async request<T>(
    url: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    try {
      const res = await fetch(this.baseUrl + url, {
        ...options,
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        return { error: body.error || `Request failed: ${res.status}` };
      }

      // Handle 204 No Content
      if (res.status === 204) {
        return { data: null as T };
      }

      const data = await res.json();
      return { data };
    } catch (err) {
      return { error: 'Network error' };
    }
  }

  get<T>(url: string) {
    return this.request<T>(url, { method: 'GET' });
  }

  post<T>(url: string, body: unknown) {
    return this.request<T>(url, { method: 'POST', body: JSON.stringify(body) });
  }

  patch<T>(url: string, body: unknown) {
    return this.request<T>(url, { method: 'PATCH', body: JSON.stringify(body) });
  }

  delete<T>(url: string) {
    return this.request<T>(url, { method: 'DELETE' });
  }
}

export const api = new ApiClient();
```

**Usage:**
```typescript
// Before (scattered everywhere)
const res = await fetch('/api/chat/messages', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({ content, channelId }),
});
if (!res.ok) { /* error handling */ }
const data = await res.json();

// After (clean, consistent)
import { api } from '@/lib/modules/client/api';

const { data, error } = await api.post('/api/chat/messages', { content, channelId });
if (error) {
  toast.error(error);
  return;
}
// use data
```

---

## Module 4: Date Utilities (`lib/modules/utils/dates.ts`)

**Purpose:** Consolidate all date formatting.

```typescript
import { formatDistanceToNow, format, parseISO } from 'date-fns';

export function relativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return formatDistanceToNow(d, { addSuffix: true });
}

export function shortDate(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'MMM d, yyyy');
}

export function fullDate(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'MMMM d, yyyy');
}

export function time(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'h:mm a');
}

export function dateTime(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'MMM d, yyyy h:mm a');
}

export function isoDate(date: Date | string): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'yyyy-MM-dd');
}
```

---

## Implementation Order

### Phase 1: Create Modules (no breaking changes)
1. Create `lib/modules/api/response.ts`
2. Create `lib/modules/api/middleware.ts`
3. Create `lib/modules/client/api.ts`
4. Create `lib/modules/utils/dates.ts`

### Phase 2: Migrate API Routes (one by one)
Start with low-traffic routes to test:
1. `/api/notifications/route.ts`
2. `/api/pages/route.ts`
3. `/api/pages/[id]/route.ts`

Then high-traffic:
4. `/api/chat/messages/route.ts`
5. `/api/kanban/tasks/route.ts`

### Phase 3: Migrate Components
Update components to use `api` client:
1. `MessageInput.tsx`
2. `ChatView.tsx`
3. `KanbanBoard.tsx`

### Phase 4: Cleanup
1. Remove duplicate code from `lib/utils.ts`
2. Delete backup files
3. Update imports across codebase

---

## Benefits

| Before | After |
|--------|-------|
| 81 duplicate auth checks | 1 `withAuth` wrapper |
| 50+ error handlers | 6 response functions |
| Scattered fetch calls | 1 `api` client |
| Mixed date formatting | 1 `dates` module |
| ~260 lines of boilerplate | ~100 lines in modules |

---

## Module Discovery Rule

**Before writing new code, ask:**
> Does `lib/modules/` have something for this?

Add this to DEVELOPMENT.md as part of the "Before Writing Code" checklist.

---

*Designed by Rico 🤖 - March 6, 2026*
