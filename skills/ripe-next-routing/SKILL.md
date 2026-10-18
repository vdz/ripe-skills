---
name: ripe-next-routing
description: Adds and changes routes in a Ripe Next.js App Router project. Use when creating pages, layouts, loading/error states, dynamic segments, redirects, or auth gates. Replaces building-ripe-routing for Next projects.
---

# Ripe Next Routing

The `app/` tree is the route map. There is no router-to-store bridge: the server already holds the URL.

## Rules

- **Pages stay thin.** A page does three things: `requireRole()`, read through `lib/db`, render components. No business logic.
- **One segment folder per route**, with `page.tsx` and, where needed, `layout.tsx`, `loading.tsx`, `error.tsx`, and `not-found.tsx`.
- **`params` and `searchParams` are Promises** (16.x). Await them and parse with Zod:
  ```tsx
  const paramsSchema = z.object({ eventId: eventIdSchema });
  export default async function EventPage(props: { params: Promise<unknown> }) {
    const viewer = await requireRole();
    const { eventId } = paramsSchema.parse(await props.params);
    const event = await getEvent({ viewer, eventId });
    return <EventView event={event} />;
  }
  ```
- **`proxy.ts` handles the network boundary only**: session cookie refresh, coarse redirects. It runs on Node. Every page and action still calls `requireRole()`.
- **Dynamic data goes inside `<Suspense>`** so the static shell can prerender (Cache Components).
- **Navigation:** `<Link>` for links, `redirect()` in server code, `useRouter` only in client islands.
