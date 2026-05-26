---
name: building-ripe-routing
description: Sets up and modifies React Router configuration following The Ripe Method architecture. Use when creating routes, adding pages, setting up navigation, or configuring the router-to-store bridge. Covers router setup, route definitions, the setLocation bridge, preemptive hydration via listeners, and in-component navigation.
---

# Building Ripe Routing

## Routes Are Feature Affordances — Design Them Early

In Ripe, the URL **is part of the feature design**, not a finishing touch. Every feature decision intersects with routing:

| Decision | Route impact |
|---|---|
| What does the user select? | Route param (`/demos/:shorthand`) |
| What modes does the feature have? | Each mode is a route or sub-route (`/demos/new`, `/demos/:shorthand`, `/demos/:shorthand/edit`) |
| What filters / sorts does the user pick? | Each is a query param (`?filter=...&sort=...&q=...`) |
| When should data be hydrated? | On the `setLocation` that enters the route — see [hydration.md](hydration.md) |
| What state should reset when the user leaves? | Listeners that react to `setLocation` and clear branch state on exit |
| What should be bookmarkable / shareable? | Anything in the URL — pick which feature-state fields earn a URL slot |

**Design routes before components.** When starting a feature, map the user-visible flow to a URL tree first. The result drives the shape of `state.X`, the listener entries that react to `setLocation` (hydrate on enter, clean up on exit, scope cross-branch UI to matching params), and the component composition (each route's `element:` is the entry component).

### State is the source of truth — listeners reconcile URL → state

The store is the **source of truth**; the URL is an external artifact that replicates some of that truth for linkability / shareability / browser-history reasons. The two are kept in sync by a listener that watches `setLocation`, identifies what the URL says, and dispatches actions to update whichever state slot needs to change.

```typescript
// ❌ Don't derive feature state from the URL at read time
const isNewMode = useAppSelector((s) => !!matchPath('/demos/new', s.router.location?.pathname));

// ✅ Keep mode in state; a listener reconciles state from setLocation
{
	actionCreator: setLocation,
	effect: async (action, { dispatch, getState }) => {
		const path = action.payload.location.pathname;
		const state = getState();

		if (matchPath('/demos/new', path)) {
			if (state.current.mode !== 'new') dispatch(startNewDemo());
			return;
		}
		// ...other matches reconcile other state slots...
	},
},
```

The URL changing is an **input event** like any other. The listener decides what state needs to update; reducers do the assignment. Components read state, not the URL.

(Components MAY use `useParams()` for the rare case where the URL param is the only useful identifier — but they don't decide feature behaviour from the URL. The listener already updated state by the time the component renders.)

### Routes drive cross-branch behaviour

A feature mounting under `/demos/:shorthand` triggers several listeners off the same `setLocation`:
- `demos.listener` hydrates the entity (`fetchDemoById` on cache miss)
- `current.listener` sets the selection (`selectDemo({ shorthand })`)
- `toolbar.listener` switches modes
- `upload.listener` scopes `UploadProgress` to the matching demo via the upload-shorthand stamp

All separate listeners reacting to the same `setLocation`. No single orchestrator — see [building-ripe-store/listeners.md → Pattern 7: Listener Concurrency](../building-ripe-store/listeners.md#pattern-7-listener-concurrency).

### Rule of thumb

**If you can describe what the user is doing by reading the URL bar alone, the feature design is on track.** If you have to inspect Redux state to know what the user is looking at, the URL is under-specified — go back to [Step 0: State Composition](../building-ripe-store/creating-a-branch.md#step-0-state-composition-is-a-human-decision) and redesign.

## File Structure

All routing config lives in `src/router/`:

```
src/router/
├── router.ts         # createBrowserRouter / createHashRouter setup
├── routes.tsx        # Route tree with named routes
└── types.ts          # AppRouteObject, route param types
```

The router has its own store branch at `store/router/`:

```
store/router/
├── router.actions.ts
├── router.reducer.ts
└── types.ts
```

## Common Tasks

| What you're doing | Read |
|---|---|
| Setting up routing on a fresh project | [setup.md](setup.md) |
| Adding a new route to the tree | [setup.md](setup.md#route-definitions) |
| Wiring `App.tsx` to the store | [setup.md](setup.md#the-bridge-apptsx) |
| Hydrating data for a route on entry | [hydration.md](hydration.md) |
| Cleaning up state on route exit | [hydration.md](hydration.md#same-idempotency-rule-for-user-left-a-route-listeners) |
| Navigating programmatically from a listener | [navigation.md](navigation.md) |
| Navigating from a component | [navigation.md](navigation.md#in-component-navigation) |

## What Belongs Where

| Concern | Where | Example |
|---------|-------|---------|
| Router instance | `src/router/router.ts` | `createHashRouter(routes)` |
| Route tree | `src/router/routes.tsx` | Named `AppRouteObject[]` |
| Location → Redux | `App.tsx` useEffect | `dispatch(setLocation({ location }))` |
| Route state in store | `store/router/` | Full `Location` object |
| Data hydration on route | Feature listeners | `matchPath` → `dispatch(fetch...)` |
| User-initiated navigation | Components | `useNavigate()` |
| Route params as lookup keys | Components | `useParams()` → `useAppSelector(byId[id])` |
| Post-logic redirects | Listeners | `router.navigate(...)` via imported router |

## Workflow Checklist

```
Routing Progress:
- [ ] Create src/router/ folder with router.ts, routes.tsx, types.ts
- [ ] Define AppRouteObject type with name property
- [ ] Create route tree in routes.tsx
- [ ] Create store/router/ branch (actions, reducer, types)
- [ ] Bridge in App.tsx: useLocation → dispatch(setLocation({ location }))
- [ ] Add setLocation listeners in feature branches for hydration
- [ ] Verify: components don't fetch data on mount
- [ ] Verify: useNavigate used for user navigation, not data loading
- [ ] Verify: every dispatching branch in setLocation listeners has an idempotency guard
```

## References

| Document | When to read | What's covered |
|---|---|---|
| [setup.md](setup.md) | Setting up routing or adding routes | Router instance, route definitions, App.tsx bridge, router store branch |
| [hydration.md](hydration.md) | Wiring data hydration to routes | Preemptive hydration via listeners, idempotency rules for entry and exit listeners |
| [navigation.md](navigation.md) | Navigating programmatically or from components | `router.navigate` from listeners, `useNavigate` + `useParams` in components |
| `building-ripe-store` skill | Listener patterns the routing skill builds on | Pattern 5 (preemptive hydration), Pattern 7 (concurrency), cardinal rule #5 |
