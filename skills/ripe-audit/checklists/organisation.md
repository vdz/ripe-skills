# Organisation Checklist

Folder structure, file naming, test locations, alias usage. Mostly `L` severity (cleanups) unless the deviation is project-wide (then `M`).

---

## ORG-M-BRANCH-FILE-LAYOUT — Branch folder doesn't match the Ripe layout

**Rule source:** building-ripe-store/SKILL.md → "Branch File Structure"
**Severity:** M
**Heuristics:** for each `src/store/<branch>/` folder, verify presence of:
- `types.ts`
- `<branch>.actions.ts`
- `<branch>.reducer.ts`
- `<branch>.listener.ts` (if the branch has effects)
- `api/<verb><Branch>.ts` files (if the branch fetches)
- `__tests__/` folder containing the reducer + listener tests
**False positives:**
- A branch with no listeners (read-only computed branch) legitimately lacks `<branch>.listener.ts`.
- A branch with no API calls legitimately lacks `api/`.
**Fix template:** Rename / move files to match the canonical layout. Update imports.

---

## ORG-M-TEST-COLOCATION — Tests not in `__tests__/`

**Rule source:** building-ripe-store/SKILL.md → "Tests live in `__tests__/` — never alongside source files."
**Severity:** M
**Heuristics:**
```
find src -name '*.test.ts' -o -name '*.test.tsx' | rg -v '__tests__'
```
**False positives:** None — Ripe tests always live in `__tests__/` subfolders.
**Fix template:** Move test files into `__tests__/`. Update `import '../...'` paths.

---

## ORG-L-COMPONENT-FOLDER — Component not in its own folder

**Rule source:** building-ripe-components/SKILL.md → "Every component is a folder"
**Severity:** L
**Heuristics:**
- Find loose `.tsx` files at `src/components/*.tsx` (vs `src/components/<Name>/<Name>.tsx`).
- Flag each.
**False positives:**
- `src/components/index.ts` — barrel export, fine.
**Fix template:** Create `src/components/<Name>/`, move the file in as `<Name>.tsx`, add `<Name>.styled.tsx` if it has styles, add `types.ts`, add `index.ts` re-export.

---

## ORG-L-NAMING — Generic styled-component names

**Rule source:** building-ripe-components/styled.md → "Naming Conventions"
**Severity:** L
**Heuristics:**
```
rg -nE 'export const (Container|Wrapper|Header|Footer|Title|Button|Text|Row|Col|Icon|Modal)\s*=' src/components
```
Flag generic names; the rule is `[Component][Role]` (e.g. `CartItemRow` not `Row`).
**Fix template:** Rename to semantic `[Component][Role]` form.

---

## ORG-L-INDEX-CONTENTS — `index.ts` contains more than a re-export

**Rule source:** building-ripe-components/SKILL.md → "`index.ts` contains only: `export { ComponentName } from './ComponentName';`"
**Severity:** L
**Heuristics:**
```
wc -l src/components/*/index.ts | awk '$1 > 2 {print $0}'
```
Then read each flagged file.
**False positives:**
- Multi-export barrels for components that legitimately ship sub-pieces (Wordmark + WordmarkASmall). Per the existing skill's L1 in the 2026-05-20 audit, this is acceptable when components are tightly-coupled variants.
**Fix template:** Move component logic out of `index.ts` into `<Name>.tsx`. `index.ts` is re-export only.

---

## ORG-L-CLAUDE-MD-OPEN-ITEMS — `CLAUDE.md` "Open items" with no tracking

**Heuristics:** read `CLAUDE.md` "Open items" section if present. For each item, search for a corresponding `docs/plan/` or `docs/handoffs/` entry that references it.
**False positives:** Items resolved but not yet removed from CLAUDE.md — the audit should note them, not flag as drift.
**Fix template:** Either track the item in `docs/plan/` or remove it from CLAUDE.md.

---

## OK — Sections to verify and report compliant

- All branches follow the file-layout convention → "OK — N/N branches structured per skill"
- All tests in `__tests__/` → "OK — no tests beside source files"
- All component folders contain `<Name>.tsx`, `<Name>.styled.tsx` (where styled), `types.ts`, `index.ts` → "OK — N/N component folders complete"
- All styled component names are semantic → "OK — no generic names"
