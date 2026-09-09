# Styled Components Reference

## When to read this
- Creating or extending a `.styled.tsx` file
- Naming styled components (semantic `[Component][Role]` names)
- Adding a design token, a client overlay or a theme
- Adding a size/intent/state variant, or passing a computed value into CSS
- A styled file has grown large and needs organising

## Contents
- File structure and imports
- Naming conventions
- Design tokens: `tokens.css`, the layer order, `GlobalStyle`, the theme class
- Variants are `data-*` attributes
- Continuous values are `--_` local properties
- No interpolations in a styled file
- Organizing large styled files

## File Structure and Imports

```typescript
// ProductCard.styled.tsx
import styled from 'styled-components';

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

## Design Tokens: `tokens.css`, the Layer Order, `GlobalStyle`, the Theme Class

Design tokens are CSS custom properties. Styled components read them with `var(--token)`. There is no JS theme object, no `ThemeProvider`, no `${({ theme }) => …}` — CSS variables sidestep the prop-interpolation problem entirely and show up in DevTools by name.

### `assets/styles/tokens.css` is the foundation

One file declares every token with its default value, on `:root`, inside the `tokens` layer. Two tiers: the design's published Figma variables first, under the names Figma gives them, then the semantic roles components consume, each an alias onto a primitive. **A component never names a colour; it names a role.**

```css
/* assets/styles/tokens.css — the first rule in the file, and the only place the order is declared */
@layer reset, tokens, base, client, theme;

@layer tokens {
	:root {
		/* ── Figma variables ── */
		--primary-pearl-white: #f5f3ed;
		--primary-black: #030015;
		--primary-blue-500: #4040e8;
		--greys-grey-500: #888888;

		/* ── Semantic roles ── */
		--color-background: var(--primary-pearl-white);
		--color-ink: var(--primary-black);
		--color-ink-muted: var(--greys-grey-500);
		--color-accent: var(--primary-blue-500);
		--space-8: 8px;
		--text-16: 16px;
	}
}
```

Why the order statement lives here and not in `GlobalStyle`: a layer's position is fixed by the first stylesheet that names it, and Vite parses this file before styled-components injects anything. `GlobalStyle` imports `tokens.css` first, so the statement is always the first rule parsed.

### `components/GlobalStyle` is the single entry point

A `createGlobalStyle` component that imports every style file as a side effect (`tokens.css` first) and declares the reset and the base element rules, each in its layer. Rendered once, under the `Provider`, above the App root:

```typescript
// components/GlobalStyle/GlobalStyle.tsx
import { createGlobalStyle } from 'styled-components';
import '@/assets/styles/tokens.css';

export const GlobalStyle = createGlobalStyle`
	@layer reset {
		*, *::before, *::after { box-sizing: border-box; }
		* { margin: 0; }
		html, body, #root { height: 100%; }
		body { overscroll-behavior: none; touch-action: manipulation; }
		img, picture, video, canvas, svg { display: block; max-width: 100%; }
		input, button, textarea, select { font: inherit; }
		p, h1, h2, h3 { overflow-wrap: break-word; }
		h1, h2, h3 { text-wrap: balance; }
		#root { isolation: isolate; }
	}

	@layer base {
		body { font-family: var(--font-body); }
	}
`;
```

The reset is the modern one (Josh Comeau's), declared once, in the `reset` layer, and no universal rule beyond `box-sizing` and `margin`. Two lines are the app's, with a comment saying why in the real file: `overscroll-behavior: none` because the app owns the viewport in a WebView, and `touch-action: manipulation` because checks judge taps by coordinate and a double-tap zoom would move the target under the finger.

The layers read bottom-up as "who wins": a `theme` file adjusts what the `client` file set, the client adjusts the foundation, `base` and `reset` sit under all of it — and styled-components output is unlayered, so a component beats every layer without a specificity fight.

### Client and theme overlays only redeclare

Two overlay axes, each a file that joins the `GlobalStyle` imports the day it exists:

- `assets/styles/clients/<name>.css` — the `client` layer, fixed for the life of the app.
- `assets/styles/themes/<name>.css` — the `theme` layer, hung off `.theme-<name>` on the App root, switchable at runtime.

Both **may only redeclare tokens the foundation declares**. An invented token in an overlay is a declaration no component reads. The token-contract test (`assets/styles/__tests__/tokens.test.ts`) fails the build on: an undeclared token referenced anywhere in `src`, a layer order statement anywhere but the top of `tokens.css`, `GlobalStyle` importing another stylesheet before `tokens.css`, and an overlay declaring a token the foundation lacks.

### The theme is store state, rendered as a class on the App root

```typescript
// store/ui/types.ts
export interface UiState {
	/** The theme in force, rendered as `theme-<name>` on the App root. */
	theme: ThemeName;
	/** Which panel is open, or null when none is. */
	openPanel: OpenPanel | null;
}

// store/ui/ui.selectors.ts
export const selectThemeClassName = (state: RootState): string => `theme-${state.ui.theme}`;

// App.tsx
<Root className={themeClassName}>…</Root>

// App.styled.tsx — the root owns the ground and ink; body carries none
export const Root = styled.div`
	height: 100%;
	overflow-y: auto;
	background: var(--color-background);
	color: var(--color-ink);
`;
```

Switching a theme is `dispatch(themeChanged({ theme }))`. No `document.documentElement.classList.toggle`, no `<html>` mutation from a component: the class is a projection of store state, so it is in devtools, in tests and in a persisted snapshot like everything else.

### Using tokens in styled components

```typescript
// CoverageRing.styled.tsx — `--_size` is a local property the JSX sets through `LocalProperties`
export const Ring = styled.svg`
	width: var(--_size);
	height: var(--_size);
`;

/** The faded full circle the progress arc travels over: the ring's own colour, at under a quarter strength. */
export const Track = styled.circle`
	fill: none;
	stroke: var(--color-accent);
	opacity: 0.24;
`;

export const Travelled = styled.circle`
	fill: none;
	stroke: var(--color-accent);
	stroke-linecap: round;
`;
```

No theme import. No interpolation. Pure CSS that happens to use variables.

## Variants Are `data-*` Attributes

A variant — size, intent, density, runtime state — is a `data-*` attribute on the element it styles. The JSX sets it; the styled component branches on it with an attribute selector. **No transient props, and no `className` assembly with a `cn()` helper either** — a class string built at render is a second variant vocabulary the styled file has to be read alongside.

```typescript
// In .styled.tsx
export const ActionButton = styled.button`
	border: 0;
	cursor: pointer;
	transition: opacity 80ms;

	/* Intent */
	&[data-intent="primary"]   { background: var(--color-action);  color: var(--color-on-action); }
	&[data-intent="secondary"] { background: var(--color-surface); color: var(--color-ink); }
	&[data-intent="danger"]    { background: var(--color-fail);    color: var(--color-surface); }

	/* Size */
	&[data-size="sm"] { padding: var(--space-8) var(--space-12); font-size: var(--text-12); }
	&[data-size="md"] { padding: var(--space-8) var(--space-16); font-size: var(--text-14); }

	/* Runtime state — flips after mount */
	&[data-loading="true"] { opacity: 0.7; pointer-events: none; }
	&:disabled { opacity: 0.5; cursor: not-allowed; }
`;

// In the component — a value per attribute, read straight off props or a selector
<ActionButton data-intent={intent} data-size={size} data-loading={isLoading} disabled={isDisabled}>
	{label}
</ActionButton>
```

Rules that keep this honest:

- **The attribute is on the element it styles.** `&[data-variant="link"]` on the button, not `&[data-variant="link"] button` on a wrapper. An ancestor selector hides which element the variant belongs to and lets two children disagree about it.
- **Boolean state is an attribute with a value.** React renders `data-loading={true}` as `data-loading="true"`; match on the value. Where a native state exists (`disabled`, `:checked`, `[aria-pressed="true"]`), use it — the accessibility tree and the styling then cannot disagree.
- **A stable variant gets the same treatment.** A wordmark that is always large and always on dark is `<Wordmark data-size="l" data-on-dark="true" />`; there is no "set once" exception that reintroduces a prop.
- **The attribute vocabulary is typed in `types.ts`** (`SkipVariant = "quiet" | "link" | "plain"`), so a misspelt variant fails the build rather than silently unstyling.

## Continuous Values Are `--_` Local Properties

A variant has a finite vocabulary. A percentage, a pixel count, a column count does not — and it still must not become an interpolation. It crosses into the styled file as an inline custom property whose name starts with `--_`, typed by `LocalProperties`:

```typescript
// assets/styles/localProperties.ts
import type { CSSProperties } from 'react';

export type LocalProperties = CSSProperties & {
	[name: `--_${string}`]: string;
};

// OfferReviewStep.tsx
const potentialStyle: LocalProperties = { "--_percent": `${potentialFraction * 100}%` };
<PotentialFill style={potentialStyle} />

// OfferReviewStep.styled.tsx — reads its extent from the property the component sets inline
export const PotentialFill = styled.span`
	display: block;
	height: 100%;
	width: clamp(0%, var(--_percent), 100%);
	background: var(--color-emphasis);
`;
```

The underscore marks the property as the component's own, not a design token: the token-contract test skips `--_` names when checking the foundation and instead checks that whatever a styled file reads, some component sets. One inline style object per element, built in SETUP, never an object literal in the JSX.

## No Interpolations in a Styled File

The two patterns above are the whole reason a `.styled.tsx` never needs `${`. Grep before a commit:

```bash
rg -n '\$\{' src/components --glob '*.styled.tsx'
```

Zero hits is the bar. Why:

- **One stylesheet, every combination.** styled-components compiles a fresh class for every distinct interpolation result. Attribute selectors and custom properties are one stylesheet serving every size × intent × state across thousands of elements.
- **The cascade stays visible.** DevTools show the attribute rule that won and the custom property it resolved; an interpolation shows as an opaque hash.
- **The styled file is readable alone.** Every branch a component can be in is a selector in the file, not a function of props the reader must evaluate.
- **Skinning is CSS.** A primitive whose variants are attributes and whose values are tokens ships in a shared library and re-skins through an overlay file, without a fork.

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
