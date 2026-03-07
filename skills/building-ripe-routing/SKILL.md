---
name: building-ripe-routing
description: Sets up and modifies React Router configuration following The Ripe Method architecture. Use when creating routes, adding pages, setting up navigation, or configuring the router-to-store bridge. Covers router setup, route definitions, the setLocation bridge, preemptive hydration via listeners, and in-component navigation.
---

# Building Ripe Routing

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

## In-Component Navigation

Components can and should use `useNavigate` for user-initiated navigation and `useParams` for route params:

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
