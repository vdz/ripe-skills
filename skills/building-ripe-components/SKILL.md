---
name: building-ripe-components
description: Creates and modifies React components following The Ripe Method architecture. Use when creating new components, editing existing components, or adding UI features. Covers component anatomy, types, styled components, and file structure. For full features, pair with building-ripe-store for state and building-ripe-routing for navigation.
---

# Building Ripe Components

## File Structure

Every component is a folder:

```
components/
└── ProductCard/
	├── ProductInternals/     # (optional) Internal components
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
			<PriceTag>{formatDisplayPrice()}</PriceTag>
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
- Minimal props — components select their data from the store
- Setup: hooks and selectors only
- Early exit: guard clauses, loading/empty/error states
- Return: semantic styled components ONLY — no raw HTML tags
- Helpers: defined below the return statement
- No `useEffect` for hydration/API calls. DOM manipulation only when necessary.

### HELPERS Are Preferred — Module-Scope Only When Cross-Actor

The HELPERS section closes over the component's reactive state (`dispatch`, selectors, props). **Prefer HELPERS** — closure access keeps related logic next to the JSX, with no plumbing or prop-drilling.

Move a utility to module scope (above the component export) only if it's genuinely shared with **other actors** — another component, a listener, a test file. For single-use validators, formatters, or handlers that only fire from one component, HELPERS is the right home.

```typescript
// ✅ HELPERS — keep it next to its caller
export function NewDemoPanel() {
	const dispatch = useAppDispatch();
	const draft = useAppSelector(selectDraft);

	return (/* ... */);

	// ═══ HELPERS ═══
	function handleSave() {
		if (!isValidSlug(draft.shorthand)) {
			dispatch(showInlineError({ field: 'shorthand' }));
			return;
		}
		dispatch(saveDraft());
	}

	function isValidSlug(s: string) {
		return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(s);
	}
}

// ✅ Module-scope (or @/utils/) — only when shared with other actors
//    e.g. NewDemoPanel + EditDemoPanel + current.listener all need it
export function isValidSlug(s: string) { /* ... */ }
```

If a component grows too large, the answer isn't "extract more helpers to module scope" — it's **split the component**. The `ripe-audit` skill flags heavy components and proposes split points.

### Indentation

Tabs throughout — for `.tsx`, `.styled.tsx`, `.ts`. **Matches the ESLint rule (`indent: ["error", "tab"]`) enforced in the monorepo.** Configure your editor: tab width 4 is fine, but the character must be a tab.

## Types File

Derive from store types rather than duplicating:

```typescript
import type { Product } from '@/store/products/types';

export interface ProductCardProps {
	id: Product['id'];  // stays in sync automatically
}
```

## JSX Rules

**Only semantic styled components in return. No Tailwind, no shadcn/ui — all styling via styled-components.**

### The Return Statement Is a Document

The return must read like a **content document**. Names describe **WHAT** the content IS, not **HOW** it's built.

```typescript
// ❌ Wrong — implementation details
return (
	<FieldGroup>
		<FieldGroupLabel>Digital Tuner</FieldGroupLabel>
		<RadioGroup value={tunerValue} onChange={handleTunerChange}>
			<RadioItem value="yes" label="Yes" />
		</RadioGroup>
	</FieldGroup>
);

// ✅ Correct — semantic names
return (
	<DigitalTunerQuery>
		<Label>Digital Tuner</Label>
		<Answers value={tunerValue} onChange={handleTunerChange}>
			<Answer value="yes">Yes</Answer>
		</Answers>
	</DigitalTunerQuery>
);
```

### Two-Level Alias Pattern

Shared libs export mid-level names. Each component creates LOCAL aliases in `.styled.tsx`. The return only sees local aliases.

```
Level 1 — Shared library:    StepHeader, StepTitle, StepContent
Level 2 — .styled.tsx:       export const Header = styled(StepHeader)``;
Level 3 — Return statement:  <Header>  <Title>  <Content>
```

- **Per-field wrappers** (`DigitalTunerQuery`) — styled components extending a shared base, in `.styled.tsx`
- **Shared primitives** (`Label`, `Hint`, `Answers`, `Answer`) — wrap generic primitives, exported from barrels
- **Domain over implementation** — `AddToCart` not `PrimaryButton`, `Answers` not `RadioGroup`

### Inline Event Handlers

Short single-dispatch lambdas ARE fine in the return:

```typescript
// ✅ OK — declarative and clear
<NextButton onClick={() => {
	dispatch(flowDone())
}}>Next</NextButton>

// ❌ Unnecessary wrapper for trivial one-liner
function handleNext() { dispatch(flowDone()); }
```

Multi-line handlers should be extracted to SETUP.

### Other JSX Rules

- **Tooltips:** Use native `title` attribute, not a `<Tooltip>` wrapper
- **Visual separators:** CSS (`border-top`) on styled components, not `<Divider />` in JSX
- **Clickable elements:** Must have `cursor: pointer` in styled definition

### Every Interactive Element Must Dispatch (or Be Inert by Tag)

Every `<button>`, `<input>`, and `<a>` in JSX must either:
- have an `onClick` / `onChange` / `href`, OR
- be rendered as `<span>` / `<div>` if decorative.

A `<button>` with no handler typechecks, tests green, and lies to users: it looks interactive but does nothing. Treat every interactive element without a handler as a UI bug. If it's truly decorative, change the tag — decorative affordances must not LOOK interactive.

Grep heuristic for PR review:
```
grep -nE '<(button|input|a) [^>]*>' src/components | grep -v 'onClick\|onChange\|href'
```
flags candidates.

## Styled Components

Class-based styling, avoid prop-based. Runtime state (e.g., `disabled`, `active`, `selected`) goes on `className`; the styled component reads pure CSS that branches on that class.

```typescript
export const AddToCart = styled.button`
	background: var(--accent);
	&.disabled {
		background: var(--text-muted);
	}
`;
// Component uses: <AddToCart className={cn({ disabled: isOutOfStock })} />
```

Theme tokens are CSS custom properties defined in a global `theme.css` — see [styled.md](styled.md#theming-via-css-variables).

**Class-based styling, full stop.** No transient props (`$size`, `$active`, `$onDark`, etc.) — even for variants you'd set once at the call site. Use `className` for every variant: stable, runtime, anything. The styled component reads pure CSS that branches on classes. See [styled.md → Variants Pattern](styled.md#variants-pattern) for the canonical examples and the "why".

Names describe purpose: `ProductCardWrapper` not `Container`, `AddToCart` not `Button`.

## Composition Over Configuration

**UI structure lives in JSX, not in data.** Declare all children explicitly. Each child self-gates on state.

```typescript
// ✅ Correct — explicit composition
function Dashboard() {
	return (
		<DashboardLayout>
			<Header />
			<RevenuePanel />
			<OrdersPanel />
			<InventoryPanel />
		</DashboardLayout>
	);
}

// Each panel gates itself:
function OrdersPanel() {
	const visible = useAppSelector(selectOrdersPanelVisible);
	if (!visible) return null;
	// ...
}

// ❌ Wrong — config-driven rendering
const panels = [
	{ id: "revenue", component: RevenuePanel },
	{ id: "orders", component: OrdersPanel },
];
// ... panels.filter().map()
```

Use styled-component inheritance for shared visual patterns (`styled(Card)` in step's `.styled.tsx`).

## Clean Return Statement

No logic in JSX. Extract ternaries to helpers, compute `cn()` in SETUP:

```typescript
// ❌ Ternary in JSX
<StatusBadge>{isCompleted ? `${label} — done` : label}</StatusBadge>

// ✅ Helper below return
<StatusBadge>{renderLabel()}</StatusBadge>

// ═══ HELPERS ═══
function renderLabel() {
	if (isCompleted) return `${label} — done`;
	return label;
}
```

**Exception:** Simple `{value}` or `{label}` interpolations are fine.

## Object Literal Layout

Multi-property object literals get one property per line — unless the object fits trivially on a single line (1–2 short properties). This applies to inline configs, props on a styled component, and plain data objects in modules.

```typescript
// ✅ Single-line trivial
const range = { min: 0, max: 100 };

// ✅ One per line for non-trivial
const branches = {
	b1: { result: "Return to Customer", reason: "working, no fault" },
	b2: { result: "Book For Repair",     reason: "in-warranty + functional fault" },
	b3: { result: "Check Chargeable",    reason: "in-warranty + physical damage only" },
};

// ❌ Single-line dense — hard to scan
const branches = { b1: { result: "Return to Customer", reason: "working, no fault" }, b2: { result: "Book For Repair", reason: "in-warranty + functional fault" } };
```

## Component Behavior Rules

- **Passive and reactive** — reads state, dispatches actions, nothing else
- **Application logic lives in listeners.** Components dispatch intents; listeners own business decisions, side effects, and any resulting state/feedback (toasts, errors). Service modules (Native bridges, async persistence libraries, third-party SDKs) are exempt — their internals are blackboxes from the app's POV. See [building-ripe-store/listeners.md → Service Modules](../building-ripe-store/listeners.md#service-modules--exempt-from-all-logic-in-listeners).
- **No business logic** — no API calls, no complex decisions, no `useState`
- **Never trigger data loading** — data should already be in the store when rendering
- **Navigation is OK** — `useNavigate` for user actions, `useParams` for route params

## Workflow Checklist

```
- [ ] Create folder: components/ComponentName/
- [ ] ComponentName.tsx with SETUP → EARLY EXIT → RETURN → HELPERS
- [ ] ComponentName.styled.tsx with semantic names + two-level aliases
- [ ] types.ts derived from store types
- [ ] index.ts with single re-export
- [ ] Return reads as content document (no implementation primitives)
- [ ] No raw HTML, no ternaries, no inline cn() in return
- [ ] Styled components use classes, not props
- [ ] No useEffect for data loading
- [ ] File is ~100 lines or under
- [ ] Tests in __tests__/ subdirectory
```

**Import aliasing:** Use `@` for `src/` (e.g., `@/store/products/types`).

**For detailed patterns**: See [patterns.md](patterns.md)
**For styled naming conventions**: See [styled.md](styled.md)
**For routing**: See building-ripe-routing skill
