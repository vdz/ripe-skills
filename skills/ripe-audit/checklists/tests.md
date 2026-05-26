# Tests Checklist — against `building-ripe-tests`

Test-quality drift. The existing `ORG-M-TEST-COLOCATION` in `organisation.md` stays where it is (structural concern); this file covers Ripe-test idiom drift.

---

## TEST-M-REDUCER-NO-TESTS — Branch has a reducer but no reducer test file

**Rule source:** building-ripe-tests/SKILL.md workflow checklist
**Severity:** M
**Heuristic:** for each `src/store/<branch>/<branch>.reducer.ts`, assert `src/store/<branch>/__tests__/<branch>.reducer.test.ts` exists.
```bash
for f in src/store/*/[a-z]*.reducer.ts; do
  branch=$(basename "$f" .reducer.ts)
  dir=$(dirname "$f")
  test_file="$dir/__tests__/$branch.reducer.test.ts"
  [ -f "$test_file" ] || echo "MISSING: $test_file"
done
```
**False positives:** branches that legitimately have no reducer (rare — usually router-only or computed-only branches).
**Fix template:** scaffold `__tests__/<branch>.reducer.test.ts` with the default-state idiom + one transition per action. See building-ripe-tests/reducer-tests.md.

---

## TEST-M-LISTENER-NO-TESTS — Branch has a non-empty listener but no listener test file

**Rule source:** building-ripe-tests/SKILL.md workflow checklist
**Severity:** M
**Heuristic:** for each `src/store/<branch>/<branch>.listener.ts` whose default export `listener` array has length > 0, assert `src/store/<branch>/__tests__/<branch>.listener.test.ts` exists.
```bash
rg -l 'export const listener\s*:\s*Listener\[\]' src/store
# for each, check the corresponding __tests__/<branch>.listener.test.ts
```
**False positives:** branches with `listener: Listener[] = []` (no listeners registered yet — still in development).
**Fix template:** scaffold `__tests__/<branch>.listener.test.ts` with the 4-line skeleton: `vi.resetModules()` → dynamic import → `makeTestHarness(listener)` → dispatch + `vi.waitFor`. See building-ripe-tests/listener-tests.md.

---

## TEST-M-HAND-ROLLED-STORE — Test constructs `configureStore` directly

**Rule source:** building-ripe-tests/SKILL.md "The Harness" — "never hand-roll a store in a test"
**Severity:** M
**Heuristic:**
```bash
rg -n "configureStore\(" src --type ts | rg -v 'src/store/store\.ts|src/test-utils\.ts'
```
**False positives:** none expected. If the harness genuinely doesn't fit, grow the harness rather than bypass it.
**Fix template:** replace the inline `configureStore({...})` with `makeTestHarness(listenerArray)` from `@/test-utils`.

---

## TEST-L-SELECTOR-NO-TESTS — Branch has derived selectors but no selector test file

**Rule source:** building-ripe-tests/SKILL.md "Selector Tests"
**Severity:** L
**Heuristic:** for each `src/store/<branch>/<branch>.selectors.ts` that imports `createSelector`, assert `src/store/<branch>/__tests__/<branch>.selectors.test.ts` exists.
```bash
rg -l 'createSelector' src/store/*/*.selectors.ts 2>/dev/null
# for each, check the corresponding test file
```
**False positives:** branches with only plain function selectors (no `createSelector`) — those are trivial enough to skip.
**Fix template:** add one test per derived selector. See building-ripe-tests/SKILL.md → "Selector Tests".

---

## TEST-L-IMPLEMENTATION-LEAK — Test imports beyond the listener's public export

**Rule source:** building-ripe-tests/listener-tests.md "Don't import internal helpers"
**Severity:** L
**Heuristic:**
```bash
rg -n "from '\.\./\w+\.listener'" src/store/*/__tests__/ | \
  rg -v "import \{\s*listener\s*\}|import\s+\* as"
```
A listener test file should only import the `listener` array from `../<feature>.listener`. Any other named import is reaching for internals.
**False positives:** importing types (e.g. `import type { ListenerConfig } from '../foo.listener'`) is fine — flag only runtime imports.
**Fix template:** extract the internal helper to a pure module (e.g. `<feature>.helpers.ts`) and unit-test it there. OR delete the test if it was testing a private implementation detail.

---

## TEST-L-SNAPSHOT-USED — Snapshot tests present

**Rule source:** building-ripe-tests/SKILL.md "What This Skill Won't Cover"
**Severity:** L
**Heuristic:**
```bash
rg -nE 'toMatchSnapshot|toMatchInlineSnapshot' src
```
**False positives:** none. Ripe doesn't snapshot.
**Fix template:** replace with explicit assertions on the visible state / dispatched actions.

---

## TEST-L-DESCRIBE-COUNT — Test file has more than one top-level `describe` block

**Rule source:** building-ripe-tests/SKILL.md cardinal rule #5 — "one `describe()` per logical surface"
**Severity:** L (suggestion, soft heuristic)
**Heuristic:**
```bash
for f in src/store/*/__tests__/*.test.ts src/components/*/__tests__/*.test.tsx; do
  count=$(rg -c '^describe\(' "$f" 2>/dev/null || echo 0)
  [ "$count" -gt 1 ] && echo "$f: $count top-level describes"
done
```
**False positives:** files that legitimately split concerns (e.g. one `describe` per public surface of a multi-purpose listener). The heuristic is soft — review before flagging in the report.
**Fix template:** split the file by concern: `<branch>.listener.<concern1>.test.ts`, `<branch>.listener.<concern2>.test.ts`.

---

## TEST-L-NO-VI-RESETMODULES — Listener test file doesn't reset modules between tests

**Rule source:** building-ripe-tests/listener-tests.md "Why `vi.resetModules()` + Dynamic Import"
**Severity:** L
**Heuristic:**
```bash
for f in src/store/*/__tests__/*.listener*.test.ts; do
  rg -q 'vi\.resetModules\(\)' "$f" || echo "MISSING resetModules: $f"
done
```
**False positives:** listener tests that don't have module-level guards in the source listener (rare — most listeners do). If a listener has zero module-level state, `vi.resetModules` is overhead but harmless. Mark as OK with a note.
**Fix template:** add `beforeEach(() => { vi.resetModules(); });` and convert the listener import to a dynamic `await import('../the.listener')` inside each test.

---

## OK sections to verify and report compliant

- All branches with reducers have reducer tests → "OK — N/N branches covered"
- All branches with non-empty listeners have listener tests → "OK — N/N listener files covered"
- No `configureStore` outside `store.ts` and `test-utils.ts` → "OK — harness used everywhere"
- No snapshot tests → "OK — no snapshot drift"
- All listener tests reset modules → "OK — no test-bleed via module-level guards"
