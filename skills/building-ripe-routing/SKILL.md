---
name: building-ripe-routing
description: Sets up and modifies React Router configuration following The Ripe Method architecture. Use when creating routes, adding pages, setting up navigation, or configuring the router-to-store bridge. Covers router setup, route definitions, the setLocation bridge, preemptive hydration via listeners, and in-component navigation.
---

# Building Ripe Routing

## Routes Are Feature Affordances — Design Them Early

In Ripe, the URL **is part of the feature design**, not a finishing touch. Every feature decision intersects with routing:

| Decision | Route impact |
|---|---|
| What does the user select? | Route param (`/demos/:shorthand`) |
| What modes does the feature have? | Each mode is a route or sub-route (`/demos/new`, `/demos/:shorthand`, `/demos/:shorthand/edit`) |
| What filters / sorts does the user pick? | Each is a query param (`?filter=...&sort=...&q=...`) |
| When should data be hydrated? | On the `setLocation` that enters the route — see [Preemptive Hydration via Listeners](#preemptive-hydration-via-listeners) |
| What state should reset when the user leaves? | Listeners that react to `setLocation` and clear branch state on exit |
| What should be bookmarkable / shareable? | Anything in the URL — pick which feature-state fields earn a URL slot |

**Design routes before components.** When starting a feature, map the user-visible flow to a URL tree first. The result drives:
- The shape of `state.X` (selection IDs, mode flags, filters).
- The listener entries that react to `setLocation` (hydrate on enter, clean up on exit, scope cross-branch UI to matching params).
- The component composition (each route's `element:` is the entry component).

### State is the source of truth — listeners reconcile URL → state

The store is the **source of truth**; the URL is an external artifact that replicates some of that truth for linkability / shareability / browser-history reasons. The two are kept in sync by a listener that watches `setLocation`, identifies what the URL says, and dispatches actions to update whichever state slot needs to change.

```typescript
// ❌ Don't derive feature state from the URL at read time
const isNewMode = useAppSelector((s) => !!matchPath('/demos/new', s.router.location?.pathname));

// ✅ Keep mode in state; a listener reconciles state from setLocation
{
	actionCreator: setLocation,
	effect: async (action, { dispatch, getState }) => {
		const path = action.payload.location.pathname;
		const state = getState();

		if (matchPath('/demos/new', path)) {
			if (state.current.mode !== 'new') dispatch(startNewDemo());
			return;
		}
		// ...other matches reconcile other state slots...
	},
},
```

The URL changing is an **input event** like any other. The listener decides what state needs to update; reducers do the assignment. Components read state, not the URL.

(Components MAY use `useParams()` for the rare case where the URL param is the only useful identifier — but they don't decide feature behaviour from the URL. The listener already updated state by the time the component renders.)

### Routes drive cross-branch behaviour

A feature mounting under `/demos/:shorthand` triggers several listeners off the same `setLocation`:
- `demos.listener` hydrates the entity (`fetchDemoById` on cache miss)
- `current.listener` sets the selection (`selectDemo({ shorthand })`)
- `toolbar.listener` switches modes
- `upload.listener` scopes `UploadProgress` to the matching demo via the upload-shorthand stamp

All separate listeners reacting to the same `setLocation`. No single orchestrator — see [building-ripe-store/listeners.md → Pattern 7: Listener Concurrency](../building-ripe-store/listeners.md#pattern-7-listener-concurrency).

### Rule of thumb

**If you can describe what the user is doing by reading the URL bar alone, the feature design is on track.** If you have to inspect Redux state to know what the user is looking at, the URL is under-specified — go back to [Step 0: State Composition](../building-ripe-store/creating-a-branch.md#step-0-state-composition-is-a-human-decision) and redesign.

## File Structure

All routing config lives in `src/router/`:

```
src/router/
├── router.ts         # createBrowserRouter / createHashRouter setup
├── routes.tsx        # Route tree with named routes
└── types.ts          # AppRouteObject, route param types
```

The router has its own store branch at `store/router/`:

```
store/router/
├── router.actions.ts
├── router.reducer.ts
└── types.ts
```

## Router Setup

```typescript
// src/router/router.ts
import { createHashRouter } from "react-router-dom";
import { routes } from "./routes";

export const router = createHashRouter(routes); // or createBrowserRouter
export type Router = typeof router;
```

## Route Definitions

Routes use a custom `AppRouteObject` that extends React Router's type with a `name` property:

```typescript
// src/router/types.ts
import type { RouteObject } from "react-router-dom";

export interface AppRouteObject extends Omit<RouteObject, "children"> {
  name: string;
  children?: AppRouteObject[];
}
```

```typescript
// src/router/routes.tsx
import type { AppRouteObject } from "./types";
import { App } from "@/components/App/App";
import { Home } from "@/components/Home/Home";
import { Shop } from "@/components/Shop/Shop";
import { NotFound } from "@/components/NotFound/NotFound";

export const routes: AppRouteObject[] = [
  {
    path: "/",
    name: "root",
    element: <App />,
    children: [
      {
        index: true,
        name: "home",
        element: <Home />,
      },
      {
        path: "shop/:shopId",
        name: "shop",
        element: <Shop />,
        children: [
          {
            path: "request/:requestId",
            name: "request",
            element: <Request />,
          },
          {
            path: "add",
            name: "add-customer",
            element: <AddCustomer />,
          },
        ],
      },
    ],
  },
  {
    path: "*",
    name: "not-found",
    element: <NotFound />,
  },
];
```

## The Bridge: App.tsx

The root `App` component bridges React Router into Redux via a single `useEffect`:

```typescript
// src/components/App/App.tsx
import { Suspense, useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useDispatch } from "react-redux";
import { I18nextProvider } from "react-i18next";
import { setLocation } from "@/store/router/router.actions";
import { AppWrapper } from "./App.styled";
import i18n from "@/i18n";
import { AppLoader } from "@/components/AppLoader/AppLoader";
import { useAppSelector } from "@/store/store";

export function App() {
  const location = useLocation();
  const dispatch = useDispatch();

  useEffect(() => {
    dispatch(setLocation({ location }));
  }, [location, dispatch]);

  return (
    <AppWrapper>
      <I18nextProvider i18n={i18n}>
        <Suspense fallback={<AppLoader />}>
          <Outlet />
        </Suspense>
      </I18nextProvider>
    </AppWrapper>
  );
}
```

This dispatches the full `Location` object (not just pathname) so listeners have access to `pathname`, `search`, `hash`, and `state`.

## Router Store Branch

```typescript
// store/router/types.ts
import type { Location } from "react-router-dom";

export type RouterState = {
  location: Location | null;
};

export interface SetLocationPayload {
  location: Location;
}
```

```typescript
// store/router/router.actions.ts
import { createAction } from "@reduxjs/toolkit";
import type { SetLocationPayload } from "./types";

export const setLocation = createAction<SetLocationPayload>("router/setLocation");
```

```typescript
// store/router/router.reducer.ts
import { createReducer } from "@reduxjs/toolkit";
import type { RouterState } from "./types";
import { setLocation } from "./router.actions";

export const defaultState: RouterState = {
  location: null,
};

export const routerReducer = createReducer<RouterState>(defaultState, (builder) => {
  builder.addCase(setLocation, (state, action) => {
    state.location = action.payload.location;
  });
});
```

## Preemptive Hydration via Listeners

Feature listeners react to `setLocation` to load data before the page renders:

```typescript
// store/products/products.listeners.ts
import { matchPath } from "react-router-dom";
import { setLocation } from "@/store/router/router.actions";

listenerMiddleware.startListening({
  actionCreator: setLocation,
  effect: async (action, { dispatch }) => {
    if (matchPath("/products", action.payload.location.pathname)) {
      const payload = await fetchProductsApi();
      dispatch(fetchProductsSuccess(payload));
    }
  },
});
```

Each store branch owns its own `setLocation` listener — no central route controller.

## Idempotency in setLocation Listeners

`setLocation` fires on every location change — including programmatic navigations and hash-only updates. Every dispatching branch in a setLocation listener must guard with a state comparison before dispatching, or arriving at the same URL twice will reset in-flight state (a draft, an active upload, a freshly-loaded entity).

```typescript
{
	actionCreator: setLocation,
	effect: async (action, { dispatch, getState }) => {
		const path = action.payload.location.pathname;
		const state = getState();

		// ✅ Idempotent — guard before dispatching
		if (matchPath('/new', path)) {
			if (state.current.mode !== 'new') dispatch(startNewDemo());
			return;
		}

		const m = matchPath('/:shorthand', path);
		if (m) {
			const shorthand = m.params.shorthand!;
			if (state.current.shorthand !== shorthand) dispatch(selectDemo({ shorthand }));
			return;
		}
	},
},
```

The pattern is always **`if (state.x !== intendedValue) dispatch(action)`** — never unconditional dispatch inside a route-driven listener. Without the guard, the `setLocation` that fires when a child route mounts (or when the URL is set by another listener) clobbers work the first dispatch did. Each branch should `return` after handling — otherwise overlapping matches double-dispatch.

### Same idempotency rule for "user left a route" listeners

Listeners that fire on route-exit (cleanup, save-on-leave, autosave-flush) need the same guard. `setLocation` doesn't fire a "leaving" event — it just fires the new path. The exit listener checks "are we leaving the path we care about?" AND "did we already handle this leave?".

```typescript
{
	actionCreator: setLocation,
	effect: async (action, { dispatch, getState }) => {
		const path = action.payload.location.pathname;
		const state = getState();

		// We're 'leaving' the edit flow if:
		//   - state has an active editing session (we were on /edit)
		//   - the new path isn't an /edit path (we've left)
		const wasEditing   = state.current.editing !== null;
		const stillEditing = !!matchPath('/:shorthand/edit', path);

		if (wasEditing && !stillEditing) {
			dispatch(commitEdit());   // or cancelEdit, depending on policy
		}
	},
},
```

The very rare exception: a route-exit listener whose effect is **truly idempotent** (dispatching `clearTransientUiState()` is safe to call N times). Even then the guard adds clarity. Default to **guard always**; only skip if you can articulate why repetition is safe.

(The `ripe-audit` skill picks up this rule as a `ROUTING-H` check — see checklists/routing.md.)

## Programmatic Navigation from Listeners

When a listener needs to navigate (e.g. after validation, after an API call), import the router directly — **never** inject `useNavigate` from a component:

```typescript
// In any listener file
import { router } from "@/router/router";

// Inside a listener effect:
router.navigate("/summary");
```

React Router's `createBrowserRouter` / `createHashRouter` returns a router object with a public `navigate()` method. This works outside React components with no setup.

**NEVER do this:**
```typescript
// WRONG — mutable module state, temporal coupling, weird dependency direction
let navigate: (path: string) => void = () => {};
export function setNavigate(fn: (path: string) => void) { navigate = fn; }

// WRONG — component injecting into store layer
useEffect(() => { setNavigate(nav); }, [nav]);
```

The injection pattern creates a mutable module variable, only works after the component mounts, and inverts the dependency direction (component → listener).

## In-Component Navigation

Components use `useNavigate` for user-initiated navigation and `useParams` for route params:

```typescript
export function HistoryQueue() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const shopId = useAppSelector((state) => state.shop.id);

  return (
    <QueueWrapper>
      <QueueRow>
        <AddBackToQueue onClick={() => navigate(`/shop/${shopId}/history/readd/${requestId}`)}>
          {t("re-add")}
        </AddBackToQueue>
      </QueueRow>
    </QueueWrapper>
  );
}
```

Components read route params with `useParams`, but data should already be in the store (hydrated by `setLocation` listeners):

```typescript
export function ProductDetail() {
  const { productId } = useParams();
  const product = useAppSelector((state) => state.products.byId[productId!]);

  if (!product) return <ProductDetailSkeleton />;

  return (
    <ProductDetailWrapper>
      <ProductTitle>{product.name}</ProductTitle>
    </ProductDetailWrapper>
  );
}
```

## What Belongs Where

| Concern | Where | Example |
|---------|-------|---------|
| Router instance | `src/router/router.ts` | `createHashRouter(routes)` |
| Route tree | `src/router/routes.tsx` | Named `AppRouteObject[]` |
| Location → Redux | `App.tsx` useEffect | `dispatch(setLocation({ location }))` |
| Route state in store | `store/router/` | Full `Location` object |
| Data hydration on route | Feature listeners | `matchPath` → `dispatch(fetch...)` |
| User-initiated navigation | Components | `useNavigate()` |
| Route params as lookup keys | Components | `useParams()` → `useAppSelector(byId[id])` |
| Post-logic redirects | Listeners | `router.navigate(...)` via imported router |

## Workflow Checklist

```
Routing Progress:
- [ ] Create src/router/ folder with router.ts, routes.tsx, types.ts
- [ ] Define AppRouteObject type with name property
- [ ] Create route tree in routes.tsx
- [ ] Create store/router/ branch (actions, reducer, types)
- [ ] Bridge in App.tsx: useLocation → dispatch(setLocation({ location }))
- [ ] Add setLocation listeners in feature branches for hydration
- [ ] Verify: components don't fetch data on mount
- [ ] Verify: useNavigate used for user navigation, not data loading
```
