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

## The Feature Loop

A full Ripe feature is one vertical slice, built in this order. If a spec or interview workflow preceded the task, the loop consumes its decisions — it does not re-open them (see [creating-a-branch.md → Step 0](creating-a-branch.md#step-0-state-composition-is-a-human-decision)).

1. **State first** — understand the state-structure changes; where needed, add a branch: state type, `defaultState`, reducer shell → [state-shape.md](state-shape.md), [creating-a-branch.md](creating-a-branch.md)
2. **Actions as vocabulary** — name the newly added functionality. Existing actions are often reused — no new actions is a normal outcome. Payloads only where data is actually carried, typed → [action-payloads.md](action-payloads.md)
3. **Reducer cases** — data mapping and invariant maintenance only (Cardinal Rule 2)
4. **Listeners** — in the branch, or elsewhere when the cross-branch rule says so; keep them thin → [listeners.md](listeners.md)
5. **API functions** — new or updated, in the branch's `api/` folder, one file per verb; nothing outside `api/` talks to the network or the platform → [api.md](api.md)
6. **Root wiring** — register the reducer and the listener array ("Adding a Branch to the Root" below)
7. **Routes before components** — set up routes to the new feature's assets before the components exist → `building-ripe-routing`
8. **Components** — as the spec/plan commands → `building-ripe-components`
9. **Selector optimizations** — decide whether smart selectors apply; add them where they belong → [selectors.md](selectors.md)
10. **Tests all over, per convention** → [testing.md](testing.md), `building-ripe-tests`

**Verify as you go:** typecheck + the branch's own test files during the build; the full suite once near the end. Refactors the slice doesn't need belong to review, not to this loop.

**Close with verification:** run the feature for real in the browser (e2e), then `ripe-audit` before merge — that's the *standards* axis. Spec fidelity is the outer workflow's job.

## Branch File Structure

```
store/
├── store.ts          # the reducer map, RootState, makeStore(preloadedState?) (root)
├── listener.ts       # registerListener + initAppListeners (root)
├── types.ts          # Shared types (Listener union, LOADING_STATES)
├── index.ts          # Re-exports + typed hooks
├── __tests__/
│   └── makeTestHarness.ts        # the one test harness, built from the same reducer map
└── products/         # One folder per feature
	├── api/                      # every side effect of this branch — see api.md
	│   ├── fetchProducts.ts
	│   └── updateProduct.ts
	├── __tests__/
	│   └── products.reducer.test.ts
	├── types.ts                  # State shape, payload, API interfaces — always this name
	├── products.actions.ts
	├── products.reducer.ts
	├── products.selectors.ts     # Optional, only if needed
	└── products.listener.ts      # or listeners/<concern>.listener.ts when one file would not do
```

Tests live in `__tests__/` — never alongside source files. Imports use `../` to reach the parent.

The store vocabulary is exactly this: `types`, `actions`, `reducer`, `selectors`, `listener`, `api/`. There is no `.brain.ts`, no `.definition.ts`, no `.config.ts` inside a branch — a listener decides, a reducer declares its defaults literally, and constants live in `types.ts` as `as const` maps with their unions derived from them.

A branch that grows past one listener file splits it by concern under `listeners/` (`store/diagnostics/listeners/clock.listener.ts`, `camera.listener.ts`, …) and re-exports the concatenated array from `<feature>.listener.ts`; the root still registers one array per branch.

### Where the store sits in `src/`

```
src/
├── assets/         locales/<lang>.ts (typed copy) · styles/tokens.css · <concern>/ images
├── components/     <Name>/{<Name>.tsx, <Name>.styled.tsx, types.ts, __tests__/}
├── config.ts       environment only — the ONE module that reads import.meta.env; journey parameters are reducer defaults
├── lib/
│   ├── utils/      pure helpers: a value in, a value out, no I/O (structured by concern)
│   └── modules/    deep implementations that talk to the outside world (bridge, codec, mock flags)
├── main.tsx        makeStore(restoreFrom(await readSavedSession())) → <Provider>
└── store/          as above
```

Two placement tests, and nothing else:

- **`lib/utils` vs `lib/modules`:** does it touch the outside world? No → `utils`. Yes → `modules`. There is no top-level `modules/` beside `lib/`, and no `utils/` scattered under `components/`.
- **`lib/modules` vs `store/<branch>/api/`:** a module is *how* something is done (the webview bridge's handshake, the snapshot codec); the branch's `api/` is *the call the listener makes*. When a branch uses a module's side-effecting surface, it gets a thin `api/<name>.ts` that re-exports exactly what it calls, so every side effect is still reachable from `store/*/api/` — see [api.md](api.md). A pure codec in `lib/modules/` (no I/O) is imported like any helper.

`lib/utils` may `import type` from `store/<branch>/types` — a helper that shapes a payload needs its interface — and nothing else from the store. `config.ts` exports bare typed constants (`export const isDevBuild: boolean = import.meta.env.DEV`, the shell's boot values) and nothing about the journey — a check's parameters are its record's `params` in the reducer's `initialState`; a grep for `import.meta.env` has exactly one hit.

Code copied in from a library or a sibling app carries a provenance header — where it came from, at which revision, what was kept and what was not — and everything the app does not run is deleted rather than carried. **Its documentation is rewritten on copy, not kept:** a module whose JSDoc describes another tenant's flags is worse than one with none.

Dev-only switches have one home, `lib/modules/mockJourney/` (`flags`, `mockDevice`, `index`). Its index JSDoc names this app's modes — in the trade-in app, full mock (`?mockJourney=1`: the session listener skips the auth handshake and the device api answers with canned facts) and hybrid (`?mockDevice=1`: canned facts, real session) — the flags are sessionStorage-sticky so a reload keeps the mode, and every read is guarded by `isDevBuild` from `config.ts` so the module drops out of the production bundle. A branch reaches it through its own `api/` function, never from a component.

## Common Tasks

| What you're doing | Read |
|---|---|
| Creating a brand-new feature branch end-to-end | [creating-a-branch.md](creating-a-branch.md) |
| Adding a new action or payload to an existing branch | [action-payloads.md](action-payloads.md) |
| Designing or extending state (collections, filters, defaults) | [state-shape.md](state-shape.md) |
| Writing or naming a selector — inline vs named vs memoised | [selectors.md](selectors.md) |
| Writing or modifying a listener (single, matcher, debounce, hydration, error handling, a hardware check's run) | [listeners.md](listeners.md) |
| Adding a network or platform call — where it lives, who may call it, the grep rule | [api.md](api.md) |
| Deciding which tests a new branch ships with | [testing.md](testing.md) |
| Looking up the canonical scaffold for root files | [store-templates.md](../ripe-init/store-templates.md) |
| Anything routing-related | `building-ripe-routing` skill |

## The `Listener` Union

`store/types.ts` defines the `Listener` type that every feature's `<feature>.listener.ts` exports. The Ripe convention is **declarative listener arrays** — each feature exports a `Listener[]` and the root `listener.ts` registers them all in one pass. `Listener` is a discriminated union of the two shapes RTK's `startListening` accepts, so the compiler — not a runtime check — knows which one it is holding:

```typescript
// store/types.ts (excerpt)
import type { ListenerEffectAPI, UnknownAction } from "@reduxjs/toolkit";
import type { RootState, AppDispatch } from "./store";

/**
 * Any RTK action creator, payload or not. Structural: `match` is the type
 * predicate RTK reads, and the call signature is `any`-parametered because
 * call parameters are contravariant — `unknown` would reject every creator
 * with a payload, `never` every one without.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyActionCreator = { type: string; match: (action: unknown) => action is UnknownAction } & ((...args: any[]) => UnknownAction);

export type ListenerEffect = (
	action: UnknownAction,
	listenerApi: ListenerEffectAPI<RootState, AppDispatch>,
) => void | Promise<void>;

/** Reacts to one action creator. */
export interface ActionListener {
	/** The creator whose actions run the effect; its `.match` narrows the payload inside. */
	actionCreator: AnyActionCreator;
	/** Runs after the reducers have seen the action. */
	effect: ListenerEffect;
}

/** Reacts to whatever the type predicate admits — `isAnyOf(...)`, or a hand-written guard. */
export interface MatcherListener {
	/** Admits the actions that run the effect; the effect narrows again per creator before reading a payload. */
	matcher: (action: unknown) => action is UnknownAction;
	/** Runs after the reducers have seen the action. */
	effect: ListenerEffect;
}

export type Listener = ActionListener | MatcherListener;
```

> **Why a union, not one interface with optional fields.** `{ actionCreator?; matcher?; effect }` admits an entry with neither and an entry with both, and the registration code has to cast to reach either. With the union, `"actionCreator" in entry` narrows, and there is exactly one way to hand an entry to RTK:

```typescript
// store/listener.ts (excerpt)
import { createListenerMiddleware } from "@reduxjs/toolkit";
import type { TypedStartListening } from "@reduxjs/toolkit";
import type { Listener } from "./types";
import type { RootState, AppDispatch } from "./store";

export type AppStartListening = TypedStartListening<RootState, AppDispatch>;

/** The one path from a `Listener` entry into RTK — the app and the test harness both use it. */
export function registerListener(startListening: AppStartListening, entry: Listener): void {
	if ("actionCreator" in entry) {
		startListening({ actionCreator: entry.actionCreator, effect: entry.effect });
	} else {
		startListening({ matcher: entry.matcher, effect: entry.effect });
	}
}

export function initAppListeners() {
	const listenerMiddleware = createListenerMiddleware();
	const startAppListening = listenerMiddleware.startListening.withTypes<RootState, AppDispatch>();
	for (const group of listeners) {
		for (const entry of group) registerListener(startAppListening, entry);
	}
	return listenerMiddleware;
}
```

> **Reading the payload.** `effect` receives `UnknownAction`, so a body narrows with the creator's own guard before touching `payload` — `if (!checkStarted.match(action)) return;` — and the payload is fully typed from there. **Never** `action.payload as {...}`: the monorepo's root `.eslintrc.js` sets `@typescript-eslint/consistent-type-assertions` to `assertionStyle: "never"`, the client-apps block leaves it in force, and CI lints with that root config — the app's own flat config is not the gate. For a matcher over several creators, narrow per branch: `if (clockStarted.match(action) || clockResumed.match(action)) { … action.payload.id … }`.

`LOADING_STATES` and `LoadingState` also live in `store/types.ts`. See [store-templates.md](../ripe-init/store-templates.md) for the canonical scaffold (const hashmap + derived type, not a TS `enum`).

## The Store Root: Reducer Map, `RootState`, `makeStore`

`store.ts` holds the reducer map as a plain exported object and spells the root type from it. There is no `combineReducers`, no `rootReducer` module, and no `ReturnType<typeof store.getState>` — the type has to exist before any store does, because the factory accepts part of it:

```typescript
// store/store.ts
import { configureStore } from "@reduxjs/toolkit";
import type { StateFromReducersMapObject } from "@reduxjs/toolkit";
import { initAppListeners } from "./listener";
import { sessionReducer } from "./session/session.reducer";
import { flowsReducer } from "./flows/flows.reducer";
import { productsReducer } from "./products/products.reducer";

/** Exported for the test harness, which builds an isolated store with exactly this shape. */
export const reducer = {
	session: sessionReducer,
	flows: flowsReducer,
	products: productsReducer,
};

export type RootState = StateFromReducersMapObject<typeof reducer>;

/**
 * A factory, not a module-level constant, because one thing happens before the
 * store exists: the boot reads the saved session and hands it in here. Every
 * branch the snapshot does not mention starts from the default its reducer
 * declares. There is no restore action and no reducer wrapper.
 */
export function makeStore(preloadedState?: Partial<RootState>) {
	return configureStore({
		reducer,
		preloadedState,
		middleware: (getDefaultMiddleware) => getDefaultMiddleware().prepend(initAppListeners().middleware),
	});
}

export type AppStore = ReturnType<typeof makeStore>;
export type AppDispatch = AppStore["dispatch"];
```

```typescript
// main.tsx (excerpt) — resume is preloadedState, nothing else
const store = makeStore(restoreFrom(await readSavedSession()));
store.dispatch(bootstrapRequested());
```

`restoreFrom` is a pure codec in `lib/modules/persistence/` that turns whatever was saved into a `Partial<RootState>` (or `undefined`), filling in the fields a snapshot never carries (a clock, an in-flight status). Persisting is a listener's job — see [listeners.md](listeners.md) — reading back is the boot's, once.

## Adding a Branch to the Root

After scaffolding the branch (see [creating-a-branch.md](creating-a-branch.md)), wire it into the root:

**`store/store.ts`** — add to the exported `reducer` map (`RootState` follows automatically):
```typescript
import { productsReducer } from "./products/products.reducer";
// ...
export const reducer = {
	// ...existing
	products: productsReducer,
};
```

**`store/listener.ts`** — add to the `listeners` array:
```typescript
import { listener as productsListener } from "./products/products.listener";
// ...
const listeners: Listener[][] = [
	// ...existing
	productsListener,
];
```

A branch isn't live until **both** are registered. Registration order is almost never load-bearing — RTK runs matching listeners concurrently — but when it is (a hardware-release listener that must fire before the one that moves the cursor and opens the next device), put the dependency in a comment on the array.

## Workflow Checklist

```
Store Branch Progress:
- [ ] Create store/[feature]/ folder
- [ ] Create types.ts: state shape + payload interfaces
- [ ] Create [feature].actions.ts: createAction for each event
- [ ] Create [feature].reducer.ts: defaultState + simple assignment cases
- [ ] Create api/[verb][Feature].ts: every network/platform call of this branch, called only from its listener — see api.md
- [ ] Create [feature].listener.ts: export Listener[] with business logic + error handling
- [ ] Create __tests__/[feature].reducer.test.ts + [feature].listener.test.ts — see `building-ripe-tests`
- [ ] Register reducer in store.ts `reducer` map
- [ ] Register listener array in listener.ts `listeners`
- [ ] Verify: reducer `if`s guard data invariants only (e.g. member exists before delete/update) — no business decisions, no API calls
- [ ] Verify: payloads arrive pre-formatted (match state shape)
- [ ] Verify: listeners handle all error cases
- [ ] Verify: no useEffect in components fetching this branch's data
- [ ] Verify: no `as` in the branch (narrow with `.match`, type predicates, typed factories)
- [ ] Verify: lint the way CI does — from the repo root with the root config — before every commit
```

**Import aliasing:** Use `@` as alias for `src/` in all imports (e.g., `@/store/types`, `@/lib/modules/webview`).

## References

| Document | When to read | What's covered |
|---|---|---|
| [creating-a-branch.md](creating-a-branch.md) | Creating a brand-new feature branch end-to-end | 8 steps, file-by-file templates (types, actions, reducer, api, listener, tests), root registration |
| [state-shape.md](state-shape.md) | Designing branch state, picking defaults, handling filtered/searched/sorted views | Six rules, dual structure, pre-computed projections (`filteredItems`), `LOADING_STATES`, defaults, full branch example |
| [selectors.md](selectors.md) | Writing or naming a selector; deciding inline vs named vs memoised | Named-selector criteria, plain function vs `createSelector`, the memoisation test, React 19 / React Compiler, parametric selectors |
| [action-payloads.md](action-payloads.md) | Adding actions, designing payloads, naming | Payload-as-interface rule, action naming, actions file template, common pitfalls |
| [listeners.md](listeners.md) | Writing or modifying a listener | 13 patterns (single, matcher, predicate, debounce, preemptive hydration, two-listener intent chain, concurrency, concurrent-action guards, confirm window, one clock listener, liveness key, watchdog over unclocked time, release backstop), error handling, action chains, common mistakes |
| [api.md](api.md) | Adding a network or platform call | The `store/<branch>/api/` rule, the grep, thin fronts over `lib/modules`, hardware modules keyed by id with a generation counter, `config.ts` as environment only |
| [testing.md](testing.md) | Deciding which tests a new branch needs | The branch's test files, coverage expectations, pointers into `building-ripe-tests` |
| [store-templates.md](../ripe-init/store-templates.md) | Looking up the canonical scaffold for root files | Initial files generated by `ripe-init`; canonical source for `LOADING_STATES` |
| `building-ripe-routing` skill | Routing setup, the `setLocation` bridge, route-driven hydration | Separate skill — load it if the task touches routes or navigation |
