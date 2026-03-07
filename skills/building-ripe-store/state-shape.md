# State Shape Design Reference

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

Use a consistent set across all branches:

```typescript
type LoadingState = 'idle' | 'loading' | 'loaded' | 'error';
```

In the state shape:
```typescript
interface ProductsState {
  status: LoadingState;  // not isLoading:boolean — covers all 4 states
  // ...
}
```

UI reacts to status:
```typescript
if (status === 'loading') return <Spinner />;
if (status === 'error') return <ErrorMessage />;
if (status === 'idle') return null;
// status === 'loaded' — render content
```

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
  status: 'idle',       // not undefined
  items: [],            // not undefined
  byId: {},             // not undefined
};
```

For optional data:
```typescript
interface UserState {
  status: LoadingState;
  profile: UserProfile | null;  // null, not undefined
}

const defaultState: UserState = {
  status: 'idle',
  profile: null,        // explicitly null
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
  status: 'idle',
  items: [],
  byId: {},
  activeOrderId: null,
};

export const ordersReducer = createReducer(defaultState, (builder) => {
  builder
    .addCase(fetchOrders, (state) => {
      state.status = 'loading';
    })
    .addCase(fetchOrdersSuccess, (state, action) => {
      state.status = 'loaded';
      state.items = action.payload.items;
      state.byId = action.payload.byId;
    })
    .addCase(fetchOrdersFailure, (state) => {
      state.status = 'error';
    })
    .addCase(setActiveOrder, (state, action) => {
      state.activeOrderId = action.payload.orderId;
    });
});
```
