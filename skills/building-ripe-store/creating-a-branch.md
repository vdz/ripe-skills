# Creating a Branch — End-to-End

## When to read this
- Adding a brand-new feature branch to the store
- Onboarding to the Ripe store layout for the first time
- Need a complete walkthrough from empty folder to registered, hydrating branch

## What's covered
- The 8 steps from empty folder to working branch
- File-by-file templates for `types.ts`, `actions.ts`, `reducer.ts`, `api/`, `listener.ts`, tests
- How to register the new branch in the root `store.ts` and `listener.ts`

For deeper coverage of any step:
- State design → [state-shape.md](state-shape.md)
- Action naming and payload rules → [action-payloads.md](action-payloads.md)
- Listener patterns (single, matcher, debounce, error handling, preemptive hydration) → [listeners.md](listeners.md)

---

## The 8 Steps

1. Create `store/<feature>/` folder
2. `types.ts` — state shape + payload interfaces
3. `<feature>.actions.ts` — `createAction` per event
4. `<feature>.reducer.ts` — default state + assignment cases
5. `api/<verb><Feature>.ts` — fetch + format response (one file per verb)
6. `<feature>.listener.ts` — `Listener[]` with business logic + error handling
7. `__tests__/<feature>.reducer.test.ts` — test state transitions
8. Register in root `store.ts` (reducer) and `listener.ts` (listener)

---

## Step 1: Folder Layout

```
store/
└── products/
    ├── api/
    │   ├── fetchProducts.ts
    │   └── updateProduct.ts
    ├── __tests__/
    │   └── products.reducer.test.ts
    ├── types.ts
    ├── products.actions.ts
    ├── products.reducer.ts
    ├── products.selectors.ts        # Optional, only if needed
    └── products.listener.ts
```

Tests always live in `__tests__/` — never alongside source files. Imports use `../` to reach the parent.

---

## Step 2: `types.ts`

State shape, domain types, and payload interfaces all live here. See [state-shape.md](state-shape.md) for design rules (dual structure, status values, defaults, projections).

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
  items: string[];                // canonical IDs in server order
  byId: Record<string, Product>;  // O(1) lookup
}

// One payload interface per data-bearing action
export interface FetchProductsSuccessPayload {
  items: string[];
  byId: Record<string, Product>;
}

export interface FetchProductsFailurePayload {
  error: string;
}
```

---

## Step 3: `<feature>.actions.ts`

See [action-payloads.md](action-payloads.md) for the full rules and naming guidance.

```typescript
// store/products/products.actions.ts
import { createAction } from '@reduxjs/toolkit';
import type {
  FetchProductsSuccessPayload,
  FetchProductsFailurePayload,
} from './types';

export const fetchProducts = createAction('products/fetchProducts');
export const fetchProductsSuccess = createAction<FetchProductsSuccessPayload>('products/fetchProductsSuccess');
export const fetchProductsFailure = createAction<FetchProductsFailurePayload>('products/fetchProductsFailure');
```

---

## Step 4: `<feature>.reducer.ts`

Reducers are dumb assignment. No `if`, no API, no derived computation. The reducer file always declares the branch's `defaultState`.

```typescript
// store/products/products.reducer.ts
import { createReducer } from '@reduxjs/toolkit';
import { LOADING_STATES } from '@/store/types';
import type { ProductsState } from './types';
import {
  fetchProducts,
  fetchProductsSuccess,
  fetchProductsFailure,
} from './products.actions';

const defaultState: ProductsState = {
  status: LOADING_STATES.idle,
  items: [],
  byId: {},
};

export const productsReducer = createReducer(defaultState, (builder) => {
  builder
    .addCase(fetchProducts, (state) => {
      state.status = LOADING_STATES.loading;
    })
    .addCase(fetchProductsSuccess, (state, action) => {
      state.status = LOADING_STATES.loaded;
      state.items = action.payload.items;
      state.byId = action.payload.byId;
    })
    .addCase(fetchProductsFailure, (state) => {
      state.status = LOADING_STATES.error;
    });
});
```

---

## Step 5: `api/<verb><Feature>.ts`

One file per API verb. Each file:
- Calls the API
- Validates the response
- **Formats the response to match the state shape** (so the reducer can do straight assignment)

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
    return { items: [], byId: {} };
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

The reducer never sees raw API shape. By the time `fetchProductsSuccess` reaches it, the payload is already in `items` / `byId` form.

---

## Step 6: `<feature>.listener.ts`

Listeners hold all business logic — API calls, decisions, orchestration, error handling. See [listeners.md](listeners.md) for the full pattern catalog (single-action, matcher, debounce, cross-branch, preemptive hydration).

```typescript
// store/products/products.listener.ts
import type { Listener } from '@/store/types';
import {
  fetchProducts,
  fetchProductsSuccess,
  fetchProductsFailure,
} from './products.actions';
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

For data the page needs at render time, prefer **preemptive hydration via `setLocation`** (the listener fires when the user navigates to the page) over having the component dispatch on mount. See [listeners.md](listeners.md#preemptive-hydration-via-setlocation).

---

## Step 7: `__tests__/<feature>.reducer.test.ts`

Test state transitions one action at a time. Reducers are pure functions — testing them is easy and high-value.

```typescript
// store/products/__tests__/products.reducer.test.ts
import { describe, it, expect } from 'vitest';
import { LOADING_STATES } from '@/store/types';
import { productsReducer } from '../products.reducer';
import {
  fetchProducts,
  fetchProductsSuccess,
  fetchProductsFailure,
} from '../products.actions';

describe('productsReducer', () => {
  it('starts idle with empty collections', () => {
    const state = productsReducer(undefined, { type: '@@INIT' });
    expect(state.status).toBe(LOADING_STATES.idle);
    expect(state.items).toEqual([]);
    expect(state.byId).toEqual({});
  });

  it('moves to loading on fetchProducts', () => {
    const state = productsReducer(undefined, fetchProducts());
    expect(state.status).toBe(LOADING_STATES.loading);
  });

  it('populates items and byId on fetchProductsSuccess', () => {
    const state = productsReducer(
      undefined,
      fetchProductsSuccess({
        items: ['p1'],
        byId: { p1: { id: 'p1', name: 'Widget', price: 10, imageUrl: '' } },
      })
    );
    expect(state.status).toBe(LOADING_STATES.loaded);
    expect(state.items).toEqual(['p1']);
    expect(state.byId.p1.name).toBe('Widget');
  });

  it('moves to error on fetchProductsFailure', () => {
    const state = productsReducer(undefined, fetchProductsFailure({ error: 'oops' }));
    expect(state.status).toBe(LOADING_STATES.error);
  });
});
```

---

## Step 8: Register in Root Files

The branch isn't live until both the reducer and the listener are registered.

**`store/store.ts`** — add to the `reducer` map:

```typescript
import { productsReducer } from './products/products.reducer';

export const store = configureStore({
  reducer: {
    // ...existing branches
    products: productsReducer,
  },
  // ...
});
```

**`store/listener.ts`** — add to the `listeners` array:

```typescript
import { listener as productsListener } from './products/products.listener';

const listeners: Listener[][] = [
  // ...existing listeners
  productsListener,
];
```

Full templates for these root files: see [store-templates.md](../ripe-init/store-templates.md).

---

## Quick Verification

Before considering the branch done:

- [ ] Reducer has no `if`, no API calls, no derived computation
- [ ] Every data-bearing action has an `interface` payload in `types.ts`
- [ ] State has complete defaults — no `undefined`
- [ ] Collections use the dual structure (`items` + `byId`)
- [ ] Status uses `LOADING_STATES.*`, not bare strings
- [ ] Listener handles all error cases (`try`/`catch` + failure dispatch)
- [ ] Tests exist in `__tests__/`
- [ ] Reducer registered in `store.ts`
- [ ] Listener registered in `listener.ts`
- [ ] No `useEffect` in components fetching this branch's data
