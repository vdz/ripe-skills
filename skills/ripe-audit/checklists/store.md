# Store Checklist — against `building-ripe-store`

---

## STORE-H-REDUCER-DECISION — Reducer with a business-decision `if`

**Rule source:** building-ripe-store/SKILL.md cardinal rule #2 + listeners.md → "What CAN live in a reducer vs what CAN'T"
**Severity:** H
**Heuristics:**
```
rg -nU 'addCase\([^)]+,\s*\(state[^)]*\)\s*=>\s*\{[^}]*\bif\b' src/store
```
For each hit, READ the surrounding case. Apply the test:
- "Is this data in a consistent state?" → OK (data-invariant guard, e.g. dedupe push, defensive null check)
- "Should this happen?" → H (business decision, must move to listener)
**False positives:**
- Dedupe (`if (!items.includes(id)) items.push(id)`) — invariant guard.
- Cascade-delete (`if (state.activeId === deleted) state.activeId = null`) — invariant guard.
- Null guard (`if (existing) state.byId[id] = {...existing, ...patch}`) — invariant.
- Re-derive `filteredItems` on mutation — invariant (cache-on-mutation rule).
**Fix template:** Split into two named actions; the listener dispatches the appropriate one based on `getState()`. See listeners.md "What CAN live in a reducer".

---

## STORE-H-BARE-PRIMITIVE-PAYLOAD — `createAction<primitive>`

**Rule source:** building-ripe-store/action-payloads.md → "Payload-as-Interface Rule"
**Severity:** H
**Heuristics:**
```
rg -nE 'createAction<\s*(string|number|boolean)\s*>' src/store
```
**False positives:** None.
**Fix template:** Define `<ActionName>Payload` interface in `types.ts` with a named field. Use it as the generic.

---

## STORE-H-API-IN-REDUCER — API call inside a reducer case

**Rule source:** building-ripe-store/SKILL.md cardinal rule #2 + listeners.md
**Severity:** H
**Heuristics:**
```
rg -nU 'addCase\([^)]+,\s*async\s*\(' src/store
rg -nU 'addCase[\s\S]{0,300}?(await|fetch\(|api\.\w+\()' src/store
```
**False positives:** None — API calls must live in listeners.
**Fix template:** Move the call to a listener; the reducer assigns the success payload.

---

## STORE-M-BOOLEAN-PAYLOAD — `setX({ x: boolean })`

**Rule source:** building-ripe-store/action-payloads.md → "Be descriptive, not toggling"
**Severity:** M
**Heuristics:**
```
rg -nU 'createAction<\w*Payload>\([^)]+\)' src/store
```
Then read the payload interface definition; flag if it has a single `boolean` field.
**False positives:** None. Boolean payloads should always split into two events.
**Fix template:** Split into two no-payload actions (e.g. `dragEntered` / `dragLeft`, `wentOnline` / `wentOffline`). Delete the `SetXPayload` interface.

---

## STORE-M-UNMEMOIZED-SELECTOR — Derived selector without `createSelector`

**Rule source:** [B1 staged proposal — to be promoted to building-ripe-store/state-shape.md]
**Severity:** M
**Heuristics:**
```
rg -nE 'export const select\w+\s*=\s*\([^)]*state[^)]*\)\s*=>' src/store | rg '(\.map|\.filter|\.slice|\.sort|\.reduce|\{[^}]+:)'
```
For each hit, check whether the selector is wrapped in `createSelector(...)` somewhere above.
**False positives:**
- Selectors that return a primitive (number, string, boolean).
- Selectors that return an existing slice reference (`state.x.y` — no `.map`/`.filter`/etc.).
**Fix template:** Wrap with `createSelector` from `@reduxjs/toolkit`. Pass primitive-returning input selectors. See B1 staged proposal at `_staging/selectors-proposal.md` for the full rule.

---

## STORE-M-PATCH-STATE-MACHINE — `patch: Partial<XState>` on a tagged-union state

**Rule source:** (proposed — see [B8 handoff doc in mce-demo-portal](file:///Users/yehuda.g/Dev/mce-demo-portal/docs/handoffs/2026-05-25-patch-state-antipattern-followup.md) for context)
**Severity:** M
**Heuristics:**
- Find action payload interfaces:
  ```
  rg -nA 3 'interface \w+Payload\s*\{' src/store
  ```
- Flag payloads whose ONLY field is `patch: Partial<...>` where `...` is a state shape that has an enum'd `status` field.
**False positives:**
- Entity PATCH payloads (`{ shorthand, patch: Partial<Pick<Demo, 'name' | 'description'>> }`) — these are fine; the patch is over independent entity fields, not a tagged union.
**Fix template:** Split into one action per phase transition. Payloads carry the new data, never the status (the action IS the status). See B8 handoff doc.

---

## STORE-M-FAT-DISPATCH — Action payload carries an entity object instead of an ID

**Rule source:** building-ripe-store/action-payloads.md → "Pass the Minimum"
**Severity:** M
**Heuristics:**
```
rg -nE 'dispatch\(\w+\(\{[^}]+:\s*\w+\.byId\[' src/store
rg -nE 'dispatch\(\w+\(\{\s*demo:|product:|order:|user:' src/store src/components
```
**False positives:**
- A listener that genuinely needs to ship a server-fresh entity payload (e.g. `fetchDemoSuccess({ demo })`) — that's `success` payload, not an identifier dispatch. Flag only dispatches that could pass an ID and let the receiver look up.
**Fix template:** Replace with `dispatch(action({ shorthand }))`. The receiving listener reads `getState().X.byId[shorthand]`.

---

## OK — Sections to verify and report compliant

- All `createAction` payloads have named-field interfaces → "OK — N/N data-bearing actions follow payload-as-interface"
- All reducers' `if` guards are data-invariant (not business decisions) → "OK — N reducer guards are all invariant-protecting"
- All derived selectors wrapped in `createSelector` → "OK — N/N `.map/.filter/.slice` selectors memoised"
- No `setX({ x: boolean })` payloads → "OK — no boolean-toggle action payloads"
- All listener cross-branch placements correct (lives where it produces data) → "OK — N cross-branch listeners verified"
