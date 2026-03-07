# App & Routes File Templates

Files in `src/`. Replace `PROJECT_NAME` where noted.

---

## src/main.tsx

Entry point. Wraps the app in the Redux Provider and renders the router.

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { RouterProvider } from 'react-router-dom';
import { store } from '@/store';
import { router } from '@/routes/router';

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
    dispatch(setLocation({ location: location.pathname }));
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

## src/routes/types.ts

Extends React Router's `RouteObject` with a required `name` field for the application vocabulary.

```typescript
import type { RouteObject } from 'react-router-dom';

export interface AppRouteObject extends RouteObject {
  name: string;
  children?: AppRouteObject[];
}
```

---

## src/routes/routes.tsx

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

## src/routes/router.ts

```typescript
import { createHashRouter } from 'react-router-dom';
import { routes } from './routes';

export const router = createHashRouter(routes);
```
