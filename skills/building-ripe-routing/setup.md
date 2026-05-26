# Routing Setup Reference

## When to read this
- Setting up routing on a fresh project (after `ripe-init` scaffolds the skeleton)
- Adding a new route to the tree
- Modifying the `App.tsx` router→store bridge
- Building or extending the router store branch

## Contents
- Router setup (`router.ts`)
- Route definitions (`routes.tsx` + `types.ts`)
- The bridge: `App.tsx`
- Router store branch

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

This dispatches the **full `Location` object** (not just pathname) so listeners have access to `pathname`, `search`, `hash`, and `state`.

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

## Next

- Data hydration on route enter → [hydration.md](hydration.md)
- Navigation from listeners or components → [navigation.md](navigation.md)
