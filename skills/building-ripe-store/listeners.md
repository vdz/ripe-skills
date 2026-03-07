# Listener Patterns Reference

## Contents
- Listener file structure
- Pattern 1: Single action (most common)
- Pattern 2: Multiple actions (matcher)
- Pattern 3: Predicate-based
- Pattern 4: Cancel previous (search/debounce)
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
