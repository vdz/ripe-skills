# Store File Templates

All files in `src/store/`. No substitutions needed — these are not project-name dependent.

---

## src/store/types.ts

Global types shared across all store branches. Define enum-like values as a `const` hashmap with a derived type — not a TS `enum`, not a bare string union. No runtime reverse-mapping, tree-shakeable, iterable via `Object.values(LOADING_STATES)`, and the value and the type share one source. Apply this pattern to any enum-like type (filter values, role types, status values, etc.).

This file also exports `Listener` — the shape every branch's `.listener.ts` conforms to.
It must be here from the start: the first branch you add imports it, and
`building-ripe-store` tells you to.

```typescript
import type { ListenerEffectAPI, UnknownAction } from '@reduxjs/toolkit';
import type { AppRouter } from '@/router/types';
import type { RootState, AppDispatch } from './store';

export const LOADING_STATES = {
  idle: 'idle',
  loading: 'loading',
  loaded: 'loaded',
  error: 'error',
} as const;

export type LoadingState = typeof LOADING_STATES[keyof typeof LOADING_STATES];

/**
 * Any RTK action creator, whatever its payload shape.
 *
 * `any[]` is deliberate: creators have arbitrary parameter shapes (no-payload,
 * single payload, multi-arg). `unknown[]` would break contravariance — a typed
 * creator like `ActionCreatorWithPayload<P>` would not be assignable, because
 * the parameter must accept the narrower `P`, not just `unknown`.
 *
 * `match` is a type predicate, as every RTK creator's is: that is what lets the
 * registry hand the creator to `startListening` without a cast.
 */
type AnyActionCreator = { type: string; match: (action: unknown) => action is UnknownAction } & ((
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ...args: any[]
) => UnknownAction);

/** What every listener is handed beyond the store: the app's router, for the
 *  redirects that follow a listener's own logic. Handed in when the store is
 *  made, so a listener never waits on a component to supply it. */
export interface ListenerExtra {
  /** The router the app renders. `router.navigate(...)` moves the address. */
  router: AppRouter;
}

/** The side effect a listener runs. Receives the matched action and the
 *  listener API (dispatch, getState, delay, cancelActiveListeners…, and
 *  `extra.router`), typed to this app's store so no effect has to widen or
 *  narrow what it is handed. */
export type ListenerEffect = (
  action: UnknownAction,
  listenerApi: ListenerEffectAPI<RootState, AppDispatch, ListenerExtra>,
) => void | Promise<void>;

/** A listener that fires on one action creator. */
export interface ActionListener {
  /** Fire the effect when this action is dispatched. To match several actions,
   *  use a `MatcherListener` with `isAnyOf(a, b, …)`. */
  actionCreator: AnyActionCreator;
  /** The side effect to run. May be async. */
  effect: ListenerEffect;
}

/** A listener that fires when a predicate matches the action. */
export interface MatcherListener {
  /** Fire when this predicate matches (e.g. `isAnyOf(actionA, actionB)`). A type
   *  predicate, like `isAnyOf` and every creator's `match`, so RTK's matcher
   *  overload accepts it as is. */
  matcher: (action: unknown) => action is UnknownAction;
  /** The side effect to run. May be async. */
  effect: ListenerEffect;
}

/** Per-branch listener entry: exactly one trigger, an action creator or a
 *  matcher. A union rather than two optional fields, so an entry with neither
 *  trigger (or both) is a type error and the registry can hand each shape to
 *  RTK's matching `startListening` overload without a cast. */
export type Listener = ActionListener | MatcherListener;
```

Four things to keep as-is:

The `RootState`/`AppDispatch` import from `./store` is type-only, so the apparent cycle with
`store.ts` is erased at compile time. The `AppRouter` import is type-only too, so the store never
loads the router module at runtime.

`ListenerExtra` carries the router as a dependency, never as state: the router is a live object, and
`state.router` holds only the location `setLocation` mirrors. Listeners navigate with
`extra.router.navigate(...)` — see
[building-ripe-routing → navigation.md](../building-ripe-routing/navigation.md#programmatic-navigation-from-listeners).

`Listener` is a **discriminated union**, not an interface with two optional fields. The optional
form needs runtime `throw`s for "neither" and "both" and a cast to reach RTK's overloads; the union
makes both cases compile errors and lets `registerListener` narrow with `'actionCreator' in entry`.
There is no array form — `actionCreator: [a, b]` — because RTK has none; several triggers are a
`matcher: isAnyOf(a, b)`.

The effect receives `UnknownAction`, so an effect that reads a payload narrows first with the
creator's own `.match` (`if (!flowNext.match(action)) return;`) — never `action.payload as …`.
`AnyActionCreator` carries the one `any` in the store, with its reason in the comment; the
alternative is a `{ type, match }` structural shape whose `match` is not a type predicate, which
then needs a cast at registration.

---

## src/store/listener.ts

Registers every branch's listeners on a fresh listener middleware via `initAppListeners(extra)`
— the registration pass `building-ripe-store` refers to. `listeners` starts empty — each
new branch appends its array, which is how a branch becomes live.

```typescript
import { createListenerMiddleware } from '@reduxjs/toolkit';
import type { TypedStartListening } from '@reduxjs/toolkit';
import type { RootState, AppDispatch } from './store';
import type { Listener, ListenerExtra } from './types';

// One array per store branch that owns listeners. A branch is not live until its
// listener array appears here AND its reducer appears in store.ts.
// Order matters once: when listener A must run before listener B on the same action, say why here.
const listeners: Listener[][] = [];

/** `startListening` bound to this app's state, dispatch and listener extra. */
export type AppStartListening = TypedStartListening<RootState, AppDispatch, ListenerExtra>;

/** Register one entry. RTK's `startListening` is overloaded per trigger shape
 *  (`actionCreator` or `matcher`), so the union is narrowed here and each shape
 *  goes to its own overload — typed end to end, no cast. Shared with the test
 *  harness so a test registers a listener exactly the way the app does. */
export function registerListener(startListening: AppStartListening, entry: Listener): void {
  if ('actionCreator' in entry) {
    startListening({ actionCreator: entry.actionCreator, effect: entry.effect });
  } else {
    startListening({ matcher: entry.matcher, effect: entry.effect });
  }
}

/** Registers every branch's `Listener[]` with a fresh RTK listener middleware,
 *  each handed `extra`, and returns it for `configureStore`. Fresh per call, so
 *  each store built by `makeStore` gets its own registrations rather than a
 *  shared, growing set. */
export function initAppListeners(extra: ListenerExtra) {
  const listenerMiddleware = createListenerMiddleware({ extra });
  const startAppListening = listenerMiddleware.startListening.withTypes<RootState, AppDispatch, ListenerExtra>();

  for (const group of listeners) {
    for (const entry of group) {
      registerListener(startAppListening, entry);
    }
  }
  return listenerMiddleware;
}
```

`initAppListeners(extra)` is called by `makeStore` (below), not at module load: the middleware is
created per store, so a second store (a test, a hot reload) does not inherit the first store's
registrations. Nothing else calls it.

`registerListener` is not boilerplate you can flatten away. RTK's `startListening` is overloaded
per trigger shape, and a naive `listeners.flat().forEach((l) => startListening(l as never))`
type-checks only because the cast hides the mismatch. The `in` narrowing hands each union member to
its own overload with no cast, and the same function is what `makeTestHarness` calls — a test that
passes against a different registration path is not testing production. Working reference for both
halves: the MCE trade-in app's `src/store/listener.ts` and `src/store/__tests__/makeTestHarness.ts`
(`mce`, `src/clients/mce/tradein`).

---

## src/store/store.ts

Configures the store. Imports all branch reducers directly into one **reducer map**, exported for
the test harness. `makeStore` is a factory so the boot can hand in the app's router — passed to
every listener as `extra` — and a saved snapshot as `preloadedState`, where every branch the
snapshot lacks starts from its reducer's own default. No restore action, no root-reducer wrapper.

```typescript
import { configureStore } from '@reduxjs/toolkit';
import type { StateFromReducersMapObject } from '@reduxjs/toolkit';
import type { AppRouter } from '@/router/types';
import { initAppListeners } from './listener';
import { appReducer } from './app/app.reducer';
import { routerReducer } from './router/router.reducer';

/** The app's branches. Exported for the test harness under `__tests__`, which
 *  builds an isolated store with exactly this shape and only the listeners under test. */
export const reducer = {
  app: appReducer,
  router: routerReducer,
};

/** The store's shape, spelled from the reducer map so `makeStore` can accept
 *  part of it before any store exists. */
export type RootState = StateFromReducersMapObject<typeof reducer>;

/** Build the app's store. `router` is the one the app renders, handed to every
 *  listener for its redirects. Called once, from `main.tsx`. */
export function makeStore(router: AppRouter, preloadedState?: Partial<RootState>) {
  return configureStore({
    reducer,
    preloadedState,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().prepend(initAppListeners({ router }).middleware),
  });
}

export type AppStore = ReturnType<typeof makeStore>;
export type AppDispatch = AppStore['dispatch'];
```

`main.tsx` makes the router, calls `makeStore(router)` once (with the saved snapshot as the second
argument, if the app persists one) and hands the result to `<Provider>`. There is no module-level
`store` constant: a singleton would be created at import time by whichever module imported it
first, including a test.

---

## src/store/index.ts

Re-exports the factory and types from `store.ts` and provides typed hooks for use in components.

```typescript
import { useDispatch, useSelector } from 'react-redux';
import type { RootState, AppDispatch } from './store';

export { makeStore } from './store';
export type { AppStore, RootState, AppDispatch } from './store';

/** Typed `useDispatch`, so a thunk-free dispatch still narrows action creators. */
export const useAppDispatch = () => useDispatch<AppDispatch>();

/** Typed `useSelector`, so selectors read a known state shape. */
export const useAppSelector = <T>(selector: (state: RootState) => T): T =>
  useSelector(selector);
```

---

## src/store/__tests__/makeTestHarness.ts

The one test seam: an isolated store over the app's own `reducer` map, with only the listeners
under test registered through the app's own `registerListener`, and every dispatched action
recorded. Full source and rules in
[building-ripe-tests → the harness](../building-ripe-tests/SKILL.md#the-harness); scaffold it
verbatim from there. It lives inside `store/` because it is the store's test seam, not a
project-wide `src/test-utils.ts`.

---

## src/config.ts

Environment only: bare exported consts, and the **only** module that reads `import.meta.env` — a
grep for it has exactly one hit (`STORE-M-ENV-OUTSIDE-CONFIG`). Journey parameters (timeouts, skip
flags, thresholds) do **not** live here: each branch's reducer declares them in its `initialState`,
listeners read them through `getState()`, screens select them, and a test or a client overrides them
through `makeStore(router, preloadedState)` (`STORE-M-CASE-WRITES-PARAMS` guards the declaration).

```typescript
/** True in a Vite dev build. The one place `import.meta.env` is read. */
export const isDevBuild: boolean = import.meta.env.DEV;
```

---

## src/store/app/types.ts

```typescript
import type { LoadingState } from '@/store/types';

export interface AppState {
  /** True once the boot sequence has finished. */
  loaded: boolean;
  /** Mirrors `navigator.onLine`, kept current by the app listener. */
  online: boolean;
  /** Where the boot sequence is. */
  status: LoadingState;
}
```

---

## src/store/app/app.actions.ts

```typescript
import { createAction } from '@reduxjs/toolkit';

export const appLoaded = createAction('app/loaded');
export const wentOnline = createAction('app/wentOnline');
export const wentOffline = createAction('app/wentOffline');
```

Two no-payload actions rather than one boolean-payload action. A boolean payload names a
*setter*, not an event — the action can no longer say why the value changed, and every
listener that cares has to branch on the payload. See
[action-payloads.md](../building-ripe-store/action-payloads.md).

---

## src/store/app/app.reducer.ts

```typescript
import { createReducer } from '@reduxjs/toolkit';
import { LOADING_STATES } from '@/store/types';
import type { AppState } from './types';
import { appLoaded, wentOnline, wentOffline } from './app.actions';

const defaultState: AppState = {
  loaded: false,
  online: true,
  status: LOADING_STATES.idle,
};

export const appReducer = createReducer(defaultState, (builder) => {
  builder
    .addCase(appLoaded, (state) => {
      state.loaded = true;
      state.status = LOADING_STATES.loaded;
    })
    .addCase(wentOnline, (state) => {
      state.online = true;
    })
    .addCase(wentOffline, (state) => {
      state.online = false;
    });
});
```

---

## src/store/router/types.ts

```typescript
import type { Location } from 'react-router-dom';

export interface RouterState {
  /** The router's current location, or null before the first navigation. */
  location: Location | null;
}

export interface SetLocationPayload {
  /** The location the router just navigated to. */
  location: Location;
}
```

---

## src/store/router/router.actions.ts

```typescript
import { createAction } from '@reduxjs/toolkit';
import type { SetLocationPayload } from './types';

export const setLocation = createAction<SetLocationPayload>('router/setLocation');
```

---

## src/store/router/router.reducer.ts

```typescript
import { createReducer } from '@reduxjs/toolkit';
import type { RouterState } from './types';
import { setLocation } from './router.actions';

const defaultState: RouterState = {
  location: null,
};

export const routerReducer = createReducer(defaultState, (builder) => {
  builder.addCase(setLocation, (state, action) => {
    state.location = action.payload.location;
  });
});
```
