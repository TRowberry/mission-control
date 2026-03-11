# Mission Control Code Audit - March 6, 2026

## Summary

Scanned ~5,400 lines of API code and all components. Found several cleanup opportunities.

---

## 🗑️ Files to Delete

| File | Reason |
|------|--------|
| `components/chat/MessageInput.tsx.bak` | Backup file, not needed |

---

## 🔄 Duplicate Patterns Found

### 1. Auth Check Boilerplate (HIGH - 28 files, 81 instances)

Every API route repeats this pattern:
```typescript
const user = await getCurrentUser();
if (!user) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```

**Recommendation:** Create a `withAuth` wrapper or middleware:
```typescript
// lib/api-helpers.ts
export function withAuth(handler: (req: NextRequest, user: User) => Promise<Response>) {
  return async (req: NextRequest) => {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return handler(req, user);
  };
}

// Usage in route.ts
export const GET = withAuth(async (req, user) => {
  // user is already verified
});
```

**Impact:** Reduces ~160 lines of duplicate code

---

### 2. Error Handling Pattern (MEDIUM - 50+ instances)

Repeated try/catch with console.error:
```typescript
try {
  // ...
} catch (error) {
  console.error('Failed to X:', error);
  return NextResponse.json({ error: 'Failed to X' }, { status: 500 });
}
```

**Recommendation:** Create error handler helper:
```typescript
// lib/api-helpers.ts
export function apiError(message: string, error: unknown, status = 500) {
  console.error(`${message}:`, error);
  return NextResponse.json({ error: message }, { status });
}
```

---

### 3. Date Formatting Inconsistency (LOW)

Using both:
- `date-fns` functions (`formatDistanceToNow`, `format`)
- Custom `lib/utils.ts` functions (`formatRelativeTime`, `formatDate`)

**Recommendation:** Standardize on one approach. Since `date-fns` is already installed, use it everywhere, or consolidate custom functions in utils.

---

### 4. Raw Fetch Calls in Components (MEDIUM - 20+ instances)

Components have scattered fetch calls:
```typescript
const res = await fetch('/api/chat/messages', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify(data),
});
```

**Recommendation:** Create API client:
```typescript
// lib/api-client.ts
export const api = {
  get: (url: string) => fetch(url, { credentials: 'include' }).then(r => r.json()),
  post: (url: string, data: unknown) => fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  }).then(r => r.json()),
  // patch, delete, etc.
};

// Usage
const messages = await api.get('/api/chat/messages?channelId=...');
await api.post('/api/chat/messages', { content, channelId });
```

---

### 5. `requireAuth()` Not Used (LOW)

`lib/auth.ts` has a `requireAuth()` helper that throws, but it's not used anywhere. Either:
- Use it in API routes with try/catch
- Delete it if the pattern above (`withAuth` wrapper) is adopted

---

## 📁 File Organization

Current lib/ structure is clean:
```
lib/
├── activity-logger.ts  ✅
├── agent-auth.ts       ✅
├── agent-webhook.ts    ✅
├── auth.ts             ✅
├── db.ts               ✅
├── queue.ts            ✅
├── task-notifications.ts ✅
└── utils.ts            ✅ (but could grow with api-helpers)
```

**Recommendation:** Add:
- `lib/api-helpers.ts` - withAuth, apiError, etc.
- `lib/api-client.ts` - Frontend fetch wrapper

---

## 🎯 Cleanup Priority

1. **Quick wins (do now):**
   - Delete `MessageInput.tsx.bak`
   - Create `lib/api-helpers.ts` with `withAuth` and `apiError`

2. **Medium effort (next sprint):**
   - Refactor API routes to use `withAuth` wrapper
   - Create `lib/api-client.ts` for frontend

3. **Low priority (later):**
   - Standardize date formatting
   - Remove unused `requireAuth()` after `withAuth` adoption

---

## Metrics

| Category | Count |
|----------|-------|
| API route files | 28 |
| Component files | 26 |
| Lines of API code | ~5,400 |
| Auth check duplicates | 81 |
| Error handler duplicates | 50+ |
| Backup files | 1 |

---

*Audit by Rico 🤖 - March 6, 2026*
