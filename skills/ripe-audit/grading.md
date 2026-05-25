# Grading Rubric

Each finding gets one severity. The auditor auto-grades per the rules below; the reviewer's per-card comment in the HTML overrides if needed.

## H — High

A skill-mandated rule is violated AND the violation affects correctness, security, or maintainability at scale.

Examples:
- Reducer with a business-decision `if` (vs an allowed data-invariant guard — see store/B6)
- Action with bare-primitive payload (`createAction<string>`)
- Component fetching its own data on mount via `useEffect(fetchX)`
- `setLocation` listener branch without an idempotency guard (entry OR exit)
- Use of `useState` in a non-atomic component
- Any transient prop on a styled component (`$active`, `$size`, etc.)
- Missing handler on a `<button>` / `<input>` / `<a>` interactive element

H findings should be fixed before merging. They almost always represent something that will hurt the next person who touches the code.

## M — Medium

A best-practice from a skill is missed but doesn't break runtime. Usually single-file fixes.

Examples:
- Boolean-payload action (`setDragActive({ dragActive: boolean })`) instead of two events
- Derived selector returning `.map() / .filter() / .slice()` without `createSelector`
- `patch: Partial<XState>` action on a tagged-union state machine (vs per-phase actions)
- Child component takes a full entity object instead of an ID
- Component file > 150 lines
- Helper at module scope that closes over nothing AND is only used in one component (should be in HELPERS)

M findings get fixed as drive-bys when the file is touched, or batched into a cleanup PR.

## L — Low

Nuance, debatable, or pragmatic deviation. **Flag-but-don't-fix** unless it recurs. The audit may SUGGEST splits but never apply them.

Examples:
- Two tightly-coupled variant components in one file
- Module-level helper that could be in HELPERS but is fine where it is
- Long but cohesive JSX subtree (still readable in one sitting)
- Inline lambda in JSX for a one-liner dispatch (acceptable per skill)

L findings exist to give the reviewer signal, not a TODO list.

## OK — Verified compliant

A rule was specifically checked and passed. Helps reviewers see what was looked at (and what to re-check next pass). Always include the OK section — silence isn't evidence the rule was checked.

Examples:
- "All 32 actions follow payload-as-interface"
- "All `useEffect` sites are legitimate (router bridge, DOM listener registration only)"
- "All derived selectors wrapped in `createSelector`"

## (Skip) — Pragmatic deviation, already documented

The project's `CLAUDE.md` has a "Ripe deviations" section listing intentional divergences from the skill. The auditor:
1. Reads that section.
2. For each deviation, verifies the divergent code still matches what the doc describes.
3. Marks the finding as `(Skip)` with a pointer to the deviation entry.
4. Does NOT re-litigate the decision in the audit.

If the code has drifted FROM the documented deviation (the doc says "we use 2-space indent" but the file is tabs), that's a real H/M finding — flag as drift between code and CLAUDE.md.

## Auto-grade decision tree

```
Is the rule violated?
├─ No  → OK (verified compliant)
└─ Yes
   ├─ Is the deviation already documented in CLAUDE.md?
   │  └─ Yes → (Skip), reference the doc entry
   └─ No
      ├─ Does the violation affect correctness / security / maintainability at scale?
      │  └─ Yes → H
      └─ No
         ├─ Is this a clear best-practice miss with a single-file fix?
         │  └─ Yes → M
         └─ Otherwise → L (suggestion, not violation)
```
