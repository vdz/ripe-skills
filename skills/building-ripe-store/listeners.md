# Listener Patterns Reference

## When to read this
- Writing a listener for a new action
- Picking a pattern (matcher, debounce, cross-branch, hydration)
- Debugging "why isn't my data loading before the page renders?"
- Adding error handling to an existing listener

## Contents
- Listener file structure
- Pattern 1: Single action (most common)
- Pattern 2: Multiple actions (matcher)
- Pattern 3: Predicate-based
- Pattern 4: Cancel previous (search/debounce)
- Pattern 5: Preemptive hydration via `setLocation`
- Error handling
- Reading state inside listeners
- Chaining actions
- Common mistakes

## Listener File Structure

Each feature exports a `Listener[]` array from `[feature].listener.ts`:

```typescript
// store/service/service.listener.ts
import type { Listener } from "@/store/types";
import { fetchServiceQueue, fetchServiceQueueSuccess, fetchServiceQueueFailure } from "./service.actions";
import { fetchServiceRequests } from "./api/fetchServiceRequests";

export const listener: Listener[] = [
  {
    actionCreator: fetchServiceQueue,
    effect: async (_, { dispatch, getState }) => {
      const shopId = getState().shop.id;
      try {
        const requests = await fetchServiceRequests(shopId);
        dispatch(fetchServiceQueueSuccess(requests));
      } catch {
        dispatch(fetchServiceQueueFailure({ error: "Failed to fetch" }));
      }
    },
  },
];
```

All listener arrays are registered centrally in `store/listener.ts` via `initAppListeners()`.

## Pattern 1: Single Action (Most Common)

```typescript
{
  actionCreator: userLoggedIn,
  effect: async (action, { dispatch }) => {
    const profile = await fetchUserProfile(action.payload.userId);
    dispatch(userProfileLoaded(profile));
  },
},
```

## Pattern 2: Multiple Actions (Matcher)

```typescript
import { isAnyOf } from "@reduxjs/toolkit";

{
  matcher: isAnyOf(userLoggedIn, userLoggedOut, tokenExpired),
  effect: async (_, { dispatch }) => {
    dispatch(syncAuthState());
    dispatch(checkNotifications());
  },
},
```

## Pattern 3: Predicate-Based

```typescript
{
  matcher: (action) => action.type.endsWith("/failure"),
  effect: async (action, { dispatch }) => {
    const error = action.payload as { error: string };
    dispatch(showErrorToast({ message: error.error }));
  },
},
```

## Pattern 4: Cancel Previous (Search/Debounce)

```typescript
{
  actionCreator: searchQueryChanged,
  effect: async (action, { cancelActiveListeners, dispatch, delay }) => {
    cancelActiveListeners();
    await delay(300); // debounce
    const results = await searchApi(action.payload.query);
    dispatch(searchResultsLoaded({ results }));
  },
},
```

## Pattern 5: Preemptive Hydration via `setLocation`

The app should fetch and populate state **before** (or alongside) the components that depend on it. Listeners react to early signals — app init, authentication, route changes, parent-data-loaded actions — **never** to component mount. If a component has to ask for its own data, that's a missing listener.

The canonical signal is a `setLocation` action, dispatched from the root `App` component whenever the route changes. This is the **one legitimate `useEffect` at the app boundary** — it bridges React Router into the Redux world so all listeners can react to navigation.

```typescript
// App.tsx — the single place that connects routing to the store
function App() {
  const location = useLocation();
  const dispatch = useAppDispatch();

  useEffect(() => {
    dispatch(setLocation({ location: location.pathname }));
  }, [location, dispatch]);

  return <Outlet />;
}
```

A page-owning branch then listens for the route it cares about and hydrates:

```typescript
// store/products/products.listener.ts
{
  actionCreator: setLocation,
  effect: async (action, { dispatch }) => {
    if (matchPath('/products', action.payload.location)) {
      const payload = await fetchProductsApi();
      dispatch(fetchProductsSuccess(payload));
    }
  },
},
```

By the time `<ProductsPage />` mounts, `state.products.items` is populated — the component just renders.

### Anti-pattern: component fetches its own data

```typescript
// ❌ Wrong — component is orchestrating data loading
function ProductsPage() {
  const dispatch = useAppDispatch();
  useEffect(() => {
    dispatch(fetchProducts());
  }, []);
  // ...
}
```

The component now owns "decide when to fetch" *and* "render the result". That coupling spreads — every page repeats it, every test mocks it, every refactor risks it.

The fix is always: move the trigger out of the component into a listener that reacts to a higher-level signal (route change, auth event, app init).

## Error Handling

Always handle errors — dispatch a failure action, never let them silently fail:

```typescript
{
  actionCreator: submitOrder,
  effect: async (action, { dispatch, getState }) => {
    const cartId = getState().cart.id;

    // Validate preconditions first
    if (!cartId) {
      dispatch(submitOrderFailure({ error: "No active cart" }));
      return;
    }

    try {
      const order = await createOrder({ cartId });
      dispatch(submitOrderSuccess({ orderId: order.id }));
      dispatch(clearCart());
    } catch (e) {
      const message = e instanceof Error ? e.message : "Order failed";
      dispatch(submitOrderFailure({ error: message }));
    }
  },
},
```

## Where Do Cross-Branch Listeners Live?

When a listener reacts to action `A` (owned by branch X) and dispatches action `B` (owned by branch Y), it lives in **branch Y's `listener.ts`** — the branch whose data the effect is producing.

```typescript
// Example: on auth/loginSuccess, fetch the user's cart from the server.
// loginSuccess is auth's action; the effect populates cart's data.
// → put this listener in store/cart/cart.listener.ts, NOT auth.

// store/cart/cart.listener.ts
{
  actionCreator: loginSuccess,
  effect: async (action, { dispatch }) => {
    try {
      const items = await fetchCartFromServer(action.payload.userId);
      dispatch(cartFetchedFromServer(items));
    } catch {
      // Silent — cart stays at its current/default state
    }
  },
}
```

**Why this rule:** the listener's effect *produces* data for the target branch. Co-locating it with the branch that owns the produced data keeps related code together — when you change cart's state shape, you change cart's listeners; auth doesn't care.

A listener that produces side effects **outside the store** (logging, analytics, UI toasts) lives wherever the *trigger* makes most sense — usually in `store/ui/` or `store/app/`.

## Reading State Inside Listeners

```typescript
{
  actionCreator: fetchServiceQueue,
  effect: async (_, { dispatch, getState }) => {
    // Access state with getState()
    const shopId = getState().shop.id;
    const userId = getState().user.profile?.id;

    if (!shopId || !userId) {
      dispatch(fetchServiceQueueFailure({ error: "Missing context" }));
      return;
    }

    try {
      const queue = await fetchQueue({ shopId, userId });
      dispatch(fetchServiceQueueSuccess(queue));
    } catch {
      dispatch(fetchServiceQueueFailure({ error: "Failed to fetch queue" }));
    }
  },
},
```

## Chaining Actions

Listeners can dispatch multiple actions to orchestrate complex flows:

```typescript
{
  actionCreator: appInit,
  effect: async (_, { dispatch }) => {
    // Load in sequence
    const config = await fetchAppConfig();
    dispatch(appConfigLoaded(config));

    // Parallel loads after config
    await Promise.all([
      dispatch(fetchUser()),
      dispatch(fetchProducts()),
    ]);

    dispatch(appReady());
  },
},
```

## Common Mistakes

### Business logic in component
```typescript
// ❌ Wrong — listener job done in component
function Checkout() {
  async function handleSubmit() {
    if (!validateCart()) return;
    const order = await api.createOrder();
    router.push("/success");
  }
}

// ✅ Correct — component dispatches, listener handles everything
function Checkout() {
  function handleSubmit() {
    dispatch(submitOrder());
  }
}
```

### Logic in reducer
```typescript
// ❌ Wrong — reducer makes decisions
.addCase(addToCart, (state, action) => {
  const existing = state.byId[action.payload.id];
  if (existing) {
    existing.quantity += 1;
  } else {
    state.items.push(action.payload.id);
    state.byId[action.payload.id] = { ...action.payload, quantity: 1 };
  }
})

// ✅ Correct — listener decides which action to dispatch
.addCase(incrementCartItemQuantity, (state, action) => {
  state.byId[action.payload.id].quantity += 1;
})
.addCase(addCartItem, (state, action) => {
  state.items.push(action.payload.id);
  state.byId[action.payload.id] = action.payload;
})
```

The listener checks for the existing item and dispatches the appropriate action.
