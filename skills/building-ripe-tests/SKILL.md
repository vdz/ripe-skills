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

`makeTestHarness(listeners?, options?)` is the bedrock. It lives at `src/store/__tests__/makeTestHarness.ts` — inside the store, because it is the store's test seam — and builds an isolated store with:
- The **app's own reducer map** (`import { reducer } from '@/store/store'`), so a test sees exactly the app's shape and the app's defaults. A harness with a hand-built reducer drifts from the app, and a test against a drifted harness proves nothing.
- A listener middleware with only the listeners under test registered — through the app's own `registerListener`, so a test registers a listener exactly the way production does.
- A logging middleware that records every dispatched action (`harness.dispatched`), including listener-initiated follow-ups.
- An optional `preloadedState`, the way the boot hands a saved session to `makeStore`. Branches left out keep their reducer defaults.

```typescript
// src/store/__tests__/makeTestHarness.ts
import { configureStore, createListenerMiddleware, isAction } from '@reduxjs/toolkit';
import type { EnhancedStore, Middleware, UnknownAction } from '@reduxjs/toolkit';
import type { Listener } from '@/store/types';
import { reducer } from '@/store/store';
import type { RootState, AppDispatch } from '@/store/store';
import { registerListener } from '@/store/listener';

export interface TestHarness {
	/** The isolated store under test, with the supplied listeners wired in. */
	store: EnhancedStore<RootState>;
	/** Every action that has flowed through the middleware chain. */
	dispatched: UnknownAction[];
}

export interface TestHarnessOptions {
	/** State to start from. Branches left out keep their reducer defaults. */
	preloadedState?: Partial<RootState>;
}

export function makeTestHarness(listeners: Listener[] = [], options: TestHarnessOptions = {}): TestHarness {
	const listenerMiddleware = createListenerMiddleware();
	const startListening = listenerMiddleware.startListening.withTypes<RootState, AppDispatch>();
	for (const entry of listeners) {
		registerListener(startListening, entry);
	}

	const dispatched: UnknownAction[] = [];
	const loggingMiddleware: Middleware = () => (next) => (action) => {
		if (isAction(action)) {
			dispatched.push(action);
		}
		return next(action);
	};

	const store = configureStore({
		reducer,
		preloadedState: options.preloadedState,
		middleware: (getDefaultMiddleware) => getDefaultMiddleware().prepend(listenerMiddleware.middleware, loggingMiddleware),
	});
	return { store, dispatched };
}

/** Convenience: pluck just the action types from a dispatched list. */
export function actionTypes(harness: TestHarness): string[] {
	return harness.dispatched.map((entry) => entry.type);
}
```

Rule: **never hand-roll a store in a test**. If `makeTestHarness` doesn't fit, that's signal to grow the harness — not to bypass it. The audit's `TEST-M-HAND-ROLLED-STORE` check flags `configureStore(` calls outside `src/store/store.ts` and `src/store/__tests__/makeTestHarness.ts`.

The harness lives in the user's repo, not in this skill. It's scaffolded by [ripe-init's store templates](../ripe-init/store-templates.md). If a project doesn't have it, scaffold from there. A routed app dispatches its own `setLocation` payload — the trade-in app's router branch mirrors only `pathname`, so a test writes `setLocation({ pathname: '/' })` directly; a branch that mirrors a full `Location` keeps a `loc(pathname, search?, hash?)` helper beside the harness.

### Listener registration in a test

```typescript
import { makeTestHarness } from '@/store/__tests__/makeTestHarness';
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

The harness's logging middleware records cross-branch chains — Listener A's dispatch into Listener B shows up in `harness.dispatched` in firing order. Read the list through the action creator's own `.match`, which narrows the payload with no cast:

```typescript
const visited = harness.dispatched.filter(flowSetCurrent.match).map((entry) => entry.payload.step);
expect(visited).toEqual(['permissions', 'touchscreen']);
```

### Starting from a saved session

A resume test hands the harness the snapshot the boot would, and asserts that the branches the snapshot lacks keep their defaults:

```typescript
const { store } = makeTestHarness(sessionListener, {
	preloadedState: { tradein: { ...savedTradein, quote: savedQuote } },
});
expect(store.getState().ui.openPanel).toBeNull(); // not in the snapshot, so the default
```

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
import { makeTestHarness } from '@/store/__tests__/makeTestHarness';
import { selectDisplayName } from '../auth.selectors';
import { setUserInfo } from '../auth.actions';

it('selectDisplayName falls back through nickname → name → username → email', () => {
	const { store } = makeTestHarness();
	store.dispatch(setUserInfo({ email: 'a@b.com', name: '', username: 'a.bee', nickname: '' }));
	expect(selectDisplayName(store.getState())).toBe('a.bee');
});
```

That's the whole pattern. No reference file needed.

## Typed Test Doubles

A test double is a **typed factory**, never a cast. `as unknown as`, `as any` and `(globalThis.window as any).mce = …` are findings in a test file exactly as in app code: a cast hides the moment the double stopped matching the type it stands in for, and the test goes on passing against a shape the app no longer has.

The shapes that make a cast unnecessary:

- **A factory returning the declared type, every member present.** The platform shell double builds the whole `Window['mce']`; members a test does not script are inert defaults (a resolving handshake, a valid token). Install it on `window` directly — `window.mce = shell` typechecks because `shell` is the declared type.

  ```typescript
  // src/store/__tests__/fakeMce.test-utils.ts
  export type FakeMce = NonNullable<Window['mce']>;

  export function installFakeMce(options: FakeMceOptions = {}): FakeMce {
  	const start = options.start ?? (() => Promise.resolve());
  	const auth = options.auth ?? { token: 'jwt-123', expiry: Math.floor(Date.now() / 1000) + 3600 };
  	const shell: FakeMce = {
  		EnvironmentInitializer: class {
  			constructor(appName: string, services: string[]) { options.onInitializer?.(appName, services); }
  			start() { return start(); }
  		},
  		jarvis: { api: { auth: { getAuthToken: () => ({ promise: () => Promise.resolve(auth) }) }, /* … */ } },
  	};
  	window.mce = shell;
  	return shell;
  }

  export function uninstallFakeMce(): void {
  	delete window.mce;
  }
  ```

- **Browser objects built by their jsdom constructors or as full fakes.** `new MouseEvent('click')`, `new Blob([...])` — or, where jsdom has no implementation (`MediaStream`), a factory that satisfies the DOM interface member by member (`fakeTrack()`, `fakeStream(tracks)` in `components/diagnostics/__tests__/mediaFakes.test-utils.ts`).
- **A `value is T` guard where the app's own guard exists.** `isCheckId(value)` narrows a string read off a DOM attribute; the test reuses the app's predicate rather than asserting the type.
- **`Reflect.deleteProperty(navigator, 'clipboard')`** to simulate an absent platform API, instead of `delete (navigator as any).clipboard`.
- **`vi.mocked(fn).getMockImplementation()`** to read a mock's original back, captured at module load — after the suite's `restoreMocks` the mock still calls the original but no longer reports it (see [component-tests.md → journey configuration](component-tests.md#turning-a-journey-knob-for-one-test)).

Doubles live in `__tests__/<name>.test-utils.ts` next to the tests that use them; Vitest does not collect `*.test-utils.ts` as a suite.

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
src/store/__tests__/
├── makeTestHarness.ts                // the harness
└── <double>.test-utils.ts            // typed doubles shared across branches (fakeMce)

src/store/<branch>/__tests__/
├── <branch>.reducer.test.ts          // reducer tests
├── <branch>.listener.test.ts         // primary listener test
├── <branch>.listener.<concern>.test.ts  // split-by-concern when one file grows
├── <branch>.selectors.test.ts        // if derived selectors exist
└── <scenario>.test-utils.ts          // doubles and drivers this branch's tests share

src/store/<branch>/api/__tests__/
└── <api>.test.ts                     // one per api module with logic worth a test (a generation counter, a codec)

src/components/<Component>/__tests__/
└── <Component>.test.tsx
```

A branch whose listeners are split by concern (`store/diagnostics/listeners/<concern>.listener.ts`) tests each concern in its own file, named for the concern.

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
- [ ] Verify: no `configureStore(` outside src/store/store.ts and src/store/__tests__/makeTestHarness.ts
- [ ] Verify: every listener test that touches a listener with module-level state imports it via dynamic import with vi.resetModules()
- [ ] Verify: no `as` in a test file — doubles are typed factories, DOM objects come from their constructors
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
| `ripe-init`'s store-templates.md | Scaffolding `store/__tests__/makeTestHarness.ts` and Vitest config |
| `ripe-audit/checklists/tests.md` | Test-quality drift checks |
