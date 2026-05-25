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
- Pattern 6: Two-listener intent chain (decide + execute)
- Pattern 7: Listener concurrency
- Pattern 8: Concurrent-action guards
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

## Service Modules — Exempt from "All Logic in Listeners"

Service modules are blackbox dependencies the app calls — Native bridges, async persistence libraries, third-party API SDKs, the clipboard API, OS integrations. **Their internals are not subject to Ripe's "all logic in listeners" rule.** A storage driver can use callbacks, a Native bridge can chain promises, an SDK can have its own internal state machine. Ripe applies at the **app boundary** — the listener wraps the service module and exposes a clean dispatch interface.

```typescript
// store/storage/storage.listener.ts — listener wrapping an async persistence module
{
	actionCreator: persistSettings,
	effect: async (action, { dispatch }) => {
		try {
			await asyncStorage.set('settings', action.payload.settings);
			dispatch(persistSettingsSuccess());
		} catch (err) {
			dispatch(persistSettingsFailure({ error: errorMessage(err) }));
		}
	},
},
```

The `asyncStorage` module's internals — promise chains, key validation, IndexedDB transactions — are off-limits to Ripe. We don't refactor it to dispatch actions; we wrap it. The rule for the wrapper: one listener entry per intent, error handling at the boundary, no leakage of module-internal state into the store.

**How to recognise a service module** (vs an app concern that should be a listener): you didn't write it AND you wouldn't write it. Standard library, OS API, framework module, npm package's public surface — service module. Your own `apiClient.ts` that you wrote two days ago — that's an app concern; its logic belongs in listeners.

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

**Semantics:**
- `cancelActiveListeners()` cancels in-flight runs of **the same listener entry** only — not other listeners reacting to the same action.
- `delay(N)` is RTK's cancellation-aware sleep. If the listener is cancelled mid-delay, the effect stops silently (no thrown exception). Anything after `await delay` is skipped.
- For matchers that catch high-frequency actions selectively, gate the debounce: `if (setSearch.match(action)) { cancelActiveListeners(); await delay(150); }`.
- Prefer this over `setTimeout` — `delay` integrates with RTK's cancellation lifecycle and avoids stale closures.

### Natural use cases (rare but specific)

The `cancelActiveListeners + delay` debounce pattern is right for a narrow set of situations. Don't reach for it by default — most listeners are single-shot.

**Per-keystroke text input → URL sync.** The user types in a search box wired to a URL query param. Without debouncing, every keystroke creates a browser history entry. With `cancelActiveListeners + delay(150)`, only the final keystroke's listener completes and writes the URL.

```typescript
{
	actionCreator: setSearch,
	effect: async (action, { cancelActiveListeners, delay }) => {
		cancelActiveListeners();
		await delay(150);
		router.navigate({ search: `?q=${encodeURIComponent(action.payload.query)}` });
	},
},
```

**Scroll position → list re-page.** A virtualised list dispatches `scrollPositionChanged` per scroll tick. The next-page fetch only needs to fire when the scroll *settles* — debounce 200ms.

**Auto-save drafts.** The user is typing; persist every few seconds, not every keystroke. Listen for `draftFieldEdited`, cancel any pending save, delay 2000ms, dispatch `saveDraft`.

**When NOT to use it:**
- Single-shot API calls (fetch on route enter) — no concurrency to cancel.
- Idempotent dispatches — if the effect is the same regardless of how many times it fires, debouncing is overhead.
- Concurrent guards — that's [Pattern 8](#pattern-8-concurrent-action-guards), not this.

If you find yourself reaching for `cancelActiveListeners` more than once or twice across a project, audit: most listeners shouldn't need it.

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

## Pattern 6: Two-Listener Intent Chain

When the response to an action requires (a) a conditional decision based on state, and (b) a side effect that follows that decision, split across two listeners. Listener A reads state and dispatches an intent action. Listener B executes the side effect.

```typescript
// store/current/current.listener.ts
// Listener A — decision: should we fetch?
{
	actionCreator: selectDemo,
	effect: async (action, { dispatch, getState }) => {
		const { shorthand } = action.payload;
		if (getState().demos.byId[shorthand]) return;        // cache hit
		dispatch(fetchDemoById({ shorthand }));              // cache miss — emit intent
	},
},

// store/demos/demos.listener.ts
// Listener B — execution: fetch the demo
{
	actionCreator: fetchDemoById,
	effect: async (action, { dispatch }) => {
		try {
			const demo = await getDemoById(action.payload.shorthand);
			dispatch(fetchDemoByIdSuccess({ demo }));
		} catch (err) {
			dispatch(fetchDemoByIdFailure({
				shorthand: action.payload.shorthand,
				error: err instanceof Error ? err.message : 'fetch failed',
			}));
		}
	},
},
```

Key points:
- **Listener A is the decision listener.** Reads state, decides whether to proceed. No side effects, no API calls.
- **Listener B is the execution listener.** Runs the side effect unconditionally — by the time it fires, the decision has already been made.
- **The intent action (`fetchDemoById`)** often has no reducer case — it's a pure signal between listeners. Its success/failure actions hit reducers.
- **No `await` between them.** Listener A returns; Listener B fires on the same tick from the dispatched intent action — see Pattern 7 (concurrency).
- **Cross-branch placement.** Listeners can live in different branches following the standard cross-branch rule (the listener lives with the branch the effect *produces* data for).

Use this pattern whenever the natural sentence is "if X, then do Y". The intent action is the period in the middle.

## Pattern 7: Listener Concurrency

RTK runs **all** listeners that match an action **concurrently**, in undefined order. Cross-listener chains (Listener A dispatches `X`; Listener B reacts to `X`) work automatically as long as both listeners are registered with the same `listenerMiddleware`.

```typescript
// store/router/router.listener.ts — bridge
{
	actionCreator: setLocation,
	effect: async (action, { dispatch }) => {
		const m = matchPath('/:shorthand', action.payload.location.pathname);
		if (m) {
			dispatch(selectDemo({ shorthand: m.params.shorthand! })); // fires demos.listener on the same tick
		}
	},
},

// store/demos/demos.listener.ts
{
	actionCreator: selectDemo,
	effect: async (action, { dispatch, getState }) => {
		if (getState().demos.byId[action.payload.shorthand]) return;
		dispatch(fetchDemoById({ shorthand: action.payload.shorthand }));
	},
},
```

You do **not** need:
- registration-order tricks
- explicit `await dispatch(...)`
- a "central orchestrator" listener

The chain fires automatically. Add no artificial sequencing.

**The exception** — if Listener A reads state that Listener B will write, and A's logic depends on B finishing first, redesign: have Listener B dispatch a second intent action once done, and have A's downstream work react to that. Don't reach for `await`.

## Pattern 8: Concurrent-Action Guards

For actions that initiate a long-running pipeline (uploads, imports, batch operations), guard against concurrent runs by reading current state and — if a run is in flight — dispatching a rejection action instead.

```typescript
{
	actionCreator: startUpload,
	effect: async (action, { dispatch, getState }) => {
		if (!startUpload.match(action)) return;
		const existing = getState().upload;
		const active = existing.status === 'manifesting'
			|| existing.status === 'uploading'
			|| existing.status === 'committing';
		if (active) {
			dispatch(uploadRejected({ reason: 'concurrent' }));
			dispatch(pushToast({
				toast: { id: toastId(), kind: 'warn',
				         message: 'An upload is already in progress.' }
			}));
			return;
		}
		if (existing.status === 'done' || existing.status === 'error') {
			dispatch(resetUpload());   // clear stale state before starting fresh
		}
		// ...proceed with the pipeline...
	},
},
```

Key points:
- **The rejected action carries a reason** — `UploadRejectedPayload { reason: 'concurrent' | 'over-quota' | 'unauthorized' }`. New reasons land as new payload values, not new actions.
- **The reducer is a no-op for the rejection action** — state already conveys "active" via `status`; the rejection exists for devtools / analytics / toast, not for state shape.
- **The toast is the listener's job.** The component dispatched once (`startUpload`); the listener decides BOTH the rejection AND the user-visible feedback. Don't make the component compute "is one running?" — that's a state decision and components are passive.
- **Stale state reset is part of the same effect** — if the previous run is `done` or `error`, dispatch `resetUpload` first so the new run starts from idle, not from a stuck terminal state.

This shape generalises to anything with phases — imports, batch deletes, exports.

## Optimistic Updates with Rollback (Error Handling Optional)

For user-initiated entity edits where you want the UI to reflect the new value immediately (before the server answers), Ripe uses a three-case pattern on a single action trio. No separate "optimistic" action.

> **HITL gate.** Before adding rollback machinery, ask the project owner whether they want error handling for this flow. Sometimes errors are quietly logged and the optimistic write is kept (shorter code, simpler reducer); sometimes they're explicitly rolled back. The full pattern below is for the rollback case — strip the failure branch if the owner decides errors can be ignored.

### Full pattern (with rollback)

```typescript
// demos.reducer.ts
.addCase(updateDemo, (state, action) => {
	// (1) Write optimistically. The `if (existing)` is a data-invariant guard
	//     (cardinal rule #2 permits guards; bans business decisions).
	state.error = null;
	const { shorthand, patch } = action.payload;
	const existing = state.byId[shorthand];
	if (existing) state.byId[shorthand] = { ...existing, ...patch };
})
.addCase(updateDemoSuccess, (state, action) => {
	// (2) Server answered — replace with the server-fresh record.
	state.byId[action.payload.demo.shorthand] = action.payload.demo;
})
.addCase(updateDemoFailure, (state, action) => {
	// (3) Rollback — failure carries the pre-action original.
	state.error = action.payload.error;
	if (action.payload.original) {
		state.byId[action.payload.original.shorthand] = action.payload.original;
	}
})

// demos.listener.ts — captures the original via getOriginalState
{
	actionCreator: updateDemo,
	effect: async (action, { dispatch, getOriginalState }) => {
		if (!updateDemo.match(action)) return;
		const original = getOriginalState().demos.byId[action.payload.shorthand] ?? null;
		try {
			const result = await updateDemoApi(action.payload);
			dispatch(updateDemoSuccess(result));
		} catch (err) {
			dispatch(updateDemoFailure({
				error: errorMessage(err, 'Failed to update demo'),
				original,
			}));
		}
	},
},
```

### Shortened pattern (no rollback, errors silent)

```typescript
// reducer: same two cases for action + success, no failure case
// listener: try/catch with console.error and no dispatch on failure
{
	actionCreator: updateDemo,
	effect: async (action, { dispatch }) => {
		if (!updateDemo.match(action)) return;
		try {
			const result = await updateDemoApi(action.payload);
			dispatch(updateDemoSuccess(result));
		} catch (err) {
			console.error('updateDemo failed (ignored):', err);
			// Optimistic write stays; no UI rollback.
		}
	},
},
```

### Key points

- **`getOriginalState()`** (from `listenerApi`) returns state at the moment the action was dispatched, before any reducer ran. Snapshot it BEFORE `await` — by the time the API call resolves, `getState()` reflects the optimistic write.
- **The success case replaces the full record**, never merges — the server may add fields the patch didn't touch (`updatedAt`, etc.).
- **The reducer's `if (existing)` guard is fine** per cardinal rule #2: it's a data-invariant null check, not a business decision.
- **When to use rollback** — when failure has user-visible consequences (form re-prompts, retry buttons, "couldn't save" UI). When NOT — fire-and-forget telemetry, analytics, background sync where the user neither sees nor cares about server failures.

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

### Cross-Branch Cleanup on Entity Delete

When an entity in one branch can be deleted while another branch holds entity-scoped state, the other branch listens for the delete and cleans up.

```typescript
// store/upload/upload.listener.ts
{
	actionCreator: deleteDemoSuccess,
	effect: (action, { dispatch, getState }) => {
		if (getState().upload.shorthand === action.payload.shorthand) {
			dispatch(resetUpload());
		}
	},
},
```

It's a small app decision ("does this delete affect us?") made by the listener that owns the affected state. The sibling branch stamps the in-flight entity ID on its state (`upload.shorthand`); the listener compares. Per the cross-branch rule, the listener lives in the branch whose state it resets — not in `demos.listener`.

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

### What CAN live in a reducer vs what CAN'T

Reducers handle data mapping + low-level data maintenance. They never decide business outcomes.

**✅ Allowed in reducer — data invariant guards:**

```typescript
// Dedupe — pushing an ID already in items would corrupt the collection
.addCase(fetchDemoByIdSuccess, (state, action) => {
	const d = action.payload.demo;
	state.byId[d.shorthand] = d;
	if (!state.items.includes(d.shorthand)) {
		state.items.push(d.shorthand);
	}
	delete state.errorById[d.shorthand];
})

// Cascade-delete within the same branch — removing an entity cleans its satellites
.addCase(removeDemo, (state, action) => {
	const { shorthand } = action.payload;
	state.items = state.items.filter((s) => s !== shorthand);
	delete state.byId[shorthand];
	delete state.errorById[shorthand];
	if (state.activeShorthand === shorthand) state.activeShorthand = null;
})

// Re-derive filteredItems on mutation (cache-on-mutation rule)
.addCase(setFilter, (state, action) => {
	state.filter = action.payload.filter;
	state.filteredItems = applyFilter(state.items, state.byId, state.filter);
})

// Defensive null guard — entity may not be in byId at action time
.addCase(updateDemo, (state, action) => {
	const { shorthand, patch } = action.payload;
	const existing = state.byId[shorthand];
	if (existing) state.byId[shorthand] = { ...existing, ...patch };
})
```

**❌ Not allowed in reducer — business decisions:**

```typescript
// ❌ Conditional outcome — listener decides which action to dispatch
.addCase(checkoutClicked, (state) => {
	if (state.items.length > 0) state.status = 'pending-payment';
	else state.error = 'Cart is empty';
})

// ❌ Cross-branch read — listener gates with selector
.addCase(deletePost, (state, action) => {
	if (state.user.role !== 'admin') return;
	delete state.byId[action.payload.id];
})

// ❌ Add-or-increment decision — listener splits into two actions
.addCase(addToCart, (state, action) => {
	const existing = state.byId[action.payload.id];
	if (existing) existing.quantity += 1;                       // ← decision
	else state.byId[action.payload.id] = { ...action.payload }; // ← decision
})
// ✅ instead: listener dispatches either incrementCartItemQuantity or addCartItem
//    based on getState() — reducer cases stay pure assignment.

// ❌ Async work
.addCase(fetchDemos, async (state) => {
	state.items = await fetch('/demos');
})
```

**Rule of thumb:** if the guard asks "is this data in a consistent state?" → reducer. If it asks "should this happen?" → listener.

Keep reducer logic to a minimum either way. Dedupe and cascade-delete are acceptable but not free — they widen the reducer's surface area, so use them only when the invariant they protect is genuinely the reducer's responsibility.
