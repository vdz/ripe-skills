# Listener Tests Reference

## When to read this
- Writing the first test for a listener
- Testing a debounced effect (Pattern 4)
- Testing an optimistic-update flow (Pattern with rollback)
- Testing a once-only hydration listener
- Stubbing a service module (`window.mce`, `localStorage`)
- Debugging "my listener test poisons the next test"

## Contents
- The 4-line skeleton
- Why `vi.resetModules()` + dynamic import
- Async patterns: `vi.waitFor` and `vi.advanceTimersByTimeAsync`
- Service-module stubbing
- `vi.mock` for the router module
- Asserting absence
- Once-only guard tests
- Pipeline tests crossing branches

## The 4-line Skeleton

Every listener test follows the same shape:

```typescript
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeTestHarness, actionTypes, loc, type TestHarness } from '@/test-utils';
import type { Listener } from '@/store/types';
import { setLocation } from '@/store/router/router.actions';

async function loadAuthListener(): Promise<Listener[]> {
	const mod = await import('../auth.listener');
	return mod.listener;
}

describe('auth.listener', () => {
	beforeEach(() => {
		vi.resetModules();
	});

	it('dispatches setUserInfo on first setLocation', async () => {
		stubMce(() => Promise.resolve(stubUser));
		const listener = await loadAuthListener();   // dynamic import after resetModules
		const harness: TestHarness = makeTestHarness(listener);

		harness.store.dispatch(setLocation({ location: loc('/') }));

		await vi.waitFor(() => {
			expect(actionTypes(harness)).toContain('auth/setUserInfo');
		});
		expect(harness.store.getState().auth.status).toBe('loaded');
	});
});
```

Four moves: reset modules → dynamic import → build harness → dispatch + waitFor.

## Why `vi.resetModules()` + Dynamic Import

Listeners often hold module-level guards — booleans like `authLoaded` or `demosHydrated` that flip on first invocation to prevent re-runs. These guards live in the module's closure. Without resetting modules between tests, a test that flipped the guard poisons the next test (the second test sees the guard already true and short-circuits).

Pattern: in `beforeEach`, call `vi.resetModules()`. Then load the listener via dynamic `await import('../the.listener')` — this re-runs the module body fresh, with all guards back to their initial state.

If you `import` the listener statically at the top of the file, `vi.resetModules()` doesn't affect it — the static binding is already resolved. **Always dynamic-import listeners under test.**

The audit check `TEST-L-NO-VI-RESETMODULES` flags listener test files that omit this — it's a quiet source of test bleed.

## Async Patterns

### `vi.waitFor` — for naturally async effects

Use when the listener does an `await` (API call, timer, anything that gives the microtask queue time to flush) and you want to assert on the post-await state.

```typescript
harness.store.dispatch(fetchDemos());

await vi.waitFor(() => {
	expect(actionTypes(harness)).toContain('demos/fetchDemosSuccess');
});
```

`vi.waitFor` polls the assertion until it passes (default 1000ms timeout). Doesn't require fake timers.

### `vi.advanceTimersByTimeAsync` — for debounced effects

Use when the listener uses `delay(N)` (Pattern 4 — `cancelActiveListeners + delay`). Real time doesn't pass in tests; you have to advance fake timers manually.

```typescript
vi.useFakeTimers();
const listener = await loadPersistenceListener();
const harness = makeTestHarness(listener);

// Rapid edits — only the last one should persist (300ms debounce)
harness.store.dispatch(editDraftName({ name: 'A' }));
harness.store.dispatch(editDraftName({ name: 'AB' }));
harness.store.dispatch(editDraftName({ name: 'ABC' }));

await vi.advanceTimersByTimeAsync(300);

const persists = harness.dispatched.filter((a) => a.type === 'newDemo/persistDraft');
expect(persists).toHaveLength(1);
expect(persists[0]).toMatchObject({ payload: { name: 'ABC' } });

vi.useRealTimers();
```

Always restore real timers at the end (or in `afterEach`). Forgetting leaks to the next test.

## Service-Module Stubbing

Ripe mocks at the service-module boundary — `window.mce`, `localStorage`, third-party SDKs. The pattern:

```typescript
function stubMce(getUserInfoImpl: () => Promise<UserInfo>) {
	(globalThis.window as any).mce = {
		jarvis: { api: { auth: { getUserInfo: () => ({ promise: getUserInfoImpl }) } } },
	};
}

function clearMce() {
	delete (globalThis.window as any).mce;
}

describe('auth.listener', () => {
	beforeEach(() => { vi.resetModules(); });
	afterEach(() => { clearMce(); });

	it('handles success', async () => {
		stubMce(() => Promise.resolve(validUser));
		// ... test
	});

	it('handles missing service', async () => {
		clearMce();
		// ... test
	});
});
```

Pre-test `stubMce(...)`. Post-test `clearMce()`. **No test-wide singleton stub** — each test sets up its own scenario so failures don't cascade.

For `localStorage`, jsdom provides a working one — write to it directly in the test setup:

```typescript
beforeEach(() => {
	vi.resetModules();
	localStorage.clear();
	localStorage.setItem('theme', 'dark');
});
```

## `vi.mock` for the Router Module

When a listener imports `router` from `@/router/router` and calls `router.navigate(...)`, mock the module to capture the calls without actually navigating:

```typescript
const navigateMock = vi.fn();
vi.mock('@/router/router', () => ({
	router: { navigate: navigateMock },
}));

it('navigates to /summary after submitOrderSuccess', async () => {
	const listener = await loadOrderListener();
	const harness = makeTestHarness(listener);

	harness.store.dispatch(submitOrderSuccess({ orderId: 'x' }));

	await vi.waitFor(() => {
		expect(navigateMock).toHaveBeenCalledWith('/summary');
	});
});
```

`vi.mock` is hoisted by Vitest, so it applies before the dynamic `import('../order.listener')` resolves the router import. The mock function itself can be `vi.fn()` from outside the factory.

## Asserting Absence

When the contract is "this action should NOT fire" (e.g., guard prevented it), wait for any settling, then assert:

```typescript
harness.store.dispatch(setLocation({ location: loc('/somewhere') }));

// Give async listeners a tick to settle
await vi.waitFor(() => true, { timeout: 50 });

expect(actionTypes(harness)).not.toContain('current/startNewDemo');
```

The `vi.waitFor(() => true)` is a tiny pause — long enough for one microtask cycle, short enough not to slow the test.

For debounced "didn't fire" assertions, advance timers past the debounce window then check:

```typescript
harness.store.dispatch(setSearch({ query: 'a' }));
await vi.advanceTimersByTimeAsync(50);   // before the 150ms debounce
expect(actionTypes(harness)).not.toContain('demos/searchExecuted');
```

## Once-Only Guard Tests

For listeners that should fire only on the first match (auth bootstrap, hydration), count occurrences across multiple triggers:

```typescript
it('only fires on the first setLocation, not subsequent ones', async () => {
	stubMce(() => Promise.resolve(stubUser));
	const listener = await loadAuthListener();
	const harness = makeTestHarness(listener);

	harness.store.dispatch(setLocation({ location: loc('/') }));
	await vi.waitFor(() => expect(actionTypes(harness)).toContain('auth/setUserInfo'));

	harness.store.dispatch(setLocation({ location: loc('/demos') }));
	harness.store.dispatch(setLocation({ location: loc('/settings') }));
	await vi.waitFor(() => true, { timeout: 50 });

	const userInfoActions = actionTypes(harness).filter((t) => t === 'auth/setUserInfo');
	expect(userInfoActions).toHaveLength(1);
});
```

The test exercises the guard: setLocation fires three times, but `setUserInfo` should only land once.

## Pipeline Tests Crossing Branches

Rare but valuable. When a single user action triggers a multi-branch chain that's the value the user experiences, test the whole pipeline as the unit:

```typescript
const harness = makeTestHarness([
	...routerListener,
	...currentListener,
	...demosListener,
	...uiListener,
]);

harness.store.dispatch(startUpload({ shorthand: 'demo-1', files: [/* ... */] }));

await vi.waitFor(() => {
	expect(actionTypes(harness)).toContain('current/uploadFinished');
}, { timeout: 5000 });

expect(harness.store.getState().current.upload.status).toBe('done');
expect(actionTypes(harness)).toContain('ui/pushToast');         // toast surfaced
expect(actionTypes(harness)).toContain('demos/bundleStatsUpdated'); // demos branch updated
```

These tests are exempt from cardinal rule #5 ("one concern per `it()`") — the pipeline IS the concern.

## What NOT to Do

### Don't import internal helpers

```typescript
// ❌ Wrong — reaching into the listener file's privates
import { extractToken } from '../auth.listener';
expect(extractToken('Bearer abc')).toBe('abc');

// ✅ Right — dispatch the action that exercises the helper, observe state
harness.store.dispatch(setLocation({ location: loc('/') }));
await vi.waitFor(() => expect(harness.store.getState().auth.token).toBe('abc'));
```

If a helper is complex enough to want a direct test, that's signal to extract it to a pure module (e.g., `auth.helpers.ts`) and unit-test it there as a pure function.

### Don't reach into the listener's middleware

The harness exposes `store` and `dispatched`. Don't introspect the listener middleware itself.

### Don't construct a store inline

```typescript
// ❌ Wrong — bypasses the harness
const store = configureStore({ reducer: { auth: authReducer } });

// ✅ Right
const harness = makeTestHarness(authListener);
```

The audit's `TEST-M-HAND-ROLLED-STORE` flags this.

## Worked Examples in the Wild

Real files in `mce-demo-portal`:
- `src/store/auth/__tests__/auth.listener.test.ts` — canonical: setLocation hydration, service-module stubs, once-only guard
- `src/store/newDemo/__tests__/newDemo.listener.persistence.test.ts` — fake timers, debounced persistence
- `src/store/ui/__tests__/ui.listener.theme.test.ts` — localStorage + DOM service-module bootstrap
- `src/store/current/__tests__/current.listener.upload.test.ts` — multi-branch pipeline test
