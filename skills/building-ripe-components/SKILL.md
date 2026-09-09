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
	├── types.ts              # Component-specific types (only when the component owns a type)
	├── __tests__/            # Behaviour tests
	└── index.ts              # Re-export only
```

`index.ts` contains only: `export { ProductCard } from './ProductCard';`

Grouping folders are allowed when a family of components reads as one: `components/diagnostics/<Check>/` for the device checks and the views they share (`CoverageRing` lives there — it reads check progress), `components/primitives/` for generic presentational atoms (`SkipControl`, `Countdown`, `InstructionCard`, `TrustedHtml`). Everything React lives under `components/` — never a second tree (`dtl/components`, `views/`) a reader has to know to search.

The uniform shape holds even for a one-file component: any component can grow styles, types, or tests without a restructure, and the pure re-export `index.ts` gives every component a stable public import path while its internals stay free to split. Collapsing "simple" components back to loose `.tsx` files breaks the navigate-any-project-blindfolded property the fixed structure buys.

## Component Anatomy

Every component follows this exact order:

```typescript
import type { ProductCardProps } from './types';

export function ProductCard({ productId }: ProductCardProps) {
	// ═══ SETUP ═══
	const product = useAppSelector((state) => state.products.byId[productId]);

	// ═══ EARLY EXIT ═══
	if (!product) return null;

	// ═══ RETURN ═══
	return (
		<ProductCardWrapper data-testid="product-card">
			<ProductName data-testid="product-card-name">{product.name}</ProductName>
			<PriceTag data-testid="product-card-price">{formatDisplayPrice()}</PriceTag>
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
- Minimal props — components select their data from the store. A child that takes an ID and selects the rest doesn't break when the entity shape changes and needs nothing pre-read by the parent — props collapse to identifiers.
- Setup: hooks and selectors only. A custom hook is a read of the store or of the router — one that touches `navigator.*`, `window.*` or a timer is a platform call in disguise and belongs to a listener through `store/<branch>/api/`.
- Derived values are helpers. A value computed from what SETUP read is a hoisted HELPERS-band function called from the return (or from SETUP, when the early exit needs it) — not an inline expression, not a `useMemo`.
- Early exit: guard clauses, loading/empty/error states
- Return: semantic styled components ONLY — no raw HTML tags
- Every semantic element in the return carries a `data-testid` — kebab-case, component-prefixed (see JSX Rules)
- Helpers: defined below the return statement
- No `useState`, and no `useEffect` for hydration/API calls. The one hook a screen may keep is a `useRef` + `useEffect` pair in a DOM-attach atom — see [patterns.md → the DOM-attach atom](patterns.md#the-dom-attach-atom--the-one-ref--effect).
- Copy comes from the locale (`text`), never a literal in the JSX — see [Copy Comes From the Locale](#copy-comes-from-the-locale).

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

**Every component-specific type or interface lives in the component's adjacent `types.ts` — NEVER declared inline in the `.tsx`.** This is unconditional. It holds for a lone `Props` interface with no store derivation, and even for a trivial one like `{ children: React.ReactNode }`. There is no size or shape exception: if it's a type the component owns, it goes in `types.ts`.

The `.tsx` then imports its props type:

```typescript
import type { ProductCardProps } from './types';
```

Deriving from store types (rather than duplicating) is just ONE case this file handles — it is NOT the condition that decides whether a `types.ts` exists. When a prop mirrors store state, derive it so it stays in sync automatically:

```typescript
// types.ts — store-derived
import type { Product } from '@/store/products/types';

export interface ProductCardProps {
	/** Identifies which product to render; the component selects the rest from the store. */
	id: Product['id'];  // stays in sync with the store type automatically
}
```

A purely-local props type — no store import at all — ALSO lives in `types.ts`, never inline:

```typescript
// types.ts — purely local, no store derivation
import type { ReactNode } from 'react';

export interface PanelLayoutProps {
	/** Content rendered inside the panel body. */
	children: ReactNode;
	/** Heading shown at the top of the panel. */
	title: string;
}
```

JSDoc every interface field — the monorepo requires it, with a unit suffix on any measured quantity.

Two questions decide which `types.ts` a type lives in, and whether the file exists at all:

- **Who would change this type?** If the answer is this component, it is in this component's `types.ts`. A type every step shares — the `{ flowId, step }` props contract — lives in the `types.ts` of the one component that defines the contract, and the other steps `extends` it:

  ```typescript
  // components/JourneyStep/types.ts — the one props contract every step shares
  export interface StepViewProps {
  	/** The flow this step belongs to. */
  	flowId: string;
  	/** This step's id. */
  	step: string;
  }

  // components/DtlTestStep/types.ts
  import type { ReactNode } from 'react';
  import type { StepViewProps } from '@/components/JourneyStep/types';

  export interface DtlTestStepProps extends StepViewProps {
  	/** The library screen that runs the check, rendered bare once the customer has tapped Start. */
  	children: ReactNode;
  }
  ```

- **Does the component own any type?** A component with no props and no owned type has no `types.ts`. Do not create an empty one to satisfy the folder shape.

### Nominal Types Are Classes

When a value must be distinguishable from every other value of its primitive — markup vetted for `dangerouslySetInnerHTML`, an id that must not be confused with another id — the type is a class with a private field, not a branded primitive:

```typescript
// components/primitives/TrustedHtml/TrustedHtmlSource.ts
export class TrustedHtmlSource {
	readonly #markup: string;

	constructor(markup: string) {
		this.#markup = markup;
	}

	/** The markup itself, for `dangerouslySetInnerHTML` and nothing else. */
	get markup(): string {
		return this.#markup;
	}
}
```

A branded string (`string & { __brand: 'TrustedHtml' }`) can only be constructed through an `as` cast, and client apps forbid `as`. A class is constructed by `new`, narrows by `instanceof`, and cannot be forged from a plain string anywhere in the codebase.

### Props Are Identity; Parameters Come From `config.ts`

A step component receives *who it is* — `{ flowId, step }` — and selects everything else. A timeout, a skip flag, a retry ceiling, a threshold is journey configuration: the listener reads it from `config.ts` (`resolveJourneyConfig`), or the component selects the store state the listener wrote from it. Nothing of that kind is threaded down as a prop, and a gate that applies to the whole journey ("may any check be skipped?") is one journey-config flag, not a per-step prop or a per-check sheet.

Primitives are the exception by design: `SkipControl` takes `offered`, `label`, `variant` because it has no identity of its own — the check that renders it selects the journey's skip flag and hands it in.

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

- **Tooltips:** Use native `title` attribute, not a `<Tooltip>` wrapper. A tooltip is presentation with no content or state of its own — a `<Tooltip>` component forces ephemeral open/closed state that Ripe would then have to model in the store, while native `title` is zero-JS and accessible for free. A real tooltip component is warranted only for rich content or controlled positioning, and that's a deliberate, owner-approved deviation.
- **Visual separators:** CSS (`border-top`) on styled components, not `<Divider />` in JSX. A divider is presentation, not content — a JSX node with no semantic meaning breaks "the return reads as a content document". The border belongs on the styled component it separates.
- **Clickable elements:** Must have `cursor: pointer` in styled definition — an affordance guarantee: anything that dispatches on click must look clickable, the inverse of "decorative elements must not look interactive".

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

### Every Semantic Element Carries a `data-testid`

Every semantic styled component in the return gets a `data-testid`, written inline in JSX at the use site. Naming is kebab-case, prefixed by the component's own name: the root wrapper carries the component name itself, children append their semantic name.

```typescript
return (
	<ProductCardWrapper data-testid="product-card">
		<ProductName data-testid="product-card-name">{product.name}</ProductName>
		<AddToCart data-testid="product-card-add-to-cart" onClick={() => {
			dispatch(addToCart({ productId }))
		}}>Add to cart</AddToCart>
	</ProductCardWrapper>
);
```

Why every element, not just interactive ones: testing automation asserts the *visibility* of display elements ("is the price shown once loading finishes?") as much as it needs stable handles to poke controls — and the cost is one attribute per element. The ids live inline in the JSX so they're visible exactly where the element is used, and the same styled component can carry different ids at different use sites. Because ids derive deterministically from names that already exist, a test can predict them without a registry.

### Styled Components: Attributes In, Tokens Out

**Variants are `data-*` attributes, and a styled file contains no interpolations.** No transient props (`$size`, `$active`, `$onDark`), and no `className` variants assembled with a `cn()` helper either. The component puts the variant on the element it styles as a data attribute; the styled component reads pure CSS that branches on that attribute:

```typescript
// SkipControl.styled.tsx
export const SkipButton = styled.button`
	pointer-events: auto;

	&[data-variant="quiet"],
	&[data-variant="link"] {
		padding: var(--space-8);
		color: var(--color-ink-muted);
		cursor: pointer;
	}

	&[data-variant="link"] {
		text-decoration: underline;
	}
`;

// SkipControl.tsx
<SkipButton type="button" data-variant={variant} onClick={onSkip}>{label}</SkipButton>
```

The attribute sits on the element whose style it changes — never on an ancestor with a descendant selector (`&[data-active] Child { … }`), which hides which element a variant belongs to. A continuous value (a percentage, a pixel count) crosses into the styled file as an inline `--_name` custom property typed by `LocalProperties`. Colours, spacing and type are `var(--token)` reads of `assets/styles/tokens.css`; a styled file never names a hex value or a pixel size the foundation already has a token for. See [styled.md](styled.md) for the token contract, the variant pattern and the local-property pattern.

Names describe purpose: `ProductCardWrapper` not `Container`, `AddToCart` not `Button`.

## Copy Comes From the Locale

No literal text under `src/components`. Every word a screen shows is a field of the typed locale resource in `assets/locales/<lang>.ts`, reached through the one `text` import; a template with values goes through `fill`:

```typescript
import { fill, text } from '@/assets/locales';

<ReviewTitle data-testid="offer-review-title">{text.offerReview.title}</ReviewTitle>
<ConfirmationText>{fill(text.confirmedCount, { count: cameraNumber, total: 2 })}</ConfirmationText>
```

The resource is shaped like i18next resources — nested objects, `{{name}}` placeholders — so adopting the library later is a swap of `text.x.y` for `t('x.y')`, not a rewrite. A `strings.ts` sitting next to a component is a finding: it is a second locale that no language switch reaches. The grep that keeps this honest, run before a commit:

```bash
rg -n '>[^<>{}]*[A-Za-z]{3,}[^<>{}]*<' src/components --glob '!**/__tests__/**'
```

Hits are literals to move, with two exceptions the audit grades L and notes rather than fails: an `aria-label` on a DOM-attach atom whose name no user reads (`aria-label="Camera preview"`), and non-language literals (units, a `·` separator). An accessible name a user can hear on a control they use — a copy button, a skip control — is copy, and reads from `text` like the rest (`aria-label={buttonName}`).

## One Primitive for a Repeated Control

A control that several screens render — a skip affordance, a countdown, an instruction card — is one component under `components/primitives/`, with a `data-variant` for the ways it sits among its neighbours. The tell is a screen-local `renderSkip()`/`renderRing()` helper that differs from its sibling on another screen only in the styled wrapper it picks. Four checks each rendering their own skip button is four places for the skip rule to drift; `SkipControl` renders nothing unless `offered`, so a required check cannot be bypassed from any screen, and the host decides what a skip means:

```typescript
export function SkipControl({ offered, label, accessibleName, variant = "quiet", onSkip }: SkipControlProps) {
	// ═══ SETUP ═══
	const buttonName = accessibleName ?? label;

	// ═══ EARLY EXIT ═══
	if (!offered) {
		return null;
	}

	// ═══ RETURN ═══
	return (
		<SkipButton type="button" data-variant={variant} title={buttonName} aria-label={buttonName} onClick={onSkip}>
			{label}
		</SkipButton>
	);
}
```

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

**Why explicit wins:** the return *is* the page map — explicit children are statically greppable, and each child self-gates on state, so the page's structure is readable in one file. A config array moves structure into data the reader must execute in their head; "what renders here?" stops having a greppable answer.

**Exceptions are rare and always approval-gated.** Config-driven rendering is never the default; each use needs explicit engineer sign-off:
- A family of very similar components that render together, where grouping and automating their rendering makes the composition *easier* to understand than listing them out.
- An A/B-testing mechanism, where which variant renders is runtime data by nature.

If you think you've hit one of these, ask — don't decide alone.

### The JSX Is the Step List; a Host Takes Its Screen as `children`

In a flow, the routed journey's return *is* the step order. A host that stages a screen in beats — an explainer, then the check itself — takes that screen as `children`, declared by the journey right where the step is listed:

```typescript
// AssessmentJourney.tsx — read top to bottom, this is the journey
<FlowHost flowId={ASSESSMENT_FLOW_ID}>
	<LandingStep flowId={ASSESSMENT_FLOW_ID} step={STEP.landing} />
	<DtlTestStep flowId={ASSESSMENT_FLOW_ID} step={STEP.touchscreen}>
		<Touchscreen flowId={ASSESSMENT_FLOW_ID} step={STEP.touchscreen} />
	</DtlTestStep>
	<DtlTestStep flowId={ASSESSMENT_FLOW_ID} step={STEP.buttons}>
		<PhysicalButtons flowId={ASSESSMENT_FLOW_ID} step={STEP.buttons} />
	</DtlTestStep>
	<OfferReviewStep flowId={ASSESSMENT_FLOW_ID} step={STEP.offerReview} />
</FlowHost>

// DtlTestStep.tsx — the host renders its children bare once the check is live
export function DtlTestStep({ flowId, step, children }: DtlTestStepProps) {
	// ═══ SETUP ═══
	const { isActive } = useFlowStep(flowId, step);
	const phase = useAppSelector((state) => selectPhase(state, step));

	// ═══ EARLY EXIT ═══
	if (!isActive) {
		return null;
	}

	// ═══ RETURN ═══
	if (phase === "active") {
		return <TestSurface>{children}</TestSurface>;
	}

	return <TestExplainer step={step} />;
}
```

Two shapes this replaces, both findings: a `Record<string, (props: StepProps) => ReactElement>` registry keyed by step id, which is the config array again with functions for values; and a host that renders its own frame *over* the library screen, which clips a check that owns the viewport and misplaces taps judged by coordinate. The host wraps; the journey lists.

Use styled-component inheritance for shared visual patterns (`styled(Card)` in step's `.styled.tsx`).

## Clean Return Statement

No logic in JSX. Extract ternaries to helpers; compute a variant's `data-*` value in SETUP:

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

A formatting rule, not an architectural constraint. Multi-property object literals get one property per line — unless the object fits trivially on a single line (1–2 short properties). This applies to inline configs, props on a styled component, and plain data objects in modules. One property per line also means one changed property per diff line, which keeps reviews clean.

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
- **Nothing a component shows is component state.** A check's phase, a countdown, a live progress record, an open disclosure, a step's draft answer — each is store state a listener wrote or `useFlowStep(flowId, step).data` the step set through `setData`. A `REVISIT` or "UI-only" comment does not license a `useState`; see [patterns.md → No `useState`](patterns.md#no-usestate--reflect-everything-in-the-store).
- **Application logic lives in listeners.** Components dispatch intents; listeners own business decisions, side effects, and any resulting state/feedback (toasts, errors). Service modules (Native bridges, async persistence libraries, third-party SDKs) are exempt — their internals are blackboxes from the app's POV. See [building-ripe-store/listeners.md → Service Modules](../building-ripe-store/listeners.md#service-modules--exempt-from-all-logic-in-listeners).
- **No business logic** — no API calls, no complex decisions, no `useState`
- **Never trigger data loading** — data should already be in the store when rendering
- **Navigation is OK** — `useNavigate` for user actions, `useParams` for route params

## Workflow Checklist

```
- [ ] Create folder: components/ComponentName/
- [ ] ComponentName.tsx with SETUP → EARLY EXIT → RETURN → HELPERS
- [ ] ComponentName.styled.tsx with semantic names + two-level aliases
- [ ] types.ts when the component owns a type (derive from store types; step props extend the shared contract)
- [ ] index.ts with single re-export
- [ ] Return reads as content document (no implementation primitives)
- [ ] Every semantic element has a `data-testid` (kebab-case, component-prefixed)
- [ ] No raw HTML, no ternaries, no className assembly in return
- [ ] Variants are `data-*` attributes on the element they style; no `${` in the .styled.tsx; values are `var(--token)` or `var(--_local)`
- [ ] Copy is `text.*` from the locale — no literal text in the JSX
- [ ] No useState; no useEffect for data loading (a DOM-attach atom is the one ref + effect)
- [ ] Journey parameters (timeouts, skip flags) come from config.ts via the store, not props
- [ ] File is ~100 lines or under (over = a second responsibility crept in — split it out, don't trim)
- [ ] Tests in __tests__/ subdirectory
- [ ] Root lint passes (`pnpm run lint` from the repo root, not only the app's) before the commit
```

**Import aliasing:** Use `@` for `src/` (e.g., `@/store/products/types`, `@/assets/locales`).

**For detailed patterns**: See [patterns.md](patterns.md)
**For styled naming conventions**: See [styled.md](styled.md)
**For routing**: See building-ripe-routing skill
**For tests**: See `building-ripe-tests` skill (→ component-tests.md)
