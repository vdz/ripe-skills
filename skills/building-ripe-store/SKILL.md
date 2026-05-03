---
name: building-ripe-store
description: Creates and modifies Redux store branches following The Ripe Method architecture. Use when adding state management, creating Redux slices, writing actions/reducers/listeners, or building API functions. Covers store structure, state shape, listeners, and the data flow cycle. For full features requiring both state and UI, pair with building-ripe-components.
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

**2. Reducers are dumb assignment.**
No `if`, no API calls, no derived computation. All logic lives in listeners.

**3. Collections use the dual structure.**
`items: string[]` for order + `byId: Record<string, T>` for O(1) lookup. Never one without the other. See [state-shape.md](state-shape.md) for the canonical pattern and the optional `filteredItems` projection.

**4. State has complete defaults.**
No `undefined`. Use `null` for optional refs, `LOADING_STATES.idle` for status, `[]` / `{}` for collections.

**5. Listeners hydrate; components don't fetch.**
Components don't `dispatch(fetchX())` on mount. Listeners react to navigation, auth, or init signals. See [listeners.md](listeners.md#pattern-5-preemptive-hydration-via-setlocation).

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
| Writing or modifying a listener (single, matcher, debounce, hydration, error handling) | [listeners.md](listeners.md) |
| Looking up the canonical scaffold for root files | [store-templates.md](../ripe-init/store-templates.md) |
| Anything routing-related | `building-ripe-routing` skill |

## The `Listener` Interface

`store/types.ts` defines the `Listener` interface that every feature's `<feature>.listener.ts` exports. The Ripe convention is **declarative listener arrays** — each feature exports a `Listener[]` and the root `listener.ts` registers them all in one pass.

```typescript
// store/types.ts (excerpt)
import type {
	ActionCreatorWithPayload,
	ListenerEffectAPI,
	AnyAction,
	ActionCreator,
} from "@reduxjs/toolkit";
import type { RootState, AppDispatch } from "./store";

export interface Listener {
	actionCreator?:
		| ActionCreatorWithPayload<unknown, string>
		| ActionCreator<string>
		| Array<ActionCreatorWithPayload<unknown, string> | ActionCreator<string>>;
	matcher?: (action: AnyAction) => boolean;
	effect: (
		action: AnyAction,
		listenerApi: ListenerEffectAPI<RootState, AppDispatch>,
	) => void | Promise<void>;
}
```

> The `unknown` payload generic and `AnyAction` parameter type satisfy `@typescript-eslint/no-explicit-any`. Effect bodies can still access `action.payload.X` as before because `AnyAction` carries an `any`-typed `payload` from the library types — the rule only flags `any` written in your code, not in library type definitions. For strict payload typing at the use site, narrow with a cast: `const { userId } = (action as PayloadAction<{ userId: string }>).payload;`.

`LOADING_STATES` and `LoadingState` also live in `store/types.ts`. See [store-templates.md](../ripe-init/store-templates.md) for the canonical scaffold (const hashmap + derived type, not a TS `enum`).

## Adding a Branch to the Root

After scaffolding the branch (see [creating-a-branch.md](creating-a-branch.md)), wire it into the root:

**`store/store.ts`** — add to the `reducer` map:
```typescript
import { productsReducer } from './products/products.reducer';
// ...
configureStore({
	reducer: { /* ...existing, */ products: productsReducer },
	// ...
});
```

**`store/listener.ts`** — add to the `listeners` array:
```typescript
import { listener as productsListener } from './products/products.listener';
// ...
const listeners: Listener[][] = [ /* ...existing, */ productsListener ];
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
- [ ] Create __tests__/[feature].reducer.test.ts: test state transitions
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
| [action-payloads.md](action-payloads.md) | Adding actions, designing payloads, naming | Payload-as-interface rule, action naming, actions file template, common pitfalls |
| [listeners.md](listeners.md) | Writing or modifying a listener | 5 patterns (single, matcher, predicate, debounce, preemptive hydration), error handling, action chains, common mistakes |
| [store-templates.md](../ripe-init/store-templates.md) | Looking up the canonical scaffold for root files | Initial files generated by `ripe-init`; canonical source for `LOADING_STATES` |
| `building-ripe-routing` skill | Routing setup, the `setLocation` bridge, route-driven hydration | Separate skill — load it if the task touches routes or navigation |
