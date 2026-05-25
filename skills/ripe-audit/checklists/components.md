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

## COMPONENT-H-TRANSIENT-PROP — Styled component with transient prop

**Rule source:** building-ripe-components/SKILL.md → Styled Components ("Class-based styling, full stop"); styled.md → Variants Pattern
**Severity:** H
**Heuristics:**
```
rg -n 'styled\.\w+<\{[^}]*\$\w+' src/components       # generic on .styled with $-prop
rg -n 'styled\([^)]+\)<\{[^}]*\$\w+'  src/components  # styled(Wrapper) variant
rg -n '<\w+\s+\$\w+' src/components                    # call site with $-prop
```
**False positives:**
- None inside `src/components/`. Atomic primitives in a shared library MAY use transient props — but the project has no such library yet.
**Fix template:** Move the variant to a `className`. Styled component reads CSS that branches on classes. See styled.md → Variants Pattern.

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
**Fix template:** Move the state into the appropriate store branch. Common destinations: `current.editing`, `ui.popovers.<id>`, `ui.expandedRows[id]`.

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
- Inspect the parent's JSX:
  ```
  rg -nE '<\w+Card\s+\w+=\{[^}]+\}' src/components
  ```
**False positives:**
- Top-level page components legitimately receive the entity from a selector. The rule is about CHILD components receiving from parents.
**Fix template:** Change the prop to the entity ID (`shorthand: Demo['shorthand']`). Child does the selector lookup itself. Derived flags (e.g. `active`) come from selectors inside the child, not from the parent.

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
- All styled components are class-based (no transient props) → "OK — 0 transient props found across N styled components"
- All useEffect sites are legitimate → "OK — N/N useEffect sites accounted for (router bridge, DOM listeners only)"
- All useState sites are in atomic primitives (or there are zero useState sites) → "OK — no useState in non-atomic components"
