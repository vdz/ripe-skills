---
name: building-ripe-components
description: Creates and modifies React components following The Ripe Method architecture. Use when creating new components, editing existing components, or adding UI features. Covers component anatomy, types, styled components, and file structure. For full features requiring both state and UI, pair with building-ripe-store.
---

# Building Ripe Components

## File Structure

Every component is a folder:

```
components/
└── ProductCard/
    ├── ProductInternals/     # (optional) Internal components and UI parts 
    ├── ProductCard.tsx       # Component logic
    ├── ProductCard.styled.tsx # Styled components
    ├── types.ts              # Component-specific types
    └── index.ts              # Re-export only
```

`index.ts` contains only: `export { ProductCard } from './ProductCard';`

## Component Anatomy

Every component follows this exact order:

```typescript
export function ProductCard({ productId }: ProductCardProps) {
  // ═══ SETUP ═══
  const { t } = useTranslation();
  const product = useAppSelector((state) => state.products.byId[productId]);

  // ═══ EARLY EXIT ═══
  if (!product) return null;

  // ═══ RETURN ═══
  return (
    <ProductCardWrapper>
      <ProductName>{product.name}</ProductName>
      <PriceTag>{product.price}</PriceTag>
    </ProductCardWrapper>
  );

  // ═══ HELPERS ═══
  function formatDisplayPrice() {
    return `$${product.price.toFixed(2)}`;
  }
}
```

**Rules:**
- Function declaration syntax — never `const Component: React.FC` or arrow functions
- Function Props: Minimal props will be passed, because components "select" their data from the store.
- Setup: hooks and selectors only
- Early exit: guard clauses, loading/empty/error states — return as soon as possible
- Return: semantic styled components ONLY — no raw HTML tags
- Helpers: defined below the return statement
- Effect: avoid using effects in components for hydration & API calls. Use them for DOM manipulation only when necessary.

## Types File

`types.ts` lives adjacent to the component:

```typescript
// components/ProductCard/types.ts
import type { Product } from '@/store/products/types';

export interface ProductCardProps {
  id: Product['id'];
}
```

Derive from store types rather than duplicating — `Product['id']` stays in sync automatically.

## JSX Rules

**Only semantic styled components in the return statement. Never use Tailwind CSS or shadcn/ui — all styling is done via styled-components.**

```typescript
// ✅ Correct
return (
  <ProductCardWrapper>
    <ProductImage src={imageUrl} alt={name} />
    <ProductDetails>
      <ProductName>{name}</ProductName>
      <AddToCart onClick={() => dispatch(addToCart(productId))}>
        {t('add-to-cart')} // `t` is an example of translation function, which is not required for the component to work
      </AddToCart>
    </ProductDetails>
  </ProductCardWrapper>
);

// ❌ Wrong — raw HTML in return
return (
  <div className="card">
    <img src={product.imageUrl} />
    <div className="details">
      <h3>{product.name}</h3>
      <button onClick={...}>Add</button>
    </div>
  </div>
);
```

## Styled Components File

Avoid using component props in styled components. Use classes instead.
Classes both signify the state of the component in debugging, and quicker for rerender.
When needed classes should be decided upon in components using `classnames` library.

Styled components must be **purely declarative** — no conditionals, no logic, no interpolated functions beyond static theme values. All decisions about appearance belong in the component (via classes), not in the style definition. This keeps styled components "dumb": they describe what things look like, never why.

```typescript
// ❌ Wrong - prop-based styling
export const AddToCart = styled.button<{ disabled: boolean }>`
  background: ${({ disabled }) => disabled ? colors.muted : colors.primary};
`;

// ✅ Correct - class-based styling
export const AddToCart = styled.button`
  background: ${colors.primary};
  &.disabled { background: ${colors.muted}; }
`;

// In the component, use classnames to apply the class:
// import cn from 'classnames';
// <AddToCart className={cn({ disabled: isOutOfStock })} />
```

```typescript
// ProductCard.styled.tsx
import styled from 'styled-components';
import { colors } from 'styles/theme';
import { Popup } from '@atomic-component-collection/Popup'; // Example of importing from the atomic component collection

export const ProductCardWrapper = styled.article`
  display: flex;
  flex-direction: column;
  border-radius: 8px;
`;

export const ProductName = styled.h3`
  font-size: 1rem;
  font-weight: 600;
`;

export const AddToCart = styled.button`
  background: ${colors.primary};
  color: white;
`;

export const ProductQuantityPopup = styled(Popup)`
  border-radius: 8px;
  border-color: "salmon";
`;
```

Names describe purpose, never generic: `ProductCardWrapper` not `Container`, `AddToCart` not `Button`.

## Component Behavior Rules

- **Passive and reactive** — only reads from state, dispatches actions
- **No business logic** — no API calls, no complex decisions, no `useState` for app data
- **Dispatch actions** — let listeners handle side effects
- **`useAppSelector`** for reading state, `useAppDispatch` for dispatching
- **Navigation is OK** — components can use `useNavigate` for user-initiated navigation and `useParams` for route params
- **Never trigger data loading** — components do not initiate fetches, hydration, or any data-related side effects. By the time a component renders, the data it needs should already be in the store. If it isn't, the component renders an empty/loading state and waits — it never reaches out to fix it.

```typescript
// ✅ Dispatch and let listener handle logic
function Cart() {
  const handleCheckout = () => dispatch(initiateCheckout());
  return <CheckoutButton onClick={handleCheckout}>{t('checkout')}</CheckoutButton>;
}

// ❌ Component doing listener's job
function Cart() {
  const handleCheckout = async () => {
    const order = await api.createOrder(items);
    await api.processPayment(order.id);
    router.push('/confirmation');
  };
}
```

## Workflow Checklist

```
Component Creation Progress:
- [ ] Create folder: components/ComponentName/
- [ ] Create ComponentName.tsx with function declaration
- [ ] Add SETUP, EARLY EXIT, RETURN, HELPERS sections
- [ ] Create ComponentName.styled.tsx with semantic names
- [ ] Create types.ts adjacent to component
- [ ] Create index.ts with single re-export
- [ ] Verify: no raw HTML tags in return
- [ ] Verify: no business logic in component
- [ ] Verify: file is ~100 lines or under
```

**Import aliasing:** Use `@` as alias for `src/` in all imports (e.g., `@/store/products/types`, `@/components/Shared`).

**For detailed patterns and before/after examples**: See [patterns.md](patterns.md)
**For styled component naming conventions**: See [styled.md](styled.md)
**For routing and navigation**: See building-ripe-routing skill
