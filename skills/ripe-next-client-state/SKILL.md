---
name: ripe-next-client-state
description: Decides when and how to hold client-side state in a Ripe Next.js project — form status, optimistic updates, multi-step UI, or a real client store. Use before adding useState-heavy logic, Redux, or Zustand to a Next app.
---

# Ripe Next Client State

Client state is only for things the server doesn't know yet: pending UI, optimistic values, unsaved steps.

## Order of preference

1. **URL** (`searchParams`) for anything shareable: filters, tabs, selected item.
2. **`useActionState`** for form result and pending state of a Server Action.
3. **`useOptimistic`** for instant feedback on a write (for example, marking a task done).
4. **Local `useState`/`useReducer`** inside one client island.
5. **A store (Redux Toolkit or Zustand)** only for client-only state shared across islands, such as a flow engine. Create it **per request** inside a `'use client'` provider (`useRef(makeStore())`). Never use a module-level singleton.

## Rules

- Never copy server rows into a store. Read them in a Server Component and pass them down as props.
- Branch business logic in reducers the Ripe way: pure, tested, with exhaustive switches.
