---
name: ripe-next-tests
description: Writes tests for a Ripe Next.js project — Vitest for pure logic and client islands, database/RLS tests on a local instance, and Playwright end-to-end tests on the dev server or a preview. Use when adding a feature, fixing a bug, or wiring the check gate. Replaces building-ripe-tests for Next projects.
---

# Ripe Next Tests

Test behavior at the lowest level that can observe it.

| What | Tool | Where |
|---|---|---|
| Pure logic: brains, reducers, registries, Zod schemas | Vitest | `lib/**/__tests__/` |
| Client islands | Vitest + Testing Library | next to the component |
| Access rules (RLS, grants) | Vitest against local DB | `supabase/tests/` |
| Server Components, Server Actions, proxy, caching | Playwright | `e2e/` |

## Rules

- Don't unit-render async Server Components or call Server Actions with a mocked `next/*`. Cover them through Playwright: sign in as a seeded dev user, act, assert on the UI **and** the DB row.
- Access-control tests run as each role and assert both what's allowed and what's denied.
- Each bug fix starts with a failing test.
- Every test runs inside `npm run check`, locally and in CI.

## Example (hasulam-dashboard)

`e2e/` signs in as a seeded user, marks a task done, and checks the row. `supabase/tests/rls.test.ts` asserts that each role sees only its own tasks.
