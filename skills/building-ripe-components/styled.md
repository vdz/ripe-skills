# Styled Components Reference

## Contents
- File structure and imports
- Naming conventions
- Theming via CSS variables
- Variants pattern (prop-based, class-based)
- Organizing large styled files

## File Structure and Imports

```typescript
// ProductCard.styled.tsx
import styled, { css } from 'styled-components';

export const ProductCardWrapper = styled.article`...`;
export const ProductName = styled.h3`...`;
export const PriceTag = styled.span`...`;
export const AddToCartButton = styled.button`...`;
```

Import into the component:
```typescript
// ProductCard.tsx
import {
	ProductCardWrapper,
	ProductName,
	PriceTag,
	AddToCartButton,
} from './ProductCard.styled';
```

## Naming Conventions

Names are `[Component][Role]` — always semantic, never generic:

| ❌ Generic | ✅ Semantic |
|-----------|------------|
| `Container` | `CartWrapper` |
| `Header` | `ProductPageHeader` |
| `Button` | `AddToCartButton` |
| `Title` | `SectionTitle` |
| `Row` | `CartItemRow` |
| `Text` | `ProductDescription` |
| `Icon` | `CloseIcon` |
| `Modal` | `DeleteConfirmDialog` |

## Theming via CSS Variables

Define design tokens as CSS custom properties in a single global stylesheet. Reference them from styled components with `var(--token)`. **Don't** import a JS theme into styled components or use the styled-components `theme` prop — CSS variables sidestep the whole prop-interpolation problem.

### Why CSS variables (not the styled-components `theme` prop)

- **No prop interpolation** — naturally aligns with the "class-based, avoid prop-based" rule from [SKILL.md](SKILL.md#styled-components).
- **Theme switching is a `<html>` class toggle** — no React Provider rerender, no styled-components recompilation.
- **Visible in DevTools** — inspectors show the token name and the value it resolved to.
- **Plain CSS** — works inside `calc()`, `@keyframes`, media queries, anywhere CSS works.

### `theme.css` (loaded once, globally)

```css
:root {
	/* Color tokens */
	--surface: #FAFAF8;
	--card: #FFFFFF;
	--text-primary: #1A1A1A;
	--text-muted: #8B8685;
	--accent: #A8694B;
	--success: #3D8B6E;
	--error: #C7523B;
	--border: #E8E4E0;

	/* Spacing, radius */
	--spacer: 4px;
	--radius-card: 12px;
	--radius-button: 20px;

	/* Typography */
	--font-primary: 'Geist Sans', -apple-system, system-ui, sans-serif;
	--text-body: 14px;
}
```

Imported once at the app entry:
```typescript
// main.tsx
import '@/assets/styles/theme.css';
```

### Using tokens in styled components

```typescript
// AddToCart.styled.tsx
import styled from 'styled-components';

export const AddToCart = styled.button`
	background: var(--accent);
	color: var(--card);
	border-radius: var(--radius-button);
	padding: calc(var(--spacer) * 2) calc(var(--spacer) * 4);

	&.disabled {
		background: var(--text-muted);
		cursor: not-allowed;
	}
`;
```

No theme import. No `${({ theme }) => ...}`. The styled component reads pure CSS that happens to use variables.

### Theme variants (e.g., dark mode)

A different theme is a different scoped `:root` rule, toggled by class on `<html>`:

```css
:root.theme-dark {
	--surface: #0F0F0F;
	--card: #1A1A1A;
	--text-primary: #F0F0F0;
	/* ... only the tokens that change */
}
```

Switch with `document.documentElement.classList.toggle('theme-dark')` — no React state, no rerender of every styled component.

## Variants Pattern

For **stable visual variants** that are set at the call site and don't toggle at runtime (e.g., a badge's `status`, a button's `intent`), there are two acceptable shapes. Both use CSS variables for values.

### Class-based (preferred! — no prop interpolation)

The variants are CSS classes; the JSX selects which one is active via `className`. This exemplifies the SKILL.md rule directly.

```typescript
// In .styled.tsx
import styled from 'styled-components';

export const StatusBadge = styled.span`
	padding: 4px 8px;
	border-radius: 12px;
	font-size: 0.75rem;

	&.active {
		background: var(--success-light);
		color: var(--success);
	}
	&.pending {
		background: var(--warning-light);
		color: var(--warning);
	}
	&.inactive {
		background: var(--neutral-light);
		color: var(--neutral);
	}
`;
```

Usage in component JSX:
```typescript
<StatusBadge className={item.status}>{item.status}</StatusBadge>
```

### Prop-based (acceptable for typed variant APIs)

When you want the variant typed at the component boundary (e.g., to require `status` and reject typos), prop-based interpolation is fine. It's a documented exception to the "avoid prop-based" rule for *stable kind-of-thing* variants — never for runtime state.

```typescript
// In .styled.tsx
import styled, { css } from 'styled-components';

interface StatusBadgeProps {
	status: 'active' | 'inactive' | 'pending';
}

export const StatusBadge = styled.span<StatusBadgeProps>`
	padding: 4px 8px;
	border-radius: 12px;
	font-size: 0.75rem;

	${({ status }) =>
		status === 'active' &&
		css`
			background: var(--success-light);
			color: var(--success);
		`}

	${({ status }) =>
		status === 'pending' &&
		css`
			background: var(--warning-light);
			color: var(--warning);
		`}

	${({ status }) =>
		status === 'inactive' &&
		css`
			background: var(--neutral-light);
			color: var(--neutral);
		`}
`;
```

Usage:
```typescript
<StatusBadge status={item.status}>{item.status}</StatusBadge>
```

**When to prefer which:** start with class-based. Reach for prop-based only when you want the variant typed at the component's TypeScript boundary (e.g., a published component library where consumers need autocomplete on the variant prop).

## Organizing Large Styled Files

When a styled file grows beyond ~80 lines, group with comments:

```typescript
// ProductPage.styled.tsx

// ── Layout ─────────────────────────────────────────
export const ProductPageWrapper = styled.main`...`;
export const ProductPageContent = styled.div`...`;
export const ProductPageSidebar = styled.aside`...`;

// ── Product Header ──────────────────────────────────
export const ProductHeader = styled.header`...`;
export const ProductTitle = styled.h1`...`;
export const ProductSubtitle = styled.p`...`;

// ── Gallery ─────────────────────────────────────────
export const GalleryWrapper = styled.section`...`;
export const GalleryMainImage = styled.img`...`;
export const GalleryThumbnailRow = styled.div`...`;

// ── Actions ─────────────────────────────────────────
export const AddToCartButton = styled.button`...`;
export const WishlistButton = styled.button`...`;
```

If a styled file exceeds ~150 lines, split by section:
```
ProductPage/
├── ProductPage.tsx
├── ProductPage.styled.tsx       # Layout and header only
├── ProductGallery.styled.tsx    # Gallery section
└── ProductActions.styled.tsx    # Buttons and CTAs
```
