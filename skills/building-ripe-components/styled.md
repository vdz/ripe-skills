# Styled Components Reference

## Contents
- File structure and imports
- Naming conventions
- Theme usage
- Variants pattern
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

## Theme Usage

```typescript
export const PrimaryButton = styled.button`
  background: ${({ theme }) => theme.colors.primary};
  color: ${({ theme }) => theme.colors.onPrimary};
  border-radius: ${({ theme }) => theme.radius.md};
  padding: ${({ theme }) => theme.spacing[2]} ${({ theme }) => theme.spacing[4]};

  &:hover {
    background: ${({ theme }) => theme.colors.primaryHover};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;
```

## Variants Pattern

Use props for visual variants — keeps the component JSX clean:

```typescript
// In .styled.tsx
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
      background: ${({ theme }) => theme.colors.successLight};
      color: ${({ theme }) => theme.colors.success};
    `}

  ${({ status }) =>
    status === 'pending' &&
    css`
      background: ${({ theme }) => theme.colors.warningLight};
      color: ${({ theme }) => theme.colors.warning};
    `}

  ${({ status }) =>
    status === 'inactive' &&
    css`
      background: ${({ theme }) => theme.colors.neutralLight};
      color: ${({ theme }) => theme.colors.neutral};
    `}
`;
```

Usage in component JSX:
```typescript
<StatusBadge status={item.status}>{item.status}</StatusBadge>
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
