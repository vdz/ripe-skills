# Route-Driven Hydration & Cleanup Reference

## When to read this
- Wiring data hydration to a route (load demos when the user enters `/demos`)
- Wiring cleanup to a route exit (commit a draft when the user leaves `/demos/:id/edit`)
- Debugging "my state resets when I navigate to the same URL twice"
- Debugging "my exit listener fires N times in a row"

## Contents
- Preemptive hydration via listeners
- Idempotency in setLocation listeners (entry guard)
- Same idempotency rule for "user left a route" listeners (exit guard)

## Preemptive Hydration via Listeners

Feature listeners react to `setLocation` to load data before the page renders:

```typescript
// store/products/products.listeners.ts
import { matchPath } from "react-router-dom";
import { setLocation } from "@/store/router/router.actions";

listenerMiddleware.startListening({
  actionCreator: setLocation,
  effect: async (action, { dispatch }) => {
    if (matchPath("/products", action.payload.location.pathname)) {
      const payload = await fetchProductsApi();
      dispatch(fetchProductsSuccess(payload));
    }
  },
});
```

Each store branch owns its own `setLocation` listener — no central route controller. See [building-ripe-store/listeners.md → Pattern 5](../building-ripe-store/listeners.md#pattern-5-preemptive-hydration-via-setlocation) for the full pattern.

## Idempotency in setLocation Listeners

`setLocation` fires on every location change — including programmatic navigations and hash-only updates. Every dispatching branch in a setLocation listener must guard with a state comparison before dispatching, or arriving at the same URL twice will reset in-flight state (a draft, an active upload, a freshly-loaded entity).

```typescript
{
	actionCreator: setLocation,
	effect: async (action, { dispatch, getState }) => {
		const path = action.payload.location.pathname;
		const state = getState();

		// ✅ Idempotent — guard before dispatching
		if (matchPath('/new', path)) {
			if (state.current.mode !== 'new') dispatch(startNewDemo());
			return;
		}

		const m = matchPath('/:shorthand', path);
		if (m) {
			const shorthand = m.params.shorthand!;
			if (state.current.shorthand !== shorthand) dispatch(selectDemo({ shorthand }));
			return;
		}
	},
},
```

The pattern is always **`if (state.x !== intendedValue) dispatch(action)`** — never unconditional dispatch inside a route-driven listener. Without the guard, the `setLocation` that fires when a child route mounts (or when the URL is set by another listener) clobbers work the first dispatch did. Each branch should `return` after handling — otherwise overlapping matches double-dispatch.

### Same idempotency rule for "user left a route" listeners

Listeners that fire on route-exit (cleanup, save-on-leave, autosave-flush) need the same guard. `setLocation` doesn't fire a "leaving" event — it just fires the new path. The exit listener checks "are we leaving the path we care about?" AND "did we already handle this leave?".

```typescript
{
	actionCreator: setLocation,
	effect: async (action, { dispatch, getState }) => {
		const path = action.payload.location.pathname;
		const state = getState();

		// We're 'leaving' the edit flow if:
		//   - state has an active editing session (we were on /edit)
		//   - the new path isn't an /edit path (we've left)
		const wasEditing   = state.current.editing !== null;
		const stillEditing = !!matchPath('/:shorthand/edit', path);

		if (wasEditing && !stillEditing) {
			dispatch(commitEdit());   // or cancelEdit, depending on policy
		}
	},
},
```

The very rare exception: a route-exit listener whose effect is **truly idempotent** (dispatching `clearTransientUiState()` is safe to call N times). Even then the guard adds clarity. Default to **guard always**; only skip if you can articulate why repetition is safe.

(The `ripe-audit` skill picks up this rule as a `ROUTING-H` check — see [ripe-audit/checklists/routing.md](../ripe-audit/checklists/routing.md).)

## Next

- Programmatic + in-component navigation → [navigation.md](navigation.md)
- Listener concurrency model (RTK fires all matching listeners in parallel) → [building-ripe-store/listeners.md → Pattern 7](../building-ripe-store/listeners.md#pattern-7-listener-concurrency)
