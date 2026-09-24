# Navigation Reference

## When to read this
- Navigating programmatically from a listener (after API success, on validation failure, post-logout)
- Correcting a URL the store resolved to a different place (a step out of range, a mode the entity lacks)
- Navigating from a component on user action (button click, link)
- Reading route params in a component

## Contents
- Programmatic navigation from listeners
- When the URL disagrees with the store
- In-component navigation
- Anti-patterns

## Programmatic Navigation from Listeners

A listener navigates with the router the store hands it, as RTK's listener `extra`:

```typescript
// Inside a listener effect:
effect: async (action, { extra }) => {
	await extra.router.navigate("/summary");
},
```

The wiring is made once, at boot ([setup.md → Router Setup](setup.md#router-setup)):

```typescript
// main.tsx
const router = createAppRouter();
const store = makeStore(router);   // → createListenerMiddleware({ extra: { router } })
```

`ListenerExtra` in `store/types.ts` types it, so every effect sees `extra.router` as the app's router with no cast (scaffold: [ripe-init → store-templates.md](../ripe-init/store-templates.md#srcstoretypests)). It is the same object `<RouterProvider>` renders, so where a listener navigates is what the user sees.

Why the store hands it in:
- **No import cycle.** `routes.tsx` imports the screens, the screens import `@/store`, and the store imports every listener. A listener that imports the router module closes that loop, and a production bundle can then evaluate a module before one it reads — a crash no typecheck or test sees.
- **It exists before any listener runs.** The router is made before the store, so no listener waits on a component to mount and supply a `navigate`.
- **Tests navigate a real router.** The harness hands listeners a memory router and the test reads where it went (`harness.router.state`) — see [building-ripe-tests → listener-tests.md](../building-ripe-tests/listener-tests.md#asserting-a-navigation).

A router is a live object, not data: it lives in `extra`, and state holds only the location `setLocation` mirrors.

## When the URL Disagrees with the Store

Sometimes the URL names a place the store resolves differently: step 9 of a 3-step tutorial, `/edit` on an entity that cannot be edited, an entry URL with no step in it. The screen shows the resolved place; a listener makes the URL agree by **replacing** it, so Back skips the address that was wrong:

```typescript
{
	matcher: isAnyOf(playerShown, tutorialLoaded),   // the actions that resolve the place
	effect: async (_action, { getState, extra }) => {
		const state = getState();
		const address = selectPlayerAddress(state);    // the resolved place, as a path
		if (null === address || address === selectPathname(state)) return;
		await extra.router.navigate(address, { replace: true });
	},
},
```

- **Trigger on the actions that resolve the place**: the one a `setLocation` listener dispatches once it has read the URL, and the data arrivals (`…Loaded`) that let the place resolve later. `setLocation` dispatches the resolving action inside itself, so a listener on both navigates twice for one move.
- **Guard on the comparison.** The replace brings a fresh `setLocation`, which resolves to the same place, whose address now matches — the correction ends in one turn.
- **Move the router, never `window.history`.** The router read the address bar when it was made and does not see a direct history write. A boot that restores a URL after sign-in calls `extra.router.navigate(url, { replace: true })` too, with the path below the router's `basename` (the router puts its base in front itself).

This keeps the URL a projection of the store. A component rendering `<Navigate replace>` computed from state is the same job in the wrong layer.

## In-Component Navigation

Components use `useNavigate` for user-initiated navigation and `useParams` for route params:

```typescript
export function HistoryQueue() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const shopId = useAppSelector((state) => state.shop.id);

  return (
    <QueueWrapper>
      <QueueRow>
        <AddBackToQueue onClick={() => navigate(`/shop/${shopId}/history/readd/${requestId}`)}>
          {t("re-add")}
        </AddBackToQueue>
      </QueueRow>
    </QueueWrapper>
  );
}
```

Components read route params with `useParams`, but data should already be in the store (hydrated by `setLocation` listeners — see [hydration.md](hydration.md)):

```typescript
export function ProductDetail() {
  const { productId } = useParams();
  const product = useAppSelector((state) => state.products.byId[productId!]);

  if (!product) return <ProductDetailSkeleton />;

  return (
    <ProductDetailWrapper>
      <ProductTitle>{product.name}</ProductTitle>
    </ProductDetailWrapper>
  );
}
```

## Anti-patterns

- **Listener imports the router module** (`import { router } from "@/router/router"`). It closes the store → listener → router → routes → screens → store cycle. Use `extra.router`.
- **Listener calls a component-provided `navigate`** (a `setNavigate` injected from a `useEffect`). It works only after that component mounts and inverts the dependency direction. Use `extra.router`.
- **Component corrects the URL** with `<Navigate replace>` computed from state. A listener owns it — see [When the URL Disagrees with the Store](#when-the-url-disagrees-with-the-store).
- **Component triggers fetch on mount via `useNavigate` / `useParams` reaction.** That's a `building-ripe-store` cardinal-rule #5 violation — listeners hydrate, components don't fetch. The listener already loaded data when `setLocation` fired; the component just reads.
- **Component computes "where to go" with side-effect logic in JSX.** Extract to a HELPER below the return (see [building-ripe-components/SKILL.md](../building-ripe-components/SKILL.md)).
