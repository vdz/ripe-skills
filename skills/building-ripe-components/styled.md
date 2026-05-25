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

Variants are CSS classes; the JSX picks which one applies via `className`. **No `$transient` props, ever** — even for variants you'd set once at the call site and never toggle.

### Canonical example: size + intent + density + state on one button

```typescript
// In .styled.tsx
export const Button = styled.button`
	border: 0;
	cursor: pointer;
	transition: opacity 80ms;

	/* Intent — what kind of button this is */
	&.primary   { background: var(--accent);  color: var(--card); }
	&.secondary { background: var(--neutral); color: var(--text-primary); }
	&.danger    { background: var(--error);   color: var(--card); }

	/* Size */
	&.size-sm { padding: 4px 10px;  font-size: 12px; }
	&.size-md { padding: 8px 16px;  font-size: 14px; }
	&.size-lg { padding: 12px 24px; font-size: 16px; }

	/* Density */
	&.dense { padding-block: 2px; }

	/* Runtime state — toggles after mount */
	&.disabled { opacity: 0.5; cursor: not-allowed; }
	&.loading  { opacity: 0.7; pointer-events: none; }
`;
```

```typescript
// In the component — cn() expanded one argument per line for readability
import cn from 'clsx';

<Button
	className={cn(
		'primary',
		`size-${size}`,
		dense && 'dense',
		isLoading && 'loading',
		isDisabled && 'disabled',
	)}
>
	{label}
</Button>
```

### Stable variant — same shape, no exception

A "stable" variant (set once, never toggled) gets the SAME className treatment as a runtime-toggled one. No special case for "this one doesn't change":

```typescript
// ✅ Even a one-shot wordmark variant is a className
export const Wordmark = styled.div`
	color: var(--text-primary);

	&.size-l   { font-size: 96px; }
	&.size-m   { font-size: 64px; }
	&.on-dark  { color: var(--card); }
`;
<Wordmark className={cn('size-l', 'on-dark')} />

// ❌ Don't do this — transient props for a "stable" variant
const Wordmark = styled.div<{ $size: number; $onDark: boolean }>`...`;
<Wordmark $size={96} $onDark />
```

### Why no transient props — even for stable variants

- **No recompilation per prop combination.** styled-components compiles a fresh stylesheet for every distinct combination of prop values. With classes, one stylesheet serves every combination of size × intent × state across thousands of buttons.
- **Cascade and specificity stay visible.** Class selectors play nicely with the cascade; devtools show which class is active and why a value won. Transient prop interpolations show as opaque hashes.
- **Variants are CSS, not props.** CSS already has the language for "this thing has multiple modes" — classes. Adding a prop layer reinvents the wheel.
- **Atomic primitives become possible.** A `<Button>` whose variants are CSS classes can ship in a shared library and stay theme-agile (consumers re-skin via CSS variables); a transient-prop `<Button>` is harder to skin without forking.

### Picking one cn() form per file

Use one shape per file. Don't mix `cn(...)`, template strings, and `[a, b].filter(Boolean).join(' ')` in the same component.

```typescript
// Conditional flags (multi-line for clarity once you have 3+ args)
<Card
	className={cn(
		active && 'active',
		hidden && 'hidden',
		featured && 'featured',
	)}
/>

// Variant from a value
<Badge className={cn(`tone-${tone}`)} />

// Combining with object shorthand
<Button
	className={cn(
		'primary',
		`size-${size}`,
		{ disabled, loading },
	)}
/>
```

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
