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

Real files in `mce-demo-portal`:
- `src/store/auth/__tests__/auth.reducer.test.ts` — simplest shape; identity-field assignment
- `src/store/demos/__tests__/demos.reducer.test.ts` — fetch lifecycle with prior state piping
- `src/store/ui/__tests__/ui.reducer.test.ts` — multiple unrelated actions; one `describe` per action
