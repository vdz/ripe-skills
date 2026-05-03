# Actions and Payloads Reference

## When to read this
- Adding a new action to a branch
- Designing a payload for a data-bearing action
- Naming a new action and unsure between `toggleX` vs `showX` / `hideX`
- Reviewing whether an existing action follows the rules

## What's covered
- The payload-as-interface rule and its rationale
- Action naming conventions
- The actions-file template
- Common naming pitfalls

---

## The Payload-as-Interface Rule

**Every action that carries data MUST have a payload `interface` with named fields, defined in the branch's `types.ts`.**

This is non-negotiable — even for single-value payloads:

```typescript
// ❌ WRONG — bare type alias, inline primitive
export type SetRanResultPayload = string;
dispatch(setRanResult("RAN-12345"));
// at the call site: what IS that string?

// ✅ RIGHT — interface with named field
export interface SetRanResultPayload {
	ranCode: string;
}
dispatch(setRanResult({ ranCode: "RAN-12345" }));
// self-documenting at every call site
```

### Why

- **Dispatch sites read as data documents.** `dispatch(setRanResult({ ranCode: "RAN-12345" }))` is self-explanatory; `dispatch(setRanResult("RAN-12345"))` is not.
- **Adding a second field later is a non-event.** If `setRanResult` later needs `{ ranCode, retrievedAt }`, the structure already supports it. With a bare `string`, you'd refactor every call site.
- **Reducers read clearly.** `state.ranCode = action.payload.ranCode` tells you exactly which field is being assigned.
- **No judgment calls.** "Is this simple enough to inline?" is a recurring discussion that always wastes time. The rule removes it.

### The hard line

If an action carries data, it has an interface in `types.ts`. **No `type X = string`. No `createAction<string>(...)`. No exceptions.**

If an action carries no data (e.g., `appReady`, `clearCart`), use plain `createAction('feature/event')` — no payload type needed.

---

## Action Naming

**Action names describe the event, not the imperative behavior or its toggle.**

### Be descriptive, not "toggling"

```
❌ toggleUserPopup        // payload signals open/close — hides intent
✅ showUserPopup
✅ hideUserPopup
```

Two distinct events read better than one event with a hidden mode flag. Reducers don't have to branch on payload, listeners don't have to interpret state.

### Verb + feature + variant

```
fetchProducts                // verb: fetch, feature: products
fetchProductsSuccess         // variant: success
fetchProductsFailure         // variant: failure
addToCart                    // verb: add, target: cart
incrementCartItemQuantity    // descriptive multi-word is fine
```

Action types in the store namespace use slash-separated keys: `'products/fetchProducts'`, `'products/fetchProductsSuccess'`.

### Payload type names

Payload type names are PascalCase versions of the action name with a `Payload` suffix:

```typescript
fetchProducts        → no payload
fetchProductsSuccess → FetchProductsSuccessPayload
fetchProductsFailure → FetchProductsFailurePayload
addToCart            → AddToCartPayload
```

---

## The Actions File Template

```typescript
// store/products/products.actions.ts
import { createAction } from '@reduxjs/toolkit';
import type {
	FetchProductsSuccessPayload,
	FetchProductsFailurePayload,
	AddToCartPayload,
} from './types';

// No payload — fire-and-forget event
export const fetchProducts = createAction('products/fetchProducts');

// Payload-bearing — interface from types.ts
export const fetchProductsSuccess = createAction<FetchProductsSuccessPayload>('products/fetchProductsSuccess');
export const fetchProductsFailure = createAction<FetchProductsFailurePayload>('products/fetchProductsFailure');

// Cross-feature target is fine — namespace by the SOURCE feature
export const addToCart = createAction<AddToCartPayload>('products/addToCart');
```

The action namespace prefix (`products/...`) reflects the *feature owning the action*, not where it's dispatched from.

---

## Common Pitfalls

| Pitfall | Why it's wrong | Fix |
|---|---|---|
| `createAction<string>('users/setId')` | Bare primitive payload | Define `SetUserIdPayload { userId: string }` and use it |
| `toggleSidebar` (boolean payload) | Hides intent in payload | Split into `showSidebar` / `hideSidebar` |
| `productsFetchedAndShown` | Compound event — what's the actual transition? | Two actions: `fetchProductsSuccess` then `productListShown` (or model with selectors) |
| Payload interface in the actions file | Couples types to actions; reducer can't import without circular ref | Always define payloads in the branch's `types.ts` |
| `setActiveProduct(product: Product)` (full object) | Listeners and components dispatch with whatever they have; this couples them to the full shape | Pass an ID: `setActiveProduct({ productId: string })`. Selectors read `byId[productId]` |
