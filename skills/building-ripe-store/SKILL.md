---
name: building-ripe-store
description: Creates and modifies Redux store branches following The Ripe Method architecture. Mainly responsible for application business logic. Use when adding or changing application features, adding state management, creating Redux branches, writing actions/reducers/listeners, or building API functions. Covers architectural thinking, store structure, state shape, listeners, and the data flow cycle. For full features requiring both state and UI, pair with building-ripe-components and building-ripe-routing.
---

# Building Ripe Store Branches

## Cardinal Rules

These are non-negotiable. Every other section in this skill assumes them.

**1. Action payloads are interfaces with named fields — always.**
Every action that carries data has a payload `interface` in `types.ts`. Even single-value payloads.
```typescript
// ❌ export type SetRanResultPayload = string;
// ✅ export interface SetRanResultPayload { ranCode: string; }
```
See [action-payloads.md](action-payloads.md) for the full rationale and naming conventions.

**2. Reducers handle data mapping and low-level data maintenance — never business decisions.**
Reducers MAY: assign payload fields to state slots; maintain collection invariants (dedupe a push, cascade-delete an entity's satellites within the same branch, re-derive `filteredItems` on mutation); use a small `if` for those invariants. Reducers MAY NOT: make API calls, decide which *action* to take based on state (listener's job), hold business decisions ("is this user an admin?", "should this transition fire a side effect?"). The test: a guard that protects a data invariant → reducer. A guard that gates a business outcome → listener. Keep reducer logic to a minimum either way. See [listeners.md → What CAN live in a reducer vs what CAN'T](listeners.md#what-can-live-in-a-reducer-vs-what-cant) for worked examples.

**3. Collections use the dual structure.**
`items: string[]` for order + `byId: Record<string, T>` for O(1) lookup. Never one without the other. See [state-shape.md](state-shape.md) for the canonical pattern and the optional `filteredItems` projection.

**4. State has complete defaults.**
No `undefined`. Use `null` for optional refs, `LOADING_STATES.idle` for status, `[]` / `{}` for collections. A fully-defaulted tree makes the shape knowable from `defaultState` alone, lets every selector read fields without `?.` guards, and means a fresh branch renders its empty state instead of throwing on `undefined.map`. The line to hold: `null` is an intentional "no value yet" — it's data. `undefined` is "shape unknown" — a hole in the tree. See [state-shape.md](state-shape.md#default-state-requirements).

**5. Listeners hydrate; components don't fetch.**
Components don't `dispatch(fetchX())` on mount. Listeners react to navigation, auth, or init signals — so no component owns both "decide when to fetch" and "render the result". That coupling is the thing Ripe removes: left in place it spreads — every page repeats it, every test mocks it. See [listeners.md](listeners.md#pattern-5-preemptive-hydration-via-setlocation).

**6. Derived selectors are memoised — but not every prop needs a named selector.**
Any *named* selector that returns a new array, object, or computed structure on every call must be wrapped with `createSelector` from `@reduxjs/toolkit` (already bundled). Plain function selectors are right for direct slice reads, lookups by id, and primitive returns — they're naturally reference-stable. Components don't need a named selector for every prop read; inline `useAppSelector((s) => s.x.y)` is fine for one-off direct reads. Named selectors earn their place when they're branch-level useful, derived/computed, or carry semantic meaning. See [state-shape.md](state-shape.md#selectors-and-memoisation).

## Branch File Structure

```
store/
├── store.ts          # configureStore + typed hooks (root)
├── listener.ts       # listenerMiddleware + listener registration (root)
├── types.ts          # Shared types (Listener, LOADING_STATES)
├── index.ts          # Re-exports
└── products/         # One folder per feature
	├── api/
	│   ├── fetchProducts.ts
	│   └── updateProduct.ts
	├── __tests__/
	│   └── products.reducer.test.ts
	├── types.ts                  # State shape, payload, API interfaces
	├── products.actions.ts
	├── products.reducer.ts
	├── products.selectors.ts     # Optional, only if needed
	└── products.listener.ts
```

Tests live in `__tests__/` — never alongside source files. Imports use `../` to reach the parent.

## Common Tasks

| What you're doing | Read |
|---|---|
| Creating a brand-new feature branch end-to-end | [creating-a-branch.md](creating-a-branch.md) |
| Adding a new action or payload to an existing branch | [action-payloads.md](action-payloads.md) |
| Designing or extending state (collections, filters, defaults) | [state-shape.md](state-shape.md) |
| Writing or naming a selector — inline vs named vs memoised | [selectors.md](selectors.md) |
| Writing or modifying a listener (single, matcher, debounce, hydration, error handling) | [listeners.md](listeners.md) |
| Deciding which tests a new branch ships with | [testing.md](testing.md) |
| Looking up the canonical scaffold for root files | [store-templates.md](../ripe-init/store-templates.md) |
| Anything routing-related | `building-ripe-routing` skill |

## The `Listener` Interface

`store/types.ts` defines the `Listener` interface that every feature's `<feature>.listener.ts` exports. The Ripe convention is **declarative listener arrays** — each feature exports a `Listener[]` and the root `listener.ts` registers them all in one pass.

```typescript
// store/types.ts (excerpt)
import type { ListenerEffectAPI, AnyAction } from "@reduxjs/toolkit";
import type { RootState, AppDispatch } from "./store";

export interface BranchActionCreator {
	type: string;
	match: (action: unknown) => boolean;
}

export interface Listener {
	actionCreator?: BranchActionCreator | BranchActionCreator[];
	matcher?: (action: AnyAction) => boolean;
	effect: (
		action: AnyAction,
		listenerApi: ListenerEffectAPI<RootState, AppDispatch>,
	) => void | Promise<void>;
}
```

> **Why `actionCreator` is structural.** Under `strict`, no concrete type argument to
> `ActionCreatorWithPayload<T>` accepts every action creator. `<unknown>` rejects **both** kinds,
> because call-signature parameters are contravariant (`unknown` is assignable to neither `void`
> nor a concrete payload type). `<never>` also rejects both, because `match` is a type predicate
> and puts `payload` in a covariant position. `<any>` accepts both, but only by disabling
> `@typescript-eslint/no-explicit-any`. `{ type, match }` accepts every form with no `any` and no
> lint suppression — and it is what RTK itself reads: `startListening` does
> `predicate = actionCreator.match`. Verified against RTK 2.12 / tsc 5.9; see
> [store-templates.md](../ripe-init/store-templates.md) for the per-annotation table.

> `AnyAction` on `effect` lets bodies read `action.payload.X` directly, because `AnyAction` carries
> an `any`-typed `payload` from the library types — the lint rule only flags `any` written in your
> code. For strict payload typing at the use site, narrow with a cast:
> `const { userId } = (action as PayloadAction<{ userId: string }>).payload;`.

`LOADING_STATES` and `LoadingState` also live in `store/types.ts`. See [store-templates.md](../ripe-init/store-templates.md) for the canonical scaffold (const hashmap + derived type, not a TS `enum`).

## Adding a Branch to the Root

After scaffolding the branch (see [creating-a-branch.md](creating-a-branch.md)), wire it into the root:

**`store/store.ts`** — add to the `reducer` map:
```typescript
import { productsReducer } from './products/products.reducer';
// ...
configureStore({
	reducer: {
		// ...existing
		products: productsReducer,
	},
	// ...
});
```

**`store/listener.ts`** — add to the `listenerGroups` array:
```typescript
import { listener as productsListener } from './products/products.listener';
// ...
const listenerGroups: Listener[][] = [
	// ...existing
	productsListener,
];
```

A branch isn't live until **both** are registered.

## Workflow Checklist

```
Store Branch Progress:
- [ ] Create store/[feature]/ folder
- [ ] Create types.ts: state shape + payload interfaces
- [ ] Create [feature].actions.ts: createAction for each event
- [ ] Create [feature].reducer.ts: defaultState + simple assignment cases
- [ ] Create api/[verb][Feature].ts: fetch + format response if needed
- [ ] Create [feature].listener.ts: export Listener[] with business logic + error handling
- [ ] Create __tests__/[feature].reducer.test.ts + [feature].listener.test.ts — see `building-ripe-tests`
- [ ] Register reducer in store.ts configureStore
- [ ] Register listener array in listener.ts initAppListeners
- [ ] Verify: reducer has no if statements or API calls
- [ ] Verify: payloads arrive pre-formatted (match state shape)
- [ ] Verify: listeners handle all error cases
- [ ] Verify: no useEffect in components fetching this branch's data
```

**Import aliasing:** Use `@` as alias for `src/` in all imports (e.g., `@/store/types`, `@/modules/api`).

## References

| Document | When to read | What's covered |
|---|---|---|
| [creating-a-branch.md](creating-a-branch.md) | Creating a brand-new feature branch end-to-end | 8 steps, file-by-file templates (types, actions, reducer, api, listener, tests), root registration |
| [state-shape.md](state-shape.md) | Designing branch state, picking defaults, handling filtered/searched/sorted views | Six rules, dual structure, pre-computed projections (`filteredItems`), `LOADING_STATES`, defaults, full branch example |
| [selectors.md](selectors.md) | Writing or naming a selector; deciding inline vs named vs memoised | Named-selector criteria, plain function vs `createSelector`, the memoisation test, React 19 / React Compiler, parametric selectors |
| [action-payloads.md](action-payloads.md) | Adding actions, designing payloads, naming | Payload-as-interface rule, action naming, actions file template, common pitfalls |
| [listeners.md](listeners.md) | Writing or modifying a listener | 8 patterns (single, matcher, predicate, debounce, preemptive hydration, two-listener intent chain, concurrency, concurrent-action guards), error handling, action chains, common mistakes |
| [testing.md](testing.md) | Deciding which tests a new branch needs | The branch's test files, coverage expectations, pointers into `building-ripe-tests` |
| [store-templates.md](../ripe-init/store-templates.md) | Looking up the canonical scaffold for root files | Initial files generated by `ripe-init`; canonical source for `LOADING_STATES` |
| `building-ripe-routing` skill | Routing setup, the `setLocation` bridge, route-driven hydration | Separate skill — load it if the task touches routes or navigation |
