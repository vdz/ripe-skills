---
name: ripe-next-data
description: Reads and writes application data in a Ripe Next.js project with Server Components, Server Actions, and Cache Components ('use cache'). Use when adding a query, mutation, cached read, or a new domain module. Replaces building-ripe-store for server state.
---

# Ripe Next Data

The server owns the data. Client components never fetch it, and no client store mirrors it.

## Reads

- Only `src/lib/db/<domain>.ts` talks to the DB (`import 'server-only'`, lint-enforced). Each function takes `{ viewer, ...input }`, parses rows with Zod, and returns branded types.
- Pages and Server Components `await` these functions directly.
- Caching is opt-in. Put `'use cache'` on reads that are shared or rarely change, and tag them:
  ```ts
  export async function listTaskTemplates(type: EventType) {
    'use cache';
    cacheTag(`templates:${type}`);
    cacheLife('days');
    return parseTemplates(await query(type));
  }
  ```
  Never cache per-viewer data that depends on cookies unless the viewer is part of the arguments.

## Writes

Each mutation is one Server Action in `app/<route>/actions.ts`, always in the same order:

```ts
'use server';
const input = z.object({ taskId: taskIdSchema, status: taskStatusSchema });
export async function setStatusAction(formData: FormData) {
  const viewer = await requireRole();                 // 1. auth
  const parsed = input.parse(Object.fromEntries(formData)); // 2. parse
  await setTaskStatus({ viewer, ...parsed });         // 3. mutate via lib/db
  updateTag(`tasks:${viewer.personId}`);              // 4. invalidate (read-your-writes)
}
```

- Use `updateTag` when the user must see their own write immediately. Use `revalidateTag` for background refresh.
- Return a discriminated union (`{ ok: true } | { ok: false, reason }`) when the UI needs to show a failure, and handle it with an exhaustive switch.
- Side effects that must not block the response go in `after()`.
- Outbound effects (messages, other services) go through one function in `lib/modules/*` with an idempotency key.
