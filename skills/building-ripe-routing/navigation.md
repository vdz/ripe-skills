# Navigation Reference

## When to read this
- Navigating programmatically from a listener (after API success, on validation failure, post-logout)
- Navigating from a component on user action (button click, link)
- Reading route params in a component

## Contents
- Programmatic navigation from listeners
- In-component navigation
- Anti-patterns

## Programmatic Navigation from Listeners

When a listener needs to navigate (e.g. after validation, after an API call), import the router directly — **never** inject `useNavigate` from a component:

```typescript
// In any listener file
import { router } from "@/router/router";

// Inside a listener effect:
router.navigate("/summary");
```

React Router's `createBrowserRouter` / `createHashRouter` returns a router object with a public `navigate()` method. This works outside React components with no setup.

**NEVER do this:**

```typescript
// WRONG — mutable module state, temporal coupling, weird dependency direction
let navigate: (path: string) => void = () => {};
export function setNavigate(fn: (path: string) => void) { navigate = fn; }

// WRONG — component injecting into store layer
useEffect(() => { setNavigate(nav); }, [nav]);
```

The injection pattern creates a mutable module variable, only works after the component mounts, and inverts the dependency direction (component → listener).

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

- **Component triggers fetch on mount via `useNavigate` / `useParams` reaction.** That's a `building-ripe-store` cardinal-rule #5 violation — listeners hydrate, components don't fetch. The listener already loaded data when `setLocation` fired; the component just reads.
- **Listener calls a component-provided `navigate`.** Inverts dependency direction. Use the imported `router.navigate(...)`.
- **Component computes "where to go" with side-effect logic in JSX.** Extract to a HELPER below the return (see [building-ripe-components/SKILL.md](../building-ripe-components/SKILL.md)).
