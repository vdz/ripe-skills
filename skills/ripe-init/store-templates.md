# Store File Templates

All files in `src/store/`. No substitutions needed — these are not project-name dependent.

---

## src/store/types.ts

Global types shared across all store branches. Define enum-like values as a `const` hashmap with a derived type — not a TS `enum`, not a bare string union. No runtime reverse-mapping, tree-shakeable, iterable via `Object.values(LOADING_STATES)`, and the value and the type share one source. Apply this pattern to any enum-like type (filter values, role types, status values, etc.).

This file also exports `Listener` — the shape every branch's `.listener.ts` conforms to.
It must be here from the start: the first branch you add imports it, and
`building-ripe-store` tells you to.

```typescript
import type { ListenerEffectAPI, AnyAction } from '@reduxjs/toolkit';
import type { RootState, AppDispatch } from './store';

export const LOADING_STATES = {
  idle: 'idle',
  loading: 'loading',
  loaded: 'loaded',
  error: 'error',
} as const;

export type LoadingState = typeof LOADING_STATES[keyof typeof LOADING_STATES];

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

Two things to keep as-is:

The `RootState`/`AppDispatch` import from `./store` is type-only, so the apparent cycle with
`store.ts` is erased at compile time.

`actionCreator` is typed **structurally** (`{ type, match }`) rather than as a union of RTK's
`ActionCreatorWithPayload<…>` / `ActionCreatorWithoutPayload<…>`. That is deliberate and
load-bearing: under `strict`, **no** concrete type argument to `ActionCreatorWithPayload<T>`
accepts every action creator. Measured against RTK 2.12 / tsc 5.9:

| Annotation | no-payload creator | with-payload creator | why |
|---|---|---|---|
| `<unknown>` | rejected | rejected | call-signature parameters are contravariant: `unknown` is not assignable to `void`, nor to `{ … }` |
| `<never>` | rejected | rejected | `match` is a type predicate, so its `payload` sits in a covariant position and nothing is assignable to `never` |
| `<any>` | accepted | accepted | only compiles by disabling `@typescript-eslint/no-explicit-any` |

So the union form leaves you a choice between a type that rejects real code and an `any` that needs
a lint suppression. The structural shape accepts all forms with neither. `{ type, match }` is
sufficient because it is all `registerListener` reads — and it is what RTK reads too: at runtime
`startListening` does `predicate = actionCreator.match`.

---

## src/store/listener.ts

Creates the listener middleware and registers every branch's listeners. `listenerGroups`
starts empty — each new branch appends its array, which is how a branch becomes live.

```typescript
import { createListenerMiddleware } from '@reduxjs/toolkit';
import type { UnknownAction } from '@reduxjs/toolkit';
import type { Listener } from './types';

export const listenerMiddleware = createListenerMiddleware();

type BranchTypeCarrier = { type: string };

function matcherForTypes(actionCreators: BranchTypeCarrier[]): (action: UnknownAction) => boolean {
  const types = new Set(actionCreators.map((ac) => ac.type));
  return (action) => types.has(action.type);
}

function registerListener(listener: Listener): void {
  const { actionCreator, matcher, effect } = listener;
  type StartListeningArg = Parameters<typeof listenerMiddleware.startListening>[0];

  // Both would mean two different trigger conditions for one effect; `matcher` would win and
  // the actionCreator would be dropped. Fail loudly instead of registering half of what's written.
  if (matcher && actionCreator) {
    throw new Error('Listener sets both `matcher` and `actionCreator` — use exactly one.');
  }

  const options = matcher
    ? { matcher, effect }
    : Array.isArray(actionCreator)
      ? { matcher: matcherForTypes(actionCreator), effect }
      : actionCreator
        ? { actionCreator, effect }
        : null;

  if (!options) {
    throw new Error('Listener has neither `matcher` nor `actionCreator` — nothing would trigger it.');
  }
  listenerMiddleware.startListening(options as unknown as StartListeningArg);
}

// One array per store branch that owns listeners. A branch is not live until its
// listener array appears here AND its reducer appears in store.ts.
const listenerGroups: Listener[][] = [];

listenerGroups.forEach((group) => group.forEach(registerListener));
```

`registerListener` is not boilerplate you can flatten away. RTK's `startListening` accepts
`actionCreator` **or** `matcher`, never an array of action creators — so the array form documented
in [building-ripe-store/listeners.md](../building-ripe-store/listeners.md) has to be converted to
a type-set matcher here.

Registering with a naive `listenerGroups.flat().forEach((l) => startListening(l as never))`
type-checks (the cast hides it) and then never fires for any array-form listener. It doesn't crash
either: RTK catches the failure and emits a `listenerMiddleware/error` on **every dispatch**
(`TypeError: entry.predicate is not a function`). So the symptom is a console full of errors and a
feature that quietly does nothing — cheap to miss, expensive to diagnose.

Both `throw`s above are deliberate. A listener that can never trigger is always a bug, and a
startup crash naming the problem beats a feature that silently doesn't work.

`src/test-utils.ts` needs the same bridge, because `makeTestHarness` registers listeners the same
way — a test that passes against a different registration path is not testing production. Working
reference for both halves: `mce-blueprint/src/store/listener.ts` and
`mce-blueprint/src/test-utils.ts`, kept as deliberate hand-synced twins.

---

## src/store/store.ts

Configures the store. Imports all branch reducers directly. Exports typed `RootState` and `AppDispatch`.

```typescript
import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { listenerMiddleware } from './listener';
import { reducer as appReducer } from './app/app.reducer';
import { reducer as routerReducer } from './router/router.reducer';

export const rootReducer = combineReducers({
  app: appReducer,
  router: routerReducer,
});

export const store = configureStore({
  reducer: rootReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().prepend(listenerMiddleware.middleware),
});

export type RootState = ReturnType<typeof rootReducer>;
export type AppDispatch = typeof store.dispatch;
```

---

## src/store/index.ts

Re-exports everything from `store.ts` and provides typed hooks for use in components.

```typescript
import { useDispatch, useSelector } from 'react-redux';
import type { RootState, AppDispatch } from './store';

export { store, rootReducer } from './store';
export type { RootState, AppDispatch } from './store';

export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector = <T>(selector: (state: RootState) => T): T =>
  useSelector(selector);
```

---

## src/store/app/types.ts

```typescript
import type { LoadingState } from '@/store/types';

export interface AppState {
  loaded: boolean;
  online: boolean;
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

export const reducer = createReducer(defaultState, (builder) => {
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
  location: Location | null;
}

export interface SetLocationPayload {
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

export const reducer = createReducer(defaultState, (builder) => {
  builder.addCase(setLocation, (state, action) => {
    state.location = action.payload.location;
  });
});
```
