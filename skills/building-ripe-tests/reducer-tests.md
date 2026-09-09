# Reducer Tests Reference

## When to read this
- Writing the first test for a new branch
- Adding a test for a new action / reducer case
- Reviewing whether an existing reducer test follows the rules

## Contents
- The three idioms
- What NOT to do
- File location

## The Three Idioms

Reducer tests are pure-function tests. No harness, no async, no `vi.mock`. Three idioms cover almost everything.

### 1. Default state via `@@INIT`

Verify the branch's default state matches what the type says.

```typescript
import { describe, it, expect } from 'vitest';
import { demosReducer } from '../demos.reducer';

describe('demos.reducer', () => {
	it('starts with idle status, empty items, empty byId', () => {
		const state = demosReducer(undefined, { type: '@@INIT' });
		expect(state).toEqual({
			status: 'idle',
			items: [],
			byId: {},
		});
	});
});
```

The `@@INIT` action is conventional — it triggers the default value of the `createReducer`. Any unrecognised action does the same; `@@INIT` is the canonical label.

When the literal default **is** the contract — a flows reducer that declares a journey's step list, a diagnostics branch that declares every check id — the default-state test spells the whole literal out, so a reordered or dropped step is a one-line failure:

```typescript
it('declares the assessment journey in order', () => {
	const state = flowsReducer(undefined, { type: '@@INIT' });
	expect(state.byId.assessment.steps).toEqual([
		'landing', 'permissions', 'touchscreen', 'buttons', 'cameraBack', 'cameraFront',
		'condition', 'damage', 'background', 'offerReview', 'voucher',
	]);
	expect(state.byId.assessment).toMatchObject({ status: 'idle', currentStep: null, data: {} });
});
```

### 2. One action, one transition

Most cases assert a single state field changing for a single action.

```typescript
import { fetchDemos } from '../demos.actions';

it('fetchDemos sets status to loading', () => {
	const next = demosReducer(undefined, fetchDemos());
	expect(next.status).toBe('loading');
});

it('fetchDemosSuccess populates items and byId', () => {
	const next = demosReducer(undefined, fetchDemosSuccess({
		items: ['a', 'b'],
		byId: { a: { shorthand: 'a', name: 'A' }, b: { shorthand: 'b', name: 'B' } },
	}));
	expect(next.status).toBe('loaded');
	expect(next.items).toEqual(['a', 'b']);
	expect(Object.keys(next.byId)).toEqual(['a', 'b']);
});
```

### 3. Prior state piped in

For multi-step flows, build the prior state by running the reducer once, then dispatch the next action.

```typescript
it('fetchDemosFailure sets status to error after a load was in flight', () => {
	const loading = demosReducer(undefined, fetchDemos());
	const failed  = demosReducer(loading, fetchDemosFailure({ error: 'network' }));
	expect(failed.status).toBe('error');
	expect(failed.error).toBe('network');
});
```

Don't construct the prior state by hand (`{ status: 'loading', items: [], byId: {}, error: null }`). Pipe through the reducer — that way the test exercises the real path and breaks if a default changes.

## What NOT to Do

### Don't assert on action shape

```typescript
// ❌ Wrong — the action creator's contract, not the reducer's
expect(fetchDemosSuccess({ items: [] }).type).toBe('demos/fetchDemosSuccess');

// ✅ Right — the reducer's contract is the resulting state
const next = demosReducer(undefined, fetchDemosSuccess({ items: ['a'], byId: { a: ... } }));
expect(next.items).toEqual(['a']);
```

TypeScript already proves the action's shape; testing it again is noise.

### Don't `vi.mock` anything in a reducer test

If a reducer needs a mock, the reducer is doing too much. That's a `building-ripe-store` cardinal-rule #2 violation (reducers do data mapping and low-level data maintenance, not business logic).

```typescript
// ❌ Wrong — reducer should never call out
vi.mock('@/api/getDemos', () => ({ getDemos: vi.fn() }));

// ✅ If the reducer is calling out, the bug is in the reducer; fix it first
```

### Don't reach into Immer drafts

`createReducer` uses Immer. Don't assert on draft-specific properties; assert on the materialised state.

```typescript
// ❌ Wrong — exposes Immer internals
expect(next.byId.a[immerDraftSymbol]).toBe(...);

// ✅ Right — assert on the value
expect(next.byId.a.name).toBe('A');
```

## File Location

```
src/store/<branch>/__tests__/<branch>.reducer.test.ts
```

Always inside `__tests__/`. Imports use `../<file>`:

```typescript
import { demosReducer } from '../demos.reducer';
import { fetchDemos, fetchDemosSuccess } from '../demos.actions';
```

## Worked Examples in the Wild

Real files in `mce-blueprint`:
- `src/store/ui/__tests__/ui.reducer.test.ts` — one `describe` per concern (altitude, selection,
  viewport, dirty tracking, appPreview). The `selection` block is the one to copy: every transition
  is paired with its no-op counterpart ("clears a matching selection" / "leaves a non-matching
  selection alone"). The `viewportSized` case is the clearest example of asserting a *merge* rather
  than a replace.
- `src/store/plan/__tests__/plan.reducer.test.ts` — cascade cases: `screenRemoved` deleting
  dependent edges and its hosted flow. Shows how to assert an invariant ("a plan must never hold
  an orphan flow") rather than a field value.
