---
name: ripe-next-components
description: Creates and modifies React components in a Ripe Next.js App Router project. Use when adding UI, splitting server and client components, or styling. Covers the folder shape, the 'use client' boundary, CSS Modules, test ids, and copy. Replaces building-ripe-components for Next projects.
---

# Ripe Next Components

## File structure

```
components/
└── TaskRow/
    ├── TaskRow.tsx
    ├── TaskRow.module.css
    ├── types.ts      # only when the component owns a type
    └── index.ts      # export { TaskRow } from './TaskRow';
```

## Rules

- **Server by default.** Add `'use client'` only to the smallest leaf that needs state, effects, or browser APIs. A client island gets data as props and never fetches it.
- **Props crossing into a client component must be serializable**: plain data, no class instances, no functions except Server Actions.
- **Styling uses CSS Modules.** Runtime CSS-in-JS (styled-components, emotion) isn't allowed: it forces `'use client'` and needs a streaming registry. Express variants with `data-*` attributes and CSS variables:
  ```tsx
  <li className={styles.row} data-status={task.status}>
  ```
  ```css
  .row[data-status='done'] { opacity: .6; }
  ```
- **RTL/i18n**: all copy comes from `assets/locales/he.ts`. Use logical CSS properties (`margin-inline-start`).
- **Test ids**: `data-testid="task-row"` on anything e2e touches.
- **Forms** post to Server Actions (`<form action={setStatusAction}>`). They work without JS.
