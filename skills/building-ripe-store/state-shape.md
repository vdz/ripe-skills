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
- Read, don't mirror
- An object with a record inside, never a bare record
- Default state requirements
- Resume is `preloadedState`
- Full branch example

## Six Rules for State Structure

1. **Single source of truth** — data lives in one place, referenced by ID elsewhere. Duplicated data drifts: two copies means two writers. One canonical copy plus ID references means a single write is seen everywhere.
2. **Reflects what's shown** — store what the UI displays, not raw API shapes or intermediate computations; those get formatted in the api layer or derived in selectors, so state stays a clean mirror of the screen
3. **Optimized for access** — arrays for order, objects for O(1) lookup
4. **Cache on mutation, not read** — compute at write time, not render time
5. **Features own their branch** — `cart` owns `cart`, `user` owns `user`. Ownership and blast-radius stay obvious: changing a feature's shape touches only its files, and the branch name answers "where does this state live?"
6. **Always has defaults** — no `undefined` states; always define a full default, so the shape is knowable from `defaultState` alone and selectors never need `?.` guards (see [Default State Requirements](#default-state-requirements))

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

The **theme** is `ui` state too — `ui.theme: ThemeName` with a `themeChanged` action — rendered by one selector as a class on the App root (`selectThemeClassName(state) → "theme-<name>"`). No component toggles a class on `<html>`; see `building-ripe-components/styled.md` for how the class reaches the CSS.

And the rule has no "UI-only" escape hatch: **nothing a component shows is component state.** A check's phase (explainer / running), the countdown it draws, the cells the customer has painted, which key has been pressed — each is a field on the branch that owns the check (`progress`, `clock`), written by a listener, selected by the component. If it is on screen, it is in the store.

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

For how to write those selectors — inline vs named, plain function vs memoised — see [selectors.md](selectors.md).

## Read, Don't Mirror

A count or a flag the store already owns is **read**, never copied into a second field or a hook's local counter. A retry control reads `check.attempt`; it does not keep its own `retries`. A "which attempt is this?" label selects the same field. Two writers for one fact is the drift rule 1 exists to prevent, and a mirrored copy is a second writer.

Values that are *computed* from state — "how many checks remain", "is this the last camera step" — are pure helpers in `lib/utils/` or memoised selectors, not fields. The test is the same as rule 4's converse: if a reducer would have to keep it in step with another field on every action, it is derived, and derived means selector.

## An Object With a Record Inside, Never a Bare Record

A branch whose payload is a lookup — checks by id, panels by id — is still an **object** with the record as a named field:

```typescript
// ✅ store/diagnostics/types.ts
export interface DiagnosticsState {
	/** Every check the journey can run, present from the first render with a literal idle default. */
	checks: Record<CheckId, CheckState>;
}

// ❌ export type DiagnosticsState = Record<CheckId, CheckState>;
```

A sibling field can then join without a migration, a selector never has to ask whether a key exists (every id is declared with its default), and the branch reads like every other branch. When the ids are a closed set, declare them as an `as const` map in `types.ts` and derive the union — `INTERACTIVE_CHECK`, `CheckId`, `isCheckId(value)` — so the record is total.

**One bridge between branches.** When a branch keys off another branch's vocabulary (a flow step that *is* a check), exactly one predicate names the bridge — `isInteractiveCheck(stepId): stepId is InteractiveCheck` — and no other code compares the two id spaces. Ordering stays where it is owned (the flow's step list); the lookup branch holds no order of its own.

## Selectors and Memoisation

Moved — selector guidance (inline vs named, plain function vs `createSelector`, the memoisation test, React 19 notes, parametric selectors) lives in [selectors.md](selectors.md).

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

## Resume Is `preloadedState`

Persisting a session is a listener's job (a `persistenceListener` that watches the actions worth saving and writes a snapshot through `store/persistence/api/storage.ts`). Reading it back is the **boot's** job, once: `makeStore(restoreFrom(await readSavedSession()))`. There is no `sessionRestored` action, no reducer case per branch, no root-reducer wrapper — see [SKILL.md → The Store Root](SKILL.md#the-store-root-reducer-map-rootstate-makestore).

Two consequences for state design:

- **A snapshot is `Partial<RootState>`.** Every branch it omits starts from its reducer's default, so defaults (rule 6) are also the resume contract.
- **The codec fills in what is never saved.** A running clock, an in-flight status, an open camera do not survive a reload; `restoreFrom` writes their idle defaults (`IDLE_CLOCK`, `status: "idle"`) into the snapshot so the store never starts mid-flight. Export those defaults from the reducer file so the codec and the reducer cannot disagree.

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
