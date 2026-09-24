# App & Routes File Templates

Files in `src/`. Replace `PROJECT_NAME` where noted.

---

## src/main.tsx

Entry point. Makes the router, then the store — which hands the router to every listener as
`extra` — then wraps the app in the Redux Provider and renders the router.

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { RouterProvider } from 'react-router-dom';
import { makeStore } from '@/store';
import { createAppRouter } from '@/router/router';

const router = createAppRouter();
const store = makeStore(router);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>
  </React.StrictMode>
);
```

---

## src/components/App/App.tsx

Root layout component. Contains the router→store bridge and renders child routes via `<Outlet>`.

```tsx
import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useAppDispatch } from '@/store';
import { setLocation } from '@/store/router/router.actions';
import { AppWrapper } from './App.styled';

export function App() {
  // ═══ SETUP ═══
  const dispatch = useAppDispatch();
  const location = useLocation();

  // ═══ BRIDGE: Router → Store ═══
  useEffect(() => {
    dispatch(setLocation({ location }));
  }, [location]);

  // ═══ RETURN ═══
  return (
    <AppWrapper>
      <Outlet />
    </AppWrapper>
  );
}
```

---

## src/components/App/App.styled.tsx

```tsx
import styled from 'styled-components';

export const AppWrapper = styled.div`
  min-height: 100vh;
`;
```

---

## src/components/App/index.ts

```typescript
export { App } from './App';
```

---

## src/router/types.ts

Extends React Router's `RouteObject` with a required `name` field for the application vocabulary.

```typescript
import type { RouteObject, createHashRouter } from 'react-router-dom';

export interface AppRouteObject extends RouteObject {
  name: string;
  children?: AppRouteObject[];
}

/** The app's router: the hash one in the app, a memory one in a test. Both are
 *  the same data router, so a listener navigates either the same way. */
export type AppRouter = ReturnType<typeof createHashRouter>;
```

---

## src/router/routes.tsx

Root route definition. `App` is the layout wrapper — all pages are added as `children`.

```tsx
import type { AppRouteObject } from './types';
import { App } from '@/components/App';

export const routes: AppRouteObject[] = [
  {
    name: 'root',
    path: '/',
    element: <App />,
    children: [
      // Add page routes here
    ],
  },
];
```

---

## src/router/router.ts

A factory, called once from `main.tsx`: a module-level router would be made at import time, and a
listener importing it closes the store → listener → router → routes → screens → store cycle.
Listeners navigate with the one the store hands them (`extra.router`).

```typescript
import { createHashRouter } from 'react-router-dom';
import { routes } from './routes';
import type { AppRouter } from './types';

/** The app's router. Made once, in main.tsx, before the store. */
export function createAppRouter(): AppRouter {
  return createHashRouter(routes);
}
```
