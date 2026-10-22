# Ripe Principles: runtime-agnostic core

This file holds the Ripe rules that apply in any runtime. The `building-ripe-*` skills implement them on Vite + React Router + Redux. The `ripe-next-*` skills implement them on the Next.js App Router (16.4+). When a mechanism-level rule conflicts with this file, this file wins.

## The principles

1. **Components render; they don't fetch or decide.** Business logic and I/O live in one place per domain.
2. **The URL is state.** One declarative route map; pages stay thin.
3. **One home per concern.** Each domain has exactly one module that owns it (store branch, `lib/db/<domain>.ts`, registry).
4. **Boundaries are parsed.** Every input from outside (URL, form, env, DB row, other services) goes through a schema.
5. **Uniform shape.** Every component is a folder with the same files, and every feature has the same layout.
6. **Test behavior, not implementation.**
7. **Rules live in code.** A rule that a linter, type, or test can enforce is enforced there. Prose holds the rest.
8. **Short, machine-readable context.** One AGENTS.md: commands, layout, and a table mapping each rule to its enforcer.

## Mechanism map

| Principle | Vite SPA (building-ripe-*) | Next.js App Router (ripe-next-*) | Why the mechanism differs |
|---|---|---|---|
| 1 | Listeners load data into Redux | Async Server Components read through `lib/db`; Server Actions write | The server renders the tree, so data loads there once per request |
| 2 | React Router + `setLocation` bridge | `app/` folder tree, layouts, `proxy.ts` | The URL is resolved on the server and only changed segments re-render |
| 3 | Redux branch per domain | `lib/db/<domain>.ts` + `'use cache'` tags; client store only for client-only state | A client mirror of server data is a second cache that can go out of sync |
| 4 | `config.ts`, typed actions | Zod `env.ts` (server vs `NEXT_PUBLIC_`), Zod in every action | Server secrets must never be inlined into the client bundle |
| 5 | `Name.styled.tsx` | `Name.module.css` | Runtime CSS-in-JS forces `'use client'` and fights streaming SSR |
| 6 | RTL component tests | Vitest for pure logic and client islands, Playwright e2e | Async Server Components can't be rendered in RTL |
| 7, 8 | CLAUDE / CONTEXT / PROGRESS.md | AGENTS.md | Tooling convention, not a runtime difference |

Source analysis: `docs/ripe-next-findings.md`.
