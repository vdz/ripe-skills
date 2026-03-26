---
name: building-ripe-store
description: Creates and modifies Redux store branches following The Ripe Method architecture. Use when adding state management, creating Redux slices, writing actions/reducers/listeners, or building API functions. Covers store structure, state shape, listeners, and the data flow cycle. For full features requiring both state and UI, pair with building-ripe-components.
---

# Building Ripe Store Branches

## Branch File Structure

Each feature gets its own folder under `store/`:

```
store/
└── products/
    ├── api/
    │   ├── fetchProducts.ts      # One file per API verb
    │   └── updateProduct.ts
    ├── __tests__/
    │   └── products.reducer.test.ts  # Tests in __tests__/ — not alongside source
    ├── types.ts                  # State shape, payload, API interfaces
    ├── products.actions.ts       # createAction definitions
    ├── products.reducer.ts       # Default state + reducer
    ├── products.selectors.ts     # Selector functions (if needed)
    └── products.listener.ts     # Business logic (exports Listener[])
```

**Test file location:** Always in a `__tests__/` subdirectory within the module folder. Never alongside source files. Imports use `../` to reach the parent. This applies to store slices, modules, and lib utilities alike.

Root store files:
```
store/
├── store.ts          # configureStore + typed hooks
├── listener.ts       # listenerMiddleware + listener registration
├── types.ts          # Shared types (Listener interface, LoadingState)
└── index.ts          # Re-export everything
```

## Store Setup

`store.ts` configures the store, attaches listener middleware, and exports typed hooks:

```typescript
// store/store.ts
import { useDispatch, useSelector, type TypedUseSelectorHook } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { initAppListeners } from "./listener";
import { appReducer } from "./app/app.reducer";
import { shopReducer } from "./shop/shop.reducer";
import { serviceReducer } from "./service/service.reducer";
import { historyReducer } from "./history/history.reducer";
import { routerReducer } from "./router/router.reducer";
import { uiReducer } from "./ui/ui.reducer";

const listenerMiddleware = initAppListeners();

export const store = configureStore({
  reducer: {
    app: appReducer,
    shop: shopReducer,
    service: serviceReducer,
    history: historyReducer,
    router: routerReducer,
    ui: uiReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().prepend(listenerMiddleware.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppStore = typeof store;
export type AppDispatch = typeof store.dispatch;

export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
```

## Listener Setup

`listener.ts` creates the middleware and registers all feature listeners:

```typescript
// store/listener.ts
import type { TypedStartListening } from "@reduxjs/toolkit";
import { createListenerMiddleware } from "@reduxjs/toolkit";
import type { RootState, AppDispatch } from "./store";
import type { Listener } from "./types";
import { listener as appListener } from "./app/app.listener";
import { listener as shopListener } from "./shop/shop.listener";
import { listener as serviceListener } from "./service/service.listener";
import { listener as historyListener } from "./history/history.listener";
import { listener as uiListener } from "./ui/ui.listener";

const listenerMiddleware = createListenerMiddleware();

export const startAppListening =
  listenerMiddleware.startListening as TypedStartListening<RootState, AppDispatch>;

const listeners: Listener[][] = [
  appListener,
  shopListener,
  serviceListener,
  historyListener,
  uiListener,
];

export function initAppListeners() {
  listeners.forEach((listener) => {
    listener.forEach((logic) => {
      startAppListening(logic as any);
    });
  });
  return listenerMiddleware;
}
```

## Root Store Types

```typescript
// store/types.ts
import type {
  ActionCreatorWithPayload,
  ListenerEffectAPI,
  AnyAction,
  ActionCreator,
} from "@reduxjs/toolkit";
import type { RootState, AppDispatch } from "./store";

export interface Listener {
  actionCreator?:
    | ActionCreatorWithPayload<any, string>
    | ActionCreator<string>
    | Array<ActionCreatorWithPayload<any, string> | ActionCreator<string>>;
  matcher?: (action: AnyAction) => boolean;
  effect: (
    action: any,
    listenerApi: ListenerEffectAPI<RootState, AppDispatch>,
  ) => void | Promise<void>;
}

export type LoadingState = "idle" | "loading" | "loaded" | "error";
```

## Types File

All types for the branch live in `store/[feature]/types.ts`:

```typescript
// store/products/types.ts
import type { LoadingState } from '@/store/types';

export interface Product {
  id: string;
  name: string;
  price: number;
  imageUrl: string;
}

export interface ProductsState {
  status: LoadingState;
  items: string[];              // IDs in order
  byId: Record<string, Product>; // O(1) lookup
}

// Payload interfaces — one per action
export interface FetchProductsSuccessPayload {
  items: string[];
  byId: Record<string, Product>;
}

export interface FetchProductsFailurePayload {
  error: string;
}
```

## Actions File

**Action names are descriptive, not hiding logic**

Naming Example:
 - BAD: `toggleUserPoupup` with `payload` signifying "open"/"close"
 - GOOD: `showUserPopup` & `hideUserPopup`, with no need for payload.
 - Payload type names are Pascal-case version of the action name with `Payload` suffix.

```typescript
// store/products/products.actions.ts
import { createAction } from '@reduxjs/toolkit';
import type {
  FetchProductsSuccessPayload,
  FetchProductsFailurePayload,
} from './types';

// Naming: verbFeatureVariant — always a verb
export const fetchProducts = createAction('products/fetchProducts');
export const fetchProductsSuccess = createAction<FetchProductsSuccessPayload>('products/fetchProductsSuccess');
export const fetchProductsFailure = createAction<FetchProductsFailurePayload>('products/fetchProductsFailure');
export const addToCart = createAction<AddToCartPayload>('products/addToCart');
```

## Reducer File

**Reducers only do simple assignment — no logic, no decisions.**

 - Reducer file should always contain the default state of the slice.

```typescript
// store/products/products.reducer.ts
import { createReducer } from '@reduxjs/toolkit';
import type { ProductsState } from './types';
import {
  fetchProducts,
  fetchProductsSuccess,
  fetchProductsFailure,
} from './products.actions';

const defaultState: ProductsState = {
  status: 'idle',
  items: [],
  byId: {},
};

export const productsReducer = createReducer(defaultState, (builder) => {
  builder
    .addCase(fetchProducts, (state) => {
      state.status = 'loading';
    })
    .addCase(fetchProductsSuccess, (state, action) => {
      state.status = 'loaded';
      state.items = action.payload.items;
      state.byId = action.payload.byId;
    })
    .addCase(fetchProductsFailure, (state) => {
      state.status = 'error';
    });
});
```

## API Functions

One file per verb. Formats the response to match state shape.

```typescript
// store/products/api/fetchProducts.ts
import { api } from '@/modules/api';
import type { FetchProductsSuccessPayload, Product } from '../types';

export async function fetchProducts(): Promise<FetchProductsSuccessPayload> {
  const response = await api.products.list();

  if (!response || response.status !== 'OK') {
    throw new Error(response?.errorMessage ?? 'Failed to fetch products');
  }

  return formatProducts(response.entities);
}

function formatProducts(entities: ProductEntity[]): FetchProductsSuccessPayload {
  if (!entities) {
    return {
      items: [],
      byId: {},
    };
  }
  
  return {
    items: entities.map((e) => e.id),
    byId: entities.reduce<Record<string, Product>>((acc, e) => {
      acc[e.id] = {
        id: e.id,
        name: e.displayName,
        price: e.priceInCents / 100,
        imageUrl: e.imageUrl ?? '',
      };
      return acc;
    }, {}),
  };
}
```

## Listeners File

Listeners handle all business logic — API calls, decisions, orchestration.

**Preemptive hydration** — the app should fetch and populate state *before* (or alongside) the components that depend on it being rendered. Listeners should react to early signals — app init, authentication, route changes, or parent-data-loaded actions — not to component mount. If a component has to ask for its own data, that's a missing listener.

The canonical signal is a `setLocation` action, dispatched from the root `App` component whenever the route changes. This is the one legitimate `useEffect` at the app boundary — it bridges React Router into the Redux world so all listeners can react to navigation.

```typescript
// App.tsx — the single place that connects routing to the store
function App() {
  const location = useLocation();
  const dispatch = useDispatch();

  useEffect(() => {
    dispatch(setLocation({ location }));
  }, [location, dispatch]);

  return <Outlet />;
}

// store/products/products.listeners.ts — hydrates before the page renders
listenerMiddleware.startListening({
  actionCreator: setLocation,
  effect: async (action, { dispatch }) => {
    if (matchPath('/products', action.payload.location.pathname)) {
      const payload = await fetchProductsApi();
      dispatch(fetchProductsSuccess(payload));
    }
  },
});

// ❌ Wrong — component fetches its own data on mount
function ProductsPage() {
  useEffect(() => {
    dispatch(fetchProducts()); // component is orchestrating data loading
  }, []);
}
```

Listeners have access to the `action` and the store, including it's current state and its previous state, and will fire after redurecer responded to the action and changed the state accordingly.

Listeners dispatch actions as a result of their work.

Each feature exports a `Listener[]` array, registered centrally in `listener.ts`:

```typescript
// store/products/products.listener.ts
import type { Listener } from "@/store/types";
import { fetchProducts, fetchProductsSuccess, fetchProductsFailure } from './products.actions';
import { fetchProducts as fetchProductsApi } from './api/fetchProducts';

export const listener: Listener[] = [
  {
    actionCreator: fetchProducts,
    effect: async (_, { dispatch, getState }) => {
      const shopId = getState().shop.id;

      if (!shopId) {
        dispatch(fetchProductsFailure({ error: 'No shop selected' }));
        return;
      }

      try {
        const payload = await fetchProductsApi();
        dispatch(fetchProductsSuccess(payload));
      } catch {
        dispatch(fetchProductsFailure({ error: 'Failed to fetch products' }));
      }
    },
  },
];
```

## State Shape Rules

**Always use dual structure for collections:**

```typescript
// ✅ Dual structure
{
  items: ['p1', 'p2', 'p3'],   // Array: preserves order, cheap to iterate
  byId: {                       // Object: O(1) lookup by ID
    p1: { id: 'p1', name: 'Widget' },
    p2: { id: 'p2', name: 'Gadget' },
  }
}

// Rendering in order:
state.products.items.map((id) => state.products.byId[id])

// Single lookup:
state.products.byId['p1']
```

**Status values:**
```typescript
type LoadingState = 'idle' | 'loading' | 'loaded' | 'error';
```

**Selector Rules:**
// ✅ Optimize getting values from the state by declaring selectors
export const selectProducts = (state: RootState) => state.products;

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
```

**Import aliasing:** Use `@` as alias for `src/` in all imports (e.g., `@/store/types`, `@/modules/api`).

**For listener patterns**: See [listeners.md](listeners.md)
**For state shape design**: See [state-shape.md](state-shape.md)
**For routing and setLocation bridge**: See building-ripe-routing skill
