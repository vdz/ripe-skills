# State Shape Design Reference

## When to read this
- Designing the state shape for a new branch
- Adding a collection (lists, lookups, filters, search)
- Picking defaults — what should be `null`, what should be `[]`, what `LOADING_STATES.idle`
- Adding a filtered/searched/sorted view (the optional `filteredItems` pattern)
- Deciding what belongs in state vs. in a selector

## Contents
- Six rules for state structure
- Dual structure pattern
- Status values
- UI state vs app state
- What belongs in state vs selectors
- Default state requirements
- Full branch example

## Six Rules for State Structure

1. **Single source of truth** — data lives in one place, referenced by ID elsewhere
2. **Reflects what's shown** — state mirrors what the UI needs to display
3. **Optimized for access** — arrays for order, objects for O(1) lookup
4. **Cache on mutation, not read** — compute at write time, not render time
5. **Features own their branch** — `cart` owns `cart`, `user` owns `user`
6. **Always has defaults** — no `undefined` states; always define a full default

## Dual Structure Pattern

Every collection uses both an array (for order) and an object (for lookup):

```typescript
interface ProductsState {
  status: LoadingState;
  items: string[];              // IDs: ['p1', 'p3', 'p2']
  byId: Record<string, Product>; // Data: { p1: {...}, p2: {...}, p3: {...} }
}
```

Why both?
- `items` preserves server-defined order; sorting is just `items.sort(...)`
- `byId` gives O(1) access — `byId[id]` vs `items.find(i => i.id === id)`
- Adding, updating, and removing are all O(1)

### Rendering in order:
```typescript
state.products.items.map((id) => state.products.byId[id])
```

### Lookup:
```typescript
const product = state.products.byId[productId];
```

### Adding a new item:
```typescript
// Reducer case for addProduct
.addCase(addProduct, (state, action) => {
  state.items.push(action.payload.id);
  state.byId[action.payload.id] = action.payload.product;
})
```

### Removing:
```typescript
// Reducer case for removeProduct
.addCase(removeProduct, (state, action) => {
  state.items = state.items.filter((id) => id !== action.payload.id);
  delete state.byId[action.payload.id];
})
```

## Status Values

Use a consistent set across all branches. Define enum-like values as a `const` hashmap with a derived type — not a TS `enum`, not a bare string union:

```typescript
export const LOADING_STATES = {
  idle: 'idle',
  loading: 'loading',
  loaded: 'loaded',
  error: 'error',
} as const;

export type LoadingState = typeof LOADING_STATES[keyof typeof LOADING_STATES];
```

Why the const hashmap pattern:
- No runtime reverse-mapping (TS `enum` quirk)
- Tree-shakeable — unused keys drop out
- Iterable: `Object.values(LOADING_STATES)`
- One source for both the value (for use in code) and the type (for use in interfaces)

Apply the same pattern to any enum-like type — filter values, status values, role types, etc.

In the state shape:
```typescript
interface ProductsState {
  status: LoadingState;  // not isLoading:boolean — covers all 4 states
  // ...
}
```

UI reacts to status:
```typescript
if (status === LOADING_STATES.loading) return <Spinner />;
if (status === LOADING_STATES.error) return <ErrorMessage />;
if (status === LOADING_STATES.idle) return null;
// status === LOADING_STATES.loaded — render content
```

## Pre-computed Projections (`filteredItems`)

> Optional pattern — apply when the view shows a filtered, searched, or sorted projection of a collection. Skip it for branches with no filter UI.

When a view renders a derived list (filter, search, sort), don't compute the projection at render time or in a selector — compute it in the reducer at mutation time and store it as a `filteredItems` array alongside `items`. The view iterates `filteredItems` and never recomputes:

```typescript
interface ProductsState {
  status: LoadingState;
  items: string[];               // canonical IDs in server order
  byId: Record<string, Product>;
  filteredItems: string[];       // pre-computed projection — what the view renders
  filter: ProductFilter;
}
```

```typescript
// View
state.products.filteredItems.map((id) => state.products.byId[id])
```

Recompute `filteredItems` in the reducer on every event that can change the projection — filter changes, search query changes, items added or removed:

```typescript
.addCase(setFilter, (state, action) => {
  state.filter = action.payload.filter;
  state.filteredItems = applyFilter(state.items, state.byId, state.filter);
})
.addCase(fetchProductsSuccess, (state, action) => {
  state.status = LOADING_STATES.loaded;
  state.items = action.payload.items;
  state.byId = action.payload.byId;
  state.filteredItems = applyFilter(state.items, state.byId, state.filter);
})
```

This is the "Cache on mutation, not read" rule applied to projections: the reducer does the work once at write time, the view stays dumb.

**Naming.** `items` / `filteredItems` are the defaults. When a more specific noun fits the branch, rename consistently — `products` / `filteredProducts`, `orders` / `filteredOrders`. Never `ids` / `filteredIds`.

**When to use it.** Views that render a filtered, searched, or sorted slice of a collection.

**When not to.** A branch with no filter/search/sort UI can render `items.map((id) => byId[id])` directly. Don't add `filteredItems` preemptively — add it the moment a filter, search, or sort is introduced.

## UI State vs App State

Both live in the global store — but in different branches:

```typescript
// app/ branch — core application state
app: {
  loaded: boolean;
  online: boolean;
  language: Language;
}

// ui/ branch — ephemeral UI state
ui: {
  modalShow: boolean;
  activeTab: TabId;
  contextMenus: Record<string, { show: boolean }>;
}

// feature branches — domain data
products: { status, items, byId }
cart: { items, byId, show }
user: { profile, preferences }
```

Do NOT use `useState` for `modalShow` or `activeTab` — they belong in the `ui` branch because:
- Other components may need to know about them
- They should be inspectable for debugging
- They follow the same predictable data flow

## What Belongs in State vs Selectors

**In state:** raw data, fetched from server, user inputs

**In selectors:** computed values, derived data, filtered/sorted views

```typescript
// ❌ Wrong — computed value in state
state.cart.totalPrice = items.reduce(...)
state.cart.itemCount = items.length

// ✅ Correct — computed in selectors
export const selectCartTotal = (state: RootState) =>
  state.cart.items.reduce(
    (sum, id) => sum + (state.cart.byId[id]?.price ?? 0),
    0
  );

export const selectCartItemCount = (state: RootState) =>
  state.cart.items.length;
```

## Default State Requirements

Every branch must have complete defaults — no `undefined`:

```typescript
const defaultState: ProductsState = {
  status: LOADING_STATES.idle,   // not undefined
  items: [],                     // not undefined
  byId: {},                      // not undefined
};
```

For optional data:
```typescript
interface UserState {
  status: LoadingState;
  profile: UserProfile | null;  // null, not undefined
}

const defaultState: UserState = {
  status: LOADING_STATES.idle,
  profile: null,                 // explicitly null
};
```

## Full Branch Example

```typescript
// store/orders/types.ts
export interface Order {
  id: string;
  status: 'pending' | 'processing' | 'complete' | 'failed';
  total: number;
  createdAt: string;
}

export interface OrdersState {
  status: LoadingState;
  items: string[];
  byId: Record<string, Order>;
  activeOrderId: string | null;
}

export interface FetchOrdersSuccessPayload {
  items: string[];
  byId: Record<string, Order>;
}

export interface SetActiveOrderPayload {
  orderId: string;
}
```

```typescript
// store/orders/orders.reducer.ts
const defaultState: OrdersState = {
  status: LOADING_STATES.idle,
  items: [],
  byId: {},
  activeOrderId: null,
};

export const ordersReducer = createReducer(defaultState, (builder) => {
  builder
    .addCase(fetchOrders, (state) => {
      state.status = LOADING_STATES.loading;
    })
    .addCase(fetchOrdersSuccess, (state, action) => {
      state.status = LOADING_STATES.loaded;
      state.items = action.payload.items;
      state.byId = action.payload.byId;
    })
    .addCase(fetchOrdersFailure, (state) => {
      state.status = LOADING_STATES.error;
    })
    .addCase(setActiveOrder, (state, action) => {
      state.activeOrderId = action.payload.orderId;
    });
});
```
