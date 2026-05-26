---
name: building-ripe-tests
description: Writes and modifies tests for Ripe codebases — reducer tests, listener tests via makeTestHarness, selector tests, and behaviour-level component tests with React Testing Library. Use when adding tests for a new branch, testing a listener (hydration, debounce, error handling, optimistic rollback), testing a reducer transition, testing a selector, or asserting component dispatch/selector behaviour. Triggers on "write a test", "test this listener", "harness", "makeTestHarness", "fireEvent", "RTL", "Vitest", "test coverage for X". For the general red-green-refactor loop see the `tdd` skill — this skill is about what a Ripe test *looks like*, not when to write one.
---

# Building Ripe Tests

## Cardinal Rules

These are non-negotiable. Every other section in this skill assumes them.

**1. Tests live in `__tests__/` next to the source — never alongside.**
Imports use `../<file>` to reach the parent. Enforced by `ripe-audit/checklists/organisation.md → ORG-M-TEST-COLOCATION`.

**2. Reducer tests assert state, not action shape.**
`expect(state.x).toEqual(...)` — never `expect(action.type).toBe(...)`. The reducer's contract is the resulting state. Action shape is the action creator's concern (and TypeScript already proves it). See [reducer-tests.md](reducer-tests.md).

**3. Listener tests dispatch and observe — no listener internals.**
Dispatch an action into a `makeTestHarness`, wait for the effect to settle (`vi.waitFor` for async, `vi.advanceTimersByTimeAsync` for debounced), assert on `harness.dispatched` or `harness.store.getState()`. Never import an internal helper out of `<feature>.listener.ts`. See [listener-tests.md](listener-tests.md).

**4. Component tests assert behaviour, not implementation.**
Render with the real harness store wrapped in `<Provider>`. Assert what the user sees (`screen.getByText`) and what the component dispatches (`harness.dispatched.find(...)`). Never assert on hook return values, internal component state, or styled-component class names beyond variant markers. See [component-tests.md](component-tests.md).

**5. One concern per `it()`. One `describe()` per logical surface.**
A listener test file has `describe('hydration on setLocation')`, `describe('error handling')`, etc. — not one giant test that walks the whole flow. Exception: documented end-to-end pipeline tests where the *flow itself* is the unit under test.

## The Harness

`makeTestHarness(listeners?)` is the bedrock. It builds an isolated store with:
- The full root reducer (so cross-branch selectors work)
- A listener middleware with only the listeners under test registered
- A logging middleware that records every dispatched action (`harness.dispatched`)

Three exports from `src/test-utils.ts`:

```typescript
makeTestHarness(listeners: Listener[] = []) → { store, dispatched }
actionTypes(harness) → string[]
loc(pathname: string, search?: string, hash?: string) → Location
```

Rule: **never hand-roll a store in a test**. If `makeTestHarness` doesn't fit, that's signal to grow the harness — not to bypass it. The audit's `TEST-M-HAND-ROLLED-STORE` check flags `configureStore(` calls outside `src/store/store.ts` and `src/test-utils.ts`.

The harness lives in the user's repo (`src/test-utils.ts`), not in this skill. It's scaffolded by [ripe-init's store templates](../ripe-init/store-templates.md). If a project doesn't have it, scaffold from there.

### Listener registration in a test

```typescript
import { makeTestHarness } from '@/test-utils';
import { listener as authListener } from '@/store/auth/auth.listener';

const harness = makeTestHarness(authListener);
```

For integration tests crossing multiple branches:

```typescript
import { listener as routerListener } from '@/store/router/router.listener';
import { listener as demosListener } from '@/store/demos/demos.listener';
import { listener as currentListener } from '@/store/current/current.listener';

const harness = makeTestHarness([...routerListener, ...demosListener, ...currentListener]);
```

The harness's logging middleware records cross-branch chains — Listener A's dispatch into Listener B shows up in `harness.dispatched` in firing order.

### jsdom

Listener tests and component tests both need a DOM. Annotate the file:

```typescript
// @vitest-environment jsdom
```

at the very top. Reducer tests don't need it — pure functions.

## Selector Tests

Two flavours:

**Direct slice selectors** — trivial, usually not worth a test. Skip unless there's a fallback chain or a non-obvious lookup.

**Derived selectors** (`createSelector`) — test the chain explicitly. Build a harness, dispatch one action to set state, run the selector on `store.getState()`. No mocking.

```typescript
import { makeTestHarness } from '@/test-utils';
import { selectDisplayName } from '../auth.selectors';
import { setUserInfo } from '../auth.actions';

it('selectDisplayName falls back through nickname → name → username → email', () => {
	const { store } = makeTestHarness();
	store.dispatch(setUserInfo({ email: 'a@b.com', name: '', username: 'a.bee', nickname: '' }));
	expect(selectDisplayName(store.getState())).toBe('a.bee');
});
```

That's the whole pattern. No reference file needed.

## What This Skill Won't Cover

Testing is a black hole. Naming refusals upfront keeps the skill narrow.

- **Mocking philosophy / dependency-injection theory.** Ripe mocks at the service-module boundary (`window.mce`, `localStorage`, the router module). Beyond that, no opinions.
- **Snapshot tests.** Ripe doesn't snapshot. They drift and review noisily.
- **End-to-end / browser tests.** Out of scope. If a project wants e2e, that's a different skill.
- **Coverage thresholds.** Coverage as feedback yes; coverage as gate no.
- **Performance / load testing, visual regression.** Out of scope.
- **Testing-philosophy debates** (London vs Detroit, classicist vs mockist). The skill is opinionated about *what Ripe does*; silent on what other schools think.
- **Setting up Vitest from scratch.** That's `ripe-init`'s job.
- **The TDD loop itself.** That's the `tdd` skill's job — this skill assumes you've decided to write a test.

## File Naming Convention

```
src/store/<branch>/__tests__/
├── <branch>.reducer.test.ts          // reducer tests
├── <branch>.listener.test.ts         // primary listener test
├── <branch>.listener.<concern>.test.ts  // split-by-concern when one file grows
└── <branch>.selectors.test.ts        // if derived selectors exist

src/components/<Component>/__tests__/
└── <Component>.test.tsx
```

Split-by-concern is the right move when a single listener file has 3+ unrelated concerns (e.g. `current.listener.upload.test.ts` covers the upload pipeline; `current.listener.test.ts` covers selection + navigation).

## Common Tasks

| What you're doing | Read |
|---|---|
| Testing a reducer transition | [reducer-tests.md](reducer-tests.md) |
| Testing a listener (hydration, debounce, error handling, optimistic) | [listener-tests.md](listener-tests.md) |
| Testing a component (RTL + harness + dispatch assertions) | [component-tests.md](component-tests.md) |
| Testing a derived selector | The Selector Tests section above |
| Setting up the harness on a fresh project | [ripe-init's store-templates.md](../ripe-init/store-templates.md) |
| Running the audit's test-quality checks | [ripe-audit/checklists/tests.md](../ripe-audit/checklists/tests.md) |

## Workflow Checklist

```
Test Progress (per branch):
- [ ] __tests__/<branch>.reducer.test.ts — default state + each action's transition
- [ ] __tests__/<branch>.listener.test.ts — every listener entry has at least one test
- [ ] __tests__/<branch>.selectors.test.ts — every derived selector has at least one test
- [ ] Verify: no `configureStore(` outside src/store/store.ts and src/test-utils.ts
- [ ] Verify: every listener test imports the listener via dynamic import with vi.resetModules()
- [ ] Verify: no toMatchSnapshot anywhere
```

## References

| Document | When to read |
|---|---|
| [reducer-tests.md](reducer-tests.md) | Writing a reducer test |
| [listener-tests.md](listener-tests.md) | Writing a listener test — the centre of gravity |
| [component-tests.md](component-tests.md) | Writing a component test |
| `building-ripe-store` skill | The architecture under test |
| `building-ripe-components` skill | Component shape being tested |
| `tdd` skill | The red-green-refactor loop (when to write a test) |
| `ripe-init`'s store-templates.md | Scaffolding `test-utils.ts` and Vitest config |
| `ripe-audit/checklists/tests.md` | Test-quality drift checks |
