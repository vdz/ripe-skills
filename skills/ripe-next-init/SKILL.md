---
name: ripe-next-init
description: Initializes a Ripe project on the Next.js App Router (16.4+). Use when starting a new Ripe project that needs server rendering, auth, or a database, instead of ripe-init (Vite). Scaffolds strict TS, Zod env, proxy.ts, import boundaries, and one `npm run check` gate.
---

# Ripe Next Init

Read `ripe-architecture-docs/principles.md` first.

## Steps

1. `npx create-next-app@latest --ts --eslint --app --src-dir --no-tailwind`. Cache Components is on by default from 16.4. Confirm that `next.config.ts` has `cacheComponents: true`.
2. In `tsconfig.json`: `strict`, `noUncheckedIndexedAccess`.
3. Create `src/env.ts`. It parses `process.env` with Zod and splits it in two: `serverEnv()` (imports `server-only`) and `publicEnv` (only `NEXT_PUBLIC_*`). Nothing else reads `process.env`.
4. Create `src/proxy.ts` for session refresh and redirects only. Never put `middleware.ts` in a 16.x project. Authorization lives in `requireRole()`, not in proxy.
5. Lay out the project:
   ```
   src/app/            routes + server actions (thin)
   src/components/     Name/{Name.tsx, Name.module.css, types.ts, index.ts}
   src/lib/db/         only importer of the DB client
   src/lib/modules/    outside-world I/O
   src/lib/utils/      pure logic + __tests__
   src/assets/locales/ all copy
   ```
6. ESLint: `strictTypeChecked`, `switch-exhaustiveness-check`, `no-restricted-imports` so that only `src/lib/db/*` imports the DB package.
7. `npm run check` = typecheck, lint, unit, build, e2e. CI runs the same script.
8. Write a short AGENTS.md: commands, layout, and a rule→enforcer table.

## Example

hasulam-dashboard follows this shape. See its `AGENTS.md` and `src/env.ts`, which refuses `DEV_LOGIN_ENABLED` when `VERCEL_ENV=production`.
