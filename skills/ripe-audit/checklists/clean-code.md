# Clean Code Checklist

Not Ripe-specific — these are general maintainability heuristics. All `L` severity by default (suggestions, not violations). Promote to `M` if widespread or actively hurting readability.

---

## CLEAN-L-FILE-SIZE — File exceeds line-count threshold

**Severity:** L
**Heuristics:**
```
find src -name '*.tsx' -o -name '*.ts' | xargs wc -l | awk '$1 > 200 {print $0}'
```
Thresholds (defaults; tune per project's CLAUDE.md if it sets stricter ones):
- `.tsx` components: > 150 lines → flag.
- `.styled.tsx`: > 200 lines → flag (consider splitting into multiple styled files per the existing skill guidance).
- `.listener.ts`: > 200 lines → flag.
- `.reducer.ts`: > 150 lines → flag (often a sign of too many actions, suggesting a branch split).
**Fix template:** Propose 2–3 split candidates per file, ranked by clarity gain. Do NOT split automatically.

---

## CLEAN-L-JSX-DEPTH — Deeply nested JSX in component return

**Severity:** L
**Heuristics:**
- Parse the JSX subtree depth in each component file. Flag if > 4 levels.
- A rough proxy: count contiguous opening tags `<X>\s*<Y>\s*<Z>...`. Hand-count is more reliable than regex here.
**Fix template:** Extract sub-trees into named child components. The owning component's return reads as 1–2 levels of named children.

---

## CLEAN-L-HELPER-COUNT — Many helpers in one component

**Severity:** L
**Heuristics:**
- Count `function ` declarations inside a component's body (between the `return` and the closing `}`).
- Flag if > 5 helpers — likely the component is doing too many things.
**Fix template:** Group helpers by concern; if multiple concerns surface, split the component. If all helpers serve one concern, that's fine — leave it.

---

## CLEAN-L-DEAD-STATE — State field set but never read

**Severity:** L
**Heuristics:**
- Find every field in every `interface XState`.
- For each field, grep for reads:
  ```
  rg "state\.X\.fieldName|select\w+.*fieldName" src/
  ```
- Flag fields with no reads outside the reducer that writes them.
**False positives:**
- Fields read only inside the reducer (other cases reference them) — these are working state, OK.
**Fix template:** Delete the field. If it's set in N reducer cases, delete those too. Update tests.

---

## CLEAN-L-DEAD-ACTION — Action defined but never dispatched

**Severity:** L
**Heuristics:**
- For each `createAction(...)` export, grep for `dispatch(actionName`:
  ```
  rg -n 'dispatch\(actionName\(' src/
  ```
- Flag actions with zero dispatch sites.
**Fix template:** Delete the action, its payload interface, and any reducer cases. Update tests.

---

## CLEAN-L-IMPORT-ALIAS — Relative import where `@` alias is available

**Severity:** L (drive-by)
**Heuristics:**
```
rg -n "from '\.\./\.\./\.\./" src/
```
**False positives:** Within a single folder tree (`../sibling.ts` is fine when the file is in the same component folder).
**Fix template:** Replace with `@/...` alias.

---

## OK — Sections to verify and report compliant

- All files within size thresholds → "OK — no file exceeds 150 lines"
- Zero dead state / dead actions → "OK — no orphan state fields or actions"
- All imports use the `@` alias where possible → "OK — no deep relative imports"
