# Flows Checklist — against `building-ripe-flows`

**Scope gate:** these checks apply only when the project runs the flow engine — `src/store/flows/` exists. If it doesn't, skip this checklist entirely (don't emit N/A cards).

**Rule sources** cite `building-ripe-flows` (currently a draft skill, not yet shipped in this repo). Each card states the rule inline so the check is self-contained.

---

## FLOWS-H-ENGINE-EDITED — Engine (`store/flows/`) edited per-feature

**Rule source:** building-ripe-flows/SKILL.md cardinal rule #1 (ADR-0001, ADR-0003). The engine owns navigation state + intake and stays deliberately thin; feature work lands in the feature's branch, brain listener, and pure modules — never in the engine.
**Severity:** H
**Heuristics:**
```
ls src/store/flows/
rg -nP "from '@/(store/(?!flows)|modules/)" src/store/flows/
git log --oneline -- src/store/flows/
```
- The canonical engine is six files: `flows.actions.ts`, `flows.reducer.ts`, `flows.selectors.ts`, `flows.helpers.ts`, `flows.hooks.ts`, `types.ts`. Flag extra files (a feature's listener, a feature-named helper) living inside `store/flows/`.
- Flag any engine file importing from a feature branch or `modules/` — the engine must not know features exist.
- Flag git history showing the engine re-edited alongside feature commits (after its initial landing / deliberate engine upgrades).
**False positives:**
- A single engine-level default-advance listener (`[contract-only]` pattern) — allowed to exist; its *size* is graded by FLOWS-M-FAT-ENGINE-LISTENER, not here.
- Registering a new flow happens in `store.ts` (`createFlowsReducer([...])`) and `listener.ts` — those edits are outside the engine and correct.
**Fix template:** Move the feature code out: listener → `src/store/<feature>/<feature>.listener.ts`, decisions → `src/modules/<feature>.decide.ts`. The engine diff should revert to zero.

---

## FLOWS-H-CURRENTSTEP-WRITER — `currentStep` written outside `flowSetCurrent`

**Rule source:** building-ripe-flows/SKILL.md cardinal rule #2. `flowSetCurrent` is the sole writer of `currentStep` for in-flow moves; the only other writer is the engine's own `flowStart` reset (to `steps[0]`). No feature or reducer code ever assigns it directly.
**Severity:** H
**Heuristics:**
```
rg -n 'currentStep\s*=[^=]' src --glob '!src/store/flows/**'
rg -n 'currentStep\s*=[^=]' src/store/flows/flows.reducer.ts
```
- Any assignment outside the engine is an H.
- Inside `flows.reducer.ts`, exactly two assignment sites are legal: the `flowSetCurrent` case and the `flowStart` reset. A third is an H.
**False positives:**
- Comparisons (`currentStep === step`) and destructured reads — the `=[^=]` pattern already excludes `==`/`===`; verify remaining hits are actual assignments.
- Test files constructing fixture state (`currentStep: 'triage'` in an object literal is a `:`, not an `=`; a harness assigning into a mock state object is test setup, not production code).
**Fix template:** Replace the direct write with `dispatch(flowSetCurrent({ flowId, step }))` from the feature's brain listener. If the write lives in a reducer, the transition decision is also misplaced — see FLOWS-H-DECISION-PLACEMENT.

---

## FLOWS-H-ENTRY-NOT-IDEMPOTENT — Entry effect unsafe to re-run

**Rule source:** building-ripe-flows/SKILL.md cardinal rule #5 (ADR-0007, ADR-0008). Re-entry is replay: `flowStart` and `flowSetCurrent` re-fire the entry listeners matched on `isAnyOf(flowStart, flowSetCurrent)`, and that re-firing IS the retry mechanism. Entry effects must therefore be safe to run again.
**Severity:** H
**Heuristics:**
```
rg -nU 'isAnyOf\(\s*flowStart\s*,\s*flowSetCurrent' src/store
rg -n 'actionCreator:\s*flowSetCurrent' src/store
```
For each entry listener, READ the effect body and ask: "what happens on the second run?" Flag effects that:
- Append/accumulate on each entry (push into an array, increment a counter, enqueue a job) with no guard.
- Dispatch a non-idempotent action unconditionally (double-firing changes state twice).
- Start a side effect (timer, subscription, in-flight request) without cancelling/deduping the previous one.
**False positives:**
- An effect that overwrites its own step data via `setStepData` (merge of the same keys) — converges to the same state; re-run is the intended retry.
- A probe/scan re-fired on re-entry — that's the retry pattern working as designed, provided its result lands via overwrite, not append.
**Fix template:** Key the work on activation and guard on current state: read `getState()` and skip (or overwrite rather than append) when the work's result is already present, or cancel the previous in-flight effort before starting anew. See building-ripe-routing's idempotency discipline — same rule, flow-engine trigger.

---

## FLOWS-H-DECISION-PLACEMENT — Transition decision in a reducer or component

**Rule source:** building-ripe-flows/SKILL.md cardinal rule #1 + the mental model: `flowNext`/`flowBack`/`flowGoto` are inert intents; the feature's brain listener reads intake, delegates the decision to a pure function in `modules/`, and commits via `flowSetCurrent`. Reducers and components never decide where the journey goes.
**Severity:** H
**Heuristics:**
```
rg -nU 'addCase\(\s*(flowNext|flowBack|flowGoto)' src/store --glob '!src/store/flows/**'
rg -n 'dispatch\(\s*(flowSetCurrent|flowDone)' src/components
rg -n '(nextStep|prevStep|steps\[)' src/components
```
- A reducer reacting to a nav intent is deciding a transition → H.
- A component dispatching `flowSetCurrent`/`flowDone` directly is committing a move the brain should own → H.
- Step arithmetic (`steps[i + 1]`, `nextStep(...)`) in a component is decision logic in the view → H.
**False positives:**
- Components dispatching the *intents* (`next()`/`back()`/`goTo()` from `useFlow`) — that is exactly their job; only committing the move is the violation.
- The engine's own `flows.reducer.ts` handling `flowSetCurrent` — excluded by the glob.
- A brain listener with a small inline `switch (currentStep)` that immediately delegates each case to a `modules/<feature>.decide.ts` util — canonical. If the branching *computation* itself (multi-condition routing off intake values) sits inline in the listener instead of a pure module, note it as an L (testability), not an H.
**Fix template:** Move the decision to `src/modules/<feature>.decide.ts` (pure, independently testable); the brain calls it and dispatches `flowSetCurrent` with the result. The component goes back to dispatching the inert intent.

---

## FLOWS-H-DONE-BY-CURRENTSTEP — Consumer detects a finished flow via `currentStep`

**Rule source:** building-ripe-flows/SKILL.md → the `flowDone` gotcha (ADR-0008). `flowDone` flips `status='completed'` but leaves `currentStep` set — a finished flow still has a live `currentStep`. Consumers MUST read `status` to know a flow is done.
**Severity:** H
**Heuristics:**
```
rg -n '(!\s*[\w.]*[cC]urrentStep|currentStep\s*[!=]==?\s*(null|undefined))' src
rg -n 'Boolean\(.*currentStep|currentStep\s*\?' src
```
For each hit, READ the surrounding intent. Flag any truthiness/nullity test on `currentStep` used to mean "the flow is finished / still active" — it will report the flow active forever after `flowDone`.
**False positives:**
- Step self-gating (`currentStep === stepId` / `isActive`) — the canonical rendering pattern, an equality test against a step id, not a done-check.
- Guarding against an *unseeded* flow (`selectFlow(state, flowId) === undefined`) — the instance is absent, which is a registration question, not a completion question.
**Fix template:** Replace with `selectFlowStatus(state, flowId) === 'completed'` (or `'active'` for the inverse). Never infer lifecycle from the cursor.

---

## FLOWS-M-FAT-ENGINE-LISTENER — Engine-level listener grown beyond one intent-to-commit mapping

**Rule source:** building-ripe-flows/SKILL.md cardinal rule #1: the engine *may* carry one convenience — a default linear-advance listener for trivially linear flows (`[contract-only]`; canonical ships none) — but engine listeners must stay simple: map one intent to `flowSetCurrent`/`flowDone`, nothing more. There is constant pressure for them to become the drivers; this check is the counter-pressure.
**Severity:** M
**Heuristics:**
```
rg -nU 'flowNext|effect' src/store/flows/
```
If the engine carries a listener, READ it. The legal shape is: intent in → positional `nextStep` → `flowSetCurrent` (or `flowDone` at the last step). Flag when it:
- Reads feature state or step intake to *decide* (that's a brain's job).
- Branches per `flowId` (per-feature knowledge leaking into the engine).
- Does async work, or dispatches anything beyond the single commit.
**False positives:** None — any growth beyond the one-intent mapping is drift. (If the engine ships no listener at all, report the OK.)
**Fix template:** Carve the extra logic into the owning feature's brain listener; the flows that need more than linear advance stop relying on the default and add their own `flowNext` case.

---

## FLOWS-H-RAW-COUPLING — Feature coupled to a flow outside actions and selectors

**Rule source:** building-ripe-flows/SKILL.md cardinal rule #4 + flow-state-model.md → the coupling rule (ADR-0005): a feature couples to a flow only through the actions it dispatches and the selectors it exposes — no code reaches into another branch's raw shape. Where the extension's *state* lives is a separate, engineer's-judgment call with three sanctioned shapes: (A) owned branch + one-way projection out via `setStepData`, never read back by its producer; (B) no branch — verdicts in the engine's data bag via `setStepData`/`selectStepData`; (C) owned branch that also *reads* the flow's intake through the engine's public selectors.
**Severity:** H
**Heuristics:**
```
rg -n 'state\.flows\.(byId|\w+)' src --glob '!src/store/flows/**'
rg -n '\.data\[[^\]]+\]' src/store --glob '!src/store/flows/**'
```
- Flag any code outside the engine touching `state.flows`' raw shape instead of going through `selectFlow` / `selectCurrentStep` / `selectFlowStatus` / `selectStepData`.
- Flag one feature reading *another feature's* branch raw shape instead of that branch's public selectors.
- Shape-A drift check: for a feature that owns a branch AND mirrors a summary into `flows.data` (MIRROR-OUT), grep for the same feature reading that mirror back (`selectStepData` on the step it projects into). The mirror is write-only for its producer; reading it back lets the two stores drift.
**False positives:**
- Shape C reading the flow's intake through the engine's *public selectors* — legal by design; don't cargo-cult "never read flow data" onto it.
- Shape B verdicts written and read via `setStepData`/`selectStepData` — the default sanctioned shape.
- A branch's own `<feature>.selectors.ts` accessing its own raw shape — that's what selectors are for.
- The engine's own files — excluded by the glob.
**Fix template:** Route the read through the owning branch's public selector (add one if missing). For a producer reading back its own mirror: read the owned branch (the source of truth) instead. See flow-state-model.md → "Extending a Flow — One Coupling Rule, Three State Shapes".

---

## OK — Sections to verify and report compliant

- Engine untouched by feature work → "OK — `store/flows/` matches the canonical six files, no feature imports"
- `currentStep` written only by `flowSetCurrent` + the `flowStart` reset → "OK — sole-writer invariant holds (N assignment sites, all engine-legal)"
- All entry effects safe to re-run → "OK — N/N entry listeners idempotent (overwrite-or-guard verified)"
- All transitions decided in brains + pure modules → "OK — no nav-intent reducers, no `flowSetCurrent` from components"
- All done-detection via `status` → "OK — N consumers read `selectFlowStatus`, none test `currentStep` presence"
- Engine listener minimal or absent → "OK — engine ships no listener" / "OK — default-advance listener maps one intent, nothing more"
- All flow coupling through actions + selectors → "OK — N cross-branch reads all via public selectors; MIRROR-OUT projections write-only"
