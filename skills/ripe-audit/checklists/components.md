# Components Checklist — against `building-ripe-components`

Each check has:
- Rule source (link to the skill section)
- Severity if violated
- Heuristics / greps
- Known false positives
- Fix template (one sentence + a link to the worked example in the skill)

---

## COMPONENT-H-NO-HANDLER — Interactive element without dispatch

**Rule source:** building-ripe-components/SKILL.md → "Every Interactive Element Must Dispatch (or Be Inert by Tag)"
**Severity:** H
**Heuristics:**
```
rg -nE '<(button|input|a)\b[^>]*>' src/components | rg -v 'onClick|onChange|href|disabled='
```
**False positives:**
- Decorative tags inside e.g. a tooltip primitive — flag only if the tag visually presents as interactive (has `cursor: pointer`, hover state, etc.).
- `<input type="hidden">` — not user-interactive.
**Fix template:** Add the appropriate handler, OR change the tag to `<span>` / `<div>` if decorative.

---

## COMPONENT-H-TRANSIENT-PROP — Variant expressed as a prop, a class string, or an ancestor selector

**Rule source:** building-ripe-components/SKILL.md → "Styled Components: Attributes In, Tokens Out"; styled.md → "Variants Are `data-*` Attributes"
**Severity:** H
**Heuristics:**
```
rg -n 'styled\.\w+<\{[^}]*\$\w+' src/components       # generic on .styled with $-prop
rg -n 'styled\([^)]+\)<\{[^}]*\$\w+'  src/components  # styled(Wrapper) variant
rg -n '<\w+\s+\$\w+' src/components                    # call site with $-prop
rg -n 'className=\{(cn|clsx|classNames)\(' src/components   # className assembly — a class-string variant vocabulary
rg -n '&\.[a-z-]+\s*\{' src/components --glob '*.styled.tsx'  # class-branching selectors in a styled file
rg -n '\[data-[a-z-]+(="[^"]*")?\]\s+[A-Za-z&.]' src/components --glob '*.styled.tsx'  # attribute on an ancestor, styling a descendant
```
**False positives:**
- None inside `src/components/`. A `className` that carries only the theme class on the App root (`theme-<name>`) is not a variant.
- An attribute selector followed by a pseudo-element (`&[data-variant="link"]::after`) is the same element, not a descendant.
**Fix template:** Put the variant on the element it styles as a `data-*` attribute (`<SkipButton data-variant={variant}>`); the styled component branches with `&[data-variant="link"] { … }`. A continuous value crosses as an inline `--_name` property typed by `LocalProperties`. See styled.md.

---

## COMPONENT-H-STYLED-INTERPOLATION — `${` in a `.styled.tsx`

**Rule source:** building-ripe-components/styled.md → "No Interpolations in a Styled File"
**Severity:** H
**Heuristics:**
```
rg -n '\$\{' src/components --glob '*.styled.tsx'
rg -n 'ThemeProvider|\(\{\s*theme\s*\}\)' src
```
**False positives:** none. `styled(Base)` inheritance and `css` helpers with no `${` are fine; the check is the interpolation.
**Fix template:** A finite variant → `data-*` attribute selector. A continuous value → inline `--_name` custom property. A colour, size or font → `var(--token)` from `assets/styles/tokens.css`. A theme value → a token the theme overlay redeclares, never a JS theme object.

---

## COMPONENT-M-LITERAL-TEXT — Copy written in a component instead of the locale

**Rule source:** building-ripe-components/SKILL.md → "Copy Comes From the Locale"
**Severity:** M (H when a sibling `strings.ts` exists — a second locale)
**Heuristics:**
```
rg -n '>[^<>{}]*[A-Za-z]{3,}[^<>{}]*<' src/components --glob '!**/__tests__/**'
rg -n '(title|aria-label|placeholder|alt)="[A-Za-z]' src/components --glob '!**/__tests__/**'
find src/components -name 'strings.ts' -o -name 'copy.ts' -o -name 'labels.ts'
```
**False positives:**
- `aria-label` on a DOM-attach atom whose name is not user-visible copy (`aria-label="Camera preview"`) — note it, grade L.
- Non-language literals: units, punctuation, a `·` separator.
**Fix template:** Add the field to `assets/locales/<lang>.ts` (typed by `Strings`), read it through `text.<screen>.<field>`; templates go through `fill(text.x, { values })`. Delete the sibling `strings.ts`.

---

## COMPONENT-M-RENDER-REGISTRY — Steps composed through a record of render functions, or a host rendering over its screen

**Rule source:** building-ripe-components/SKILL.md → "The JSX Is the Step List; a Host Takes Its Screen as `children`"
**Severity:** M
**Heuristics:**
```
rg -nU 'Record<\s*\w+,\s*\(?[^>]*\)?\s*=>\s*(JSX\.Element|ReactElement|ReactNode)' src/components
rg -n '\[step\]\(|\[stepId\]\(|registry\[' src/components
rg -n 'children' src/components/*/types.ts src/components/**/types.ts
```
For any host (a component that stages a check or step), READ its return: does it render the library screen it wraps as `{children}`, bare, or does it draw its own frame around/over it?
**False positives:**
- A `Record<CheckId, string>` of copy keys or asset paths — data, not render functions.
- A host whose frame is the explainer beat shown *instead of* the screen, not around it (`DtlTestStep`).
**Fix template:** List the steps in the journey's JSX; the host takes the screen as `children` and renders it bare once the step is live.

---

## COMPONENT-M-PARAM-PROP — Journey parameter threaded as a prop

**Rule source:** building-ripe-components/SKILL.md → "Props Are Identity; Parameters Come From the Branch's Defaults"
**Severity:** M
**Heuristics:**
```
rg -n '(timeoutMs|allowSkip|allowTestSkip|maxAttempts|threshold)\??:' src/components/**/types.ts
rg -n '<\w+Step\b[^>]*\b(timeout|allowSkip|max)\w*=' src/components
```
**False positives:**
- A primitive (`SkipControl { offered }`) — it has no identity of its own; its host selects the flag and hands it in.
**Fix template:** Declare the parameter on the check's record in the diagnostics reducer's `initialState` (or as a branch knob beside `checks`, like `sharedTimeoutMs`/`allowTestSkip`); the listener reads it through `getState()` and writes the outcome to the store; the step component receives `{ flowId, step }` and selects it with `select<Check>Params(state, step)` / `selectAllowTestSkip`.

---

## COMPONENT-M-USESTATE — useState in a non-atomic component

**Rule source:** building-ripe-components/patterns.md → "No `useState` — Reflect Everything in the Store"
**Severity:** M (H if it shadows app-visible state)
**Heuristics:**
```
rg -nE '\buseState\b' src/components
```
**False positives:**
- Atomic primitives in a shared library. (Currently the project has none — every hit is a finding.)
- Nothing else. A justifying comment at the site (`REVISIT`, `UI-only`, "hardware loop", "presentation only") does not exempt it: hardware loops run in listeners over `store/<branch>/api/` and write a `progress` record; windows are the check's `clock`; disclosures are `ui.openPanel`. The one hook a screen may keep is a `useRef` + `useEffect` in a DOM-attach atom (a `<video>` taking the open stream), and that atom holds no `useState` either.
**Fix template:** Move the state into the appropriate store branch. Common destinations: the step's data bag (`setStepData`) for a journey draft, a `ui` branch field for chrome state (an open sheet, the theme), a check's `progress` / `clock` for what the hardware loop produces.

---

## COMPONENT-M-FAT-CHILD-PROP — Child takes entity object instead of ID

**Rule source:** building-ripe-store/action-payloads.md → "Pass the Minimum"
**Severity:** M
**Heuristics:**
- Inspect every component's `Props` interface (in `types.ts` files):
  ```
  rg -n 'interface \w+Props' src/components -A 6
  ```
  Flag any prop typed as a full entity (`Demo`, `Product`, `Order`, etc.).
  Note: props interfaces must live in `types.ts`, not inline in the `.tsx` — see COMPONENT-M-INLINE-TYPE below.
- Inspect the parent's JSX:
  ```
  rg -nE '<\w+Card\s+\w+=\{[^}]+\}' src/components
  ```
**False positives:**
- Top-level page components legitimately receive the entity from a selector. The rule is about CHILD components receiving from parents.
**Fix template:** Change the prop to the entity ID (`shorthand: Demo['shorthand']`). Child does the selector lookup itself. Derived flags (e.g. `active`) come from selectors inside the child, not from the parent.

---

## COMPONENT-M-INLINE-TYPE — Component-specific type declared inline in `.tsx`

**Rule source:** building-ripe-components/SKILL.md → Types File ("Every component-specific type or interface lives in the component's adjacent `types.ts` — NEVER declared inline in the `.tsx`")
**Severity:** M
**Heuristics:**
```
rg -n '^(export )?(interface|type) ' -g '*.tsx' src/components | rg -v 'styled|__tests__'
```
flags components that declare a type or interface (e.g. `...Props`) inline in the `.tsx` instead of in the adjacent `types.ts`. This holds even for a lone `Props` interface with no store derivation, or a trivial `{ children: React.ReactNode }`.
**False positives:**
- `.styled.tsx` files (already excluded above) — transient/style helper types may live next to their styled component.
- Test files under `__tests__/` (already excluded above).
**Fix template:** Move the type to the component's adjacent `types.ts` and import it (`import type { ProductCardProps } from './types';`). JSDoc every field on the way.

---

## COMPONENT-M-USEEFFECT-FETCH — useEffect that fetches data

**Rule source:** building-ripe-components/SKILL.md cardinal rule "No useEffect for hydration/API calls"
**Severity:** M (H if widespread)
**Heuristics:**
```
rg -nU 'useEffect\([^)]+\)\s*=>\s*\{[^}]*(fetch|dispatch\(.*[Ff]etch|api\.|await)' src/components
```
**False positives:**
- The router→store bridge `useEffect` in `App.tsx` (single legitimate site).
- DOM event listener registration (`window.addEventListener` cleanups).
- `useEffect` that focuses a DOM ref imperatively.
**Fix template:** Move the fetch trigger into a listener that reacts to `setLocation` / app init / auth event. Component reads the result.

---

## COMPONENT-L-HEAVY — Component file exceeds maintainability threshold

**Rule source:** building-ripe-components/SKILL.md → "HELPERS Are Preferred — Module-Scope Only When Cross-Actor" ("split the component" guidance)
**Severity:** L (suggestion, not violation)
**Heuristics:**
- `wc -l` on every `.tsx` in `src/components/`; flag files > 150 lines.
- Count `function ` declarations inside the component body; flag if > 5.
- Count JSX nesting depth in the return; flag if > 4.
**False positives:**
- A component whose length is dominated by a long static config (e.g. a form schema literal) — flag the schema for extraction, not the whole component.
**Fix template:** Read the component. Identify natural split points by JSX subtree, by HELPERS group, or by domain boundary. Propose 2–3 candidate splits ranked by clarity gain. **Do NOT split automatically** — present options for the project owner.

---

## COMPONENT-L-RAW-HTML — Raw HTML tag in JSX return

**Rule source:** building-ripe-components/SKILL.md → JSX Rules ("Only semantic styled components in return. No raw HTML.")
**Severity:** L (drive-by fix)
**Heuristics:**
```
rg -nE '<(div|span|p|h[1-6]|ul|li|section|article|header|footer)\b' src/components
```
**False positives:**
- `<div>` / `<span>` used intentionally as inert containers per the COMPONENT-H-NO-HANDLER fix.
- Wordmark-style components where the raw tags are visual scaffolding internal to the component.
**Fix template:** Add a named styled component in the same `.styled.tsx`. The JSX should read as a content document.

---

## OK — Sections to verify and report compliant

When the above checks find no violations in code that COULD have had them, record an OK finding:

- All children take IDs (no entity-object props) → "OK — N/N child components take IDs"
- All variants are `data-*` attributes and no styled file interpolates → "OK — 0 transient props, 0 className variants, 0 `${` across N styled files"
- All copy comes from the locale → "OK — 0 literals in src/components, no sibling strings files"
- Every host takes its screen as children; the journey JSX is the step list → "OK — no render registries"
- All useEffect sites are legitimate → "OK — N/N useEffect sites accounted for (router bridge, DOM-attach atoms only)"
- No useState anywhere in `src/components` → "OK — 0 useState sites"
