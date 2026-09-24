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

**Rule source:** building-ripe-store/SKILL.md cardinal rule #6 + state-shape.md → "Selectors and Memoisation"
**Severity:** M
**Heuristics:**
```
rg -nE 'export const select\w+\s*=\s*\([^)]*state[^)]*\)\s*=>' src/store | rg '(\.map|\.filter|\.slice|\.sort|\.reduce|\{[^}]+:)'
```
For each hit, check whether the selector is wrapped in `createSelector(...)` somewhere above.
**False positives:**
- Selectors that return a primitive (number, string, boolean) — including `.filter(...).length`, `.map(...).join(',')`, `.some/.every/.includes`.
- Selectors that return an existing slice reference (`state.x.y` — no `.map`/`.filter`/etc.).
- Selectors that return `.find(...)` — returns an existing element reference or `undefined`.
- Inline `useAppSelector((s) => ...)` calls in components — the rule applies to NAMED selectors in `<branch>.selectors.ts`, not to one-off inline reads. The grep above already scopes to `src/store`, so inline reads in `src/components` are not in scope.
**Fix template:** Wrap with `createSelector` from `@reduxjs/toolkit`. Pass primitive-returning input selectors. See state-shape.md → "Selectors and Memoisation" for the full rule, the "do I need to memoise?" test, and the parametric-selector pattern.

---

## STORE-M-PATCH-STATE-MACHINE — `patch: Partial<XState>` on a tagged-union state

**Rule source:** Proposed rule — no skill file states it yet. The reasoning, stated here so this
check is self-contained: when a state shape is a tagged union discriminated by an enum'd `status`,
a `patch: Partial<XState>` payload lets a caller write any subset of any variant's fields. That
defeats the discriminator — you can land in `status: 'error'` while still carrying `data` from the
success variant. Each legal transition should be its own action, naming what happened.
**Severity:** M
**Heuristics:**
- Find action payload interfaces:
  ```
  rg -nA 3 'interface \w+Payload\s*\{' src/store
  ```
- Flag payloads whose ONLY field is `patch: Partial<...>` where `...` is a state shape that has an enum'd `status` field.
**False positives:**
- Entity PATCH payloads (`{ shorthand, patch: Partial<Pick<Demo, 'name' | 'description'>> }`) — these are fine; the patch is over independent entity fields, not a tagged union.
**Fix template:** Split into one action per phase transition. Payloads carry the new data, never the status (the action IS the status).

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

## STORE-H-IO-OUTSIDE-API — Network or platform call outside `store/<branch>/api/`

**Rule source:** building-ripe-store/api.md → "The Rule" and "The Grep"
**Severity:** H
**Heuristics:**
```
rg -n 'fetch\(|getUserMedia|enumerateDevices|localStorage|sessionStorage|postMessage|navigator\.clipboard|window\.mce' src \
  --glob '!src/store/*/api/**' --glob '!src/lib/modules/**' --glob '!**/__tests__/**'
```
Then, for each `api/` function, confirm its callers are listeners (`rg -n "from '@/store/<branch>/api" src` — hits in `src/components` are findings unless the import is a *read* of an already-open hardware handle, e.g. `cameraStream(step)` in a DOM-attach atom).
**False positives:**
- `lib/modules/**` — the deep implementation an `api/` function fronts.
- `config.ts` reading `import.meta.env` — that is its job (see STORE-M-ENV-OUTSIDE-CONFIG).
**Fix template:** Move the call into `store/<branch>/api/<verb><Thing>.ts`, return an honest result union (`SendResult`), call it from the branch's listener. See api.md.

---

## STORE-M-CLIENT-TYPES-AS-STATE — A service client's types used outside `api/`

**Rule source:** building-ripe-store/SKILL.md cardinal rule #7; api.md → "The App's Own Types" (the branch's `types.ts` declares its own state types; only `api/` imports a client's types and formats the response into the branch's)
**Severity:** M — nothing breaks at runtime today; the next schema change breaks every reducer, selector, component and fixture instead of one formatter.
**Heuristics:**
```
# client packages imported outside api/ (adjust the package pattern to the app's clients)
rg -n "from ['\"][^'\"]*(api-client|-sdk|/generated|graphql)[^'\"]*['\"]" src \
  --glob '!src/store/*/api/**' --glob '!src/lib/modules/**'
# state types aliased from response shapes
rg -n "(Result|Response|Fragment|Query|Dto)\b" src/store --glob '**/types.ts'
# an api function that returns the client's value without formatting it (matches a variable named `response`; READ the rest)
rg -n 'return response(\.\w+)?( \?\? [^;]+)?;' src/store --glob '**/api/*.ts'
```
Then READ each hit. A `types.ts` that aliases, re-exports or `Pick`s a client type is a finding. So is a listener, selector, component or non-api test that imports one, and an api function that hands the client's object (or its array) back unformatted.
**False positives:**
- `lib/modules/**` holding the deep client that an `api/` file fronts.
- A client that is not a service boundary: a UI library's prop types, a platform typing like `MediaStreamConstraints`.
- A name that only matches the pattern: `export type SearchResult = TutorialSummary` aliases the app's own type, not a client's.
**Fix template:** Declare the type in the branch's `types.ts` in its own terms (a const object + derived union for any closed set), add a private `toX(clientValue): X` formatter in the api file, and return its result. Retype the non-api test fixtures as the branch's types.

---

## STORE-M-ENV-OUTSIDE-CONFIG — `import.meta.env` / `process.env` read outside `config.ts`

**Rule source:** building-ripe-store/api.md → "`config.ts` — the one reader of `import.meta.env`"
**Severity:** M
**Heuristics:**
```
rg -n 'import\.meta\.env|process\.env' src --glob '!src/config.ts' --glob '!**/__tests__/**'
```
**False positives:** `vite.config.ts` and other build files outside `src/`.
**Fix template:** Export a bare const from `config.ts` (`export const isDevBuild: boolean = import.meta.env.DEV`) and import that.

---

## STORE-M-CASE-WRITES-PARAMS — A reducer case writes a branch's parameters

**Rule source:** building-ripe-store/state-shape.md → "Default State Requirements" ("Parameters are defaults too": a check's `params` and the journey's knobs are declared in `initialState`, overridden only through `makeStore(preloadedState)`, and no case writes them)
**Severity:** M — it breaks the declaration rule (the reducer stops being the one place a reader learns how a check behaves), not runtime behaviour
**Heuristics:**
```
rg -n '\.params\s*=|\bparams:' src/store --glob '*.reducer.ts'
rg -n 'sharedTimeoutMs\s*=|allowTestSkip\s*=|validityDays\s*=' src/store --glob '*.reducer.ts'
```
Then READ each hit: is it inside the `initialState` literal (or the helper that builds it), or inside an `addCase`/`addMatcher` body? Only the second is a finding. Also flag a `params` module beside the reducer (`*.params.ts`, `*.config.ts`) or a `resolve<X>Params()` function anywhere under `src/` — the parallel config layer the rule deletes.
**False positives:**
- `idleCheck(params: CheckParams | null)` — the `initialState` helper's signature, and the literals `initialState` hands it.
- `resetCheck(previous)` / `{ ...previous, status: "idle", … }` — a reset that spreads the previous record keeps `params` without naming it; a spread is not a write.
- `check.params?.kind` in a `switch` — a read.
**Fix template:** Move the value into the record's literal in `initialState` and delete the case. Where a case restarts a check, route it through the reducer's `resetCheck(previous)` the way `checkStarted` does — `{ ...resetCheck(previous), status: "running", attempt: previous.attempt, progress: startingProgress(previous) }` — so `params` is carried by the spread and never assigned. A test that needs a different value preloads `diagnosticsWith({ params: { touchscreen: { windowMs: 1_000 } } })`; a client that needs one merges a partial state before `makeStore` and clamps into `LIMITS` there.

---

## STORE-H-CAST — `as` type assertion in app code

**Rule source:** building-ripe-store/SKILL.md → "The `Listener` Union" (narrow with `.match`, never `action.payload as`); the repo root `.eslintrc.js` runs `@typescript-eslint/consistent-type-assertions` with `assertionStyle: "never"` and CI lints client apps with it
**Severity:** H
**Heuristics:**
```
rg -n '\bas\s+[A-Z][A-Za-z<>\[\]|,\s]*' src --type ts --glob '!**/__tests__/**' | rg -v 'as const|import .* as |export .* as '
rg -n 'as unknown as|as any' src
```
**False positives:** `as const`; import/export aliasing. `lib/modules/**` fronting a third-party SDK with wrong typings may carry a cast **with a comment naming the upstream typing bug** — grade L.
**Fix template:** Narrow with the action creator's `.match`, a `value is T` predicate, `instanceof` on a nominal class, or `satisfies`. In a test, a typed factory (see tests.md → TEST-M-CAST-DOUBLE).

---

## OK — Sections to verify and report compliant

- Every network/platform call lives in `store/<branch>/api/` and is called from a listener → "OK — api grep clean, N api modules, all callers listeners"
- Service-client types imported under `store/*/api/` only; every state type declared in its branch's `types.ts` → "OK — client types stop at api/, N formatters"
- `import.meta.env` read in `config.ts` only → "OK — one env reader"
- No reducer case assigns `params` or a journey knob; no `resolve<X>Params()` anywhere → "OK — parameters declared in `initialState` only"
- No `as` assertions in `src` → "OK — 0 casts (as const excepted)"
- All `createAction` payloads have named-field interfaces → "OK — N/N data-bearing actions follow payload-as-interface"
- All reducers' `if` guards are data-invariant (not business decisions) → "OK — N reducer guards are all invariant-protecting"
- All derived selectors wrapped in `createSelector` → "OK — N/N `.map/.filter/.slice` selectors memoised"
- No `setX({ x: boolean })` payloads → "OK — no boolean-toggle action payloads"
- All listener cross-branch placements correct (lives where it produces data) → "OK — N cross-branch listeners verified"
