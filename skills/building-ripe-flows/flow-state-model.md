# Flow State Model — R1 Intake, R2 Conclusions, the Simplicity Gate

## When to read this
- Deciding what state a new flow needs
- Unsure whether a value belongs in the engine's step data or its own branch
- Adding a feature reducer to a flow and wanting to justify it
- A flow has genuine domain state (a test's running status, a retry ceiling) beyond nav
- Exposing a flow's state to another feature (telemetry, a progress widget)

## Contents
- The two homes: R1 and R2
- The boundary test
- Most flows have no reducer
- Extending a flow — one coupling rule, three state shapes
- The R2 amendment — an owned domain reducer `[contract-only]`
- One-way projection (MIRROR-OUT) `[contract-only]`
- The simplicity gate for a new branch

## The Two Homes: R1 and R2

A flow's state splits across two homes (ADR-0004):

**R1 — engine intake.** The `flows` branch: `flows.byId[flowId] = { status, steps, currentStep, data }`, where `data` is **step-scoped intake** (`data[stepId]`), written live via `setStepData`. The engine owns intake so every decision point in the brain reads the latest context. This is where user answers and probe results live — `data.triage.mode`, `data.connectivity.signal`, `data.storage.freedGB`.

A `FlowDefinition` may also seed starting intake via an optional `initialData` map (`types.ts`), applied **once** when the engine builds the flow at store-init. Mind the asymmetry: `flowStart` replay hard-clears `data` to `{}` and does **not** re-apply `initialData` — a seed survives only until the first replay, so a step must never rely on it being restored.

**R2 — feature conclusions.** An *optional* feature branch, existing only for feature-specific state that is **not** step intake: derived conclusions, summaries, or state consumed outside the flow. `troubleshoot.report` — derived by `buildReport(flow.data)` on reaching `summary` — is R2. Raw intake stays in R1.

> **Known gap — no teardown or persistence.** Neither home is pruned when a flow finishes: `flowDone` flips `status` but the instance (and its `data`) stays in `flows.byId` for the session, and nothing persists across reloads. Both are deferred by design — the answer, if ever needed, is a thin interpreter layered on top, never a core retrofit. Don't build teardown or persistence into a feature to compensate.

## The Boundary Test

For any value a flow holds, ask:

> **Is it produced by, and scoped to, a single step?** → R1 (`data[stepId]`).
> **Is it a derived conclusion, a summary, or read outside the flow?** → R2 (a feature branch).

`data.battery.ok` (the user's answer on the battery step) is R1. `report.health` (a verdict computed from *all* steps, shown after the flow and consumed by the caller) is R2. When in doubt, it's R1 — the bar for a new branch is high (see the simplicity gate).

**Anti-pattern: duplicating intake into R2.** The first `troubleshoot` attempt mirrored `battery` / `wifi` step data into `troubleshoot.battery` / `.wifi`. That's redundant — the intake already lives in R1, and now two places can disagree. R2 holds only what R1 *doesn't*: the derived conclusion.

## Most Flows Have No Reducer

The consequence of the boundary test: **a feature earns a reducer only when it has R2 state.** `cleanup` has none — its result (`freedGB`) is R1 step data the parent reads. `troubleshoot` has a one-field reducer, only for the derived report. A plain wizard that collects answers and hands them off carries no reducer at all — just a definition + brain + pure utils + view.

Before adding a reducer to a flow, confirm it has genuine R2 state. If everything it holds is step intake, delete the branch.

## Extending a Flow — One Coupling Rule, Three State Shapes

*This is the heart of extensibility: a flow driven by the generic engine, extended with feature logic whose state may sit in a different branch. One rule governs all of it.*

> **The coupling rule (ADR-0005):** a feature couples to a flow **only through the actions it dispatches and the selectors it exposes** — no code reaches into another branch's raw shape. **Where the extension's *state* lives is a separate decision, made by the engineer** — there are three sanctioned shapes, and choosing between them is judgment, not doctrine.

| | Shape | Proven in | Reach for it when |
|---|---|---|---|
| **A** | **Owned domain branch + one-way projection out.** The feature owns a reducer (the atom is the source of truth) and MIRRORS a generic summary into `flows.data` for foreign listeners — never reading it back. | DTL `diagnostics` (`TestAtom`) — projection at `mce-dtl/src/lib/feature/diagnostics.listener.ts:69-80` | The feature has genuine domain state with an in-step lifecycle (running → done → retried) that other features only *observe*. |
| **B** | **No branch at all — verdicts live in the engine's data bag.** Decision logic is pure modules + a brain; each step's verdict is written into `flows.data[step]` via `setStepData` and read back with `selectStepData`. | VFUK `eligibility` — verdict shape at `mce .../store/eligibility/eligibility.intake.ts:68-87` | The extension is *decision logic*, and everything it produces is genuinely step-scoped. The default: no new branch to justify. |
| **C** | **Owned domain branch that also *reads* the flow's intake.** The feature owns its branch (device dimensions, a pricing pipeline) and pulls the flow's verdict table through the engine's public selectors to do its job. | VFUK `tradein` — `selectFlow(state, flowId)` feeding `buildFinalOfferInput({ flow })` at `mce .../store/tradein/tradein.brain.ts:113-118` | The feature owns state of its own **and** needs the flow's intake as input (pricing needs the verdicts). The read goes through public selectors — that is what keeps it legal. |

Notes that keep the shapes honest:

- **"One-way" is a property of shape A's projection, not a universal law.** A's mirror must never be read back by its producer (drift). C reads flow data *by design* — through the engine's public selectors, which is exactly what the coupling rule permits. Don't cargo-cult "never read flow data" onto shape C.
- **The shapes compose in one app.** VFUK runs B (eligibility verdicts in the bag) and C (tradein pulling them) side by side; DTL runs A. Pick per feature, not per project.
- **B is the default.** A and C must justify their branch through the [simplicity gate](#the-simplicity-gate) below.

## The R2 Amendment — an Owned Domain Reducer `[contract-only]`

*Shape A's canonical example. Proven in `@mcesystems/dtl`'s `diagnostics` slice (`src/lib/feature/diagnostics.{types,reducer,listener}.ts`); recorded as the ADR-0004 amendment (2026-06-23). Not in `ripe-flows` code.*

The R1/R2 split sharpens from "conclusions vs intake" to **altitude-scoped**: the engine holds *journey-altitude* step intake; a feature MAY own a reducer for its own *semantic* data at its own altitude when it has genuine domain state beyond a summary.

DTL's `diagnostics.reducer` owns a `TestAtom` — the test's *home*, not a step's intake:

```typescript
// [contract-only] @mcesystems/dtl — diagnostics.types.ts (shape)
interface TestAtom {
	id: string;
	status: TestStatus;                 // idle | running | done …
	verdict: Verdict;                   // pass | fail | skipped | aborted | notSupported | timeout
	payload: unknown;                   // the test's result envelope
	retry: { attempt: number; max: number };
}

// Adding a verdict is a compile error until it's mapped — a Record, not a ternary:
const VERDICT_STATUS: Record<Verdict, TestStatus> = { /* every verdict → its status */ };
```

The atom carries live running state, a payload envelope, and a retry ceiling — none of which is generic step intake, so it earns a reducer at the feature's altitude. **Plain step intake still never earns a reducer.** The atom is the source of truth; `flows.data` holds only a non-authoritative mirror (see projection).

Two tells that a flow has crossed into R2-amendment territory:
- It has state with a lifecycle *inside* a step (a test that is running, then done, then retried) — not just an answer.
- The exhaustive-map discipline pays off: modelling the domain as a discriminated union where adding a case is a compile error.

If your flow is a wizard collecting answers, you are not here — you are at R1 + maybe a derived R2 summary.

## One-Way Projection (MIRROR-OUT) `[contract-only]`

*Shape A's seam, proven in DTL — how a feature owning its state still speaks the engine's generic language.*

Under the coupling rule, shape A has three seam directions:

- **DRIVE-IN** — dispatch engine/feature actions (`testStart`/`testDone` from the step component).
- **READ-IN** — selectors return *view-models*, not raw shape (`selectProgress` returns a memoised tally, not the atom map — `mce-dtl/src/lib/feature/diagnostics.selectors.ts:43-58`; the retry *ceiling* is enforced in the `useRetry` view-model, not the reducer).
- **MIRROR-OUT** — the feature writes a generic `{ status, verdict }` summary into `flows.data[step]` via `setStepData`, purely so foreign listeners that speak only generic step-data can react.

The projection is **duplicated truth by design and must stay one-way**: the atom is authoritative; `flows.data` is a mirror the feature *writes* and *never reads back* (grep-verified in DTL — the only reader of the mirror is a display-only dev harness). Nothing in the type system enforces this — a reviewer holds the invariant. The *listener-side* rule for where to guard the projection vs the cursor move (inert vs disruptive) is in [the-brain-listener.md → the inert-vs-disruptive guard rule](the-brain-listener.md#the-inert-vs-disruptive-guard-rule-contract-only).

Why one-way *here*: adding a consumer (telemetry, a progress widget) means subscribing to the same events/selectors; the producer never changes. Read the mirror back and the two stores drift. (A shape-C feature reading flow data through public selectors is a different, legal thing — see the table above.)

## The Simplicity Gate

*ADR-0009. Guidance, not code. It governs whether a new top-level state branch may exist — the R2 decision above, made rigorous.*

A new top-level branch must pass a deliberate gate, and **the default answer is NO**. A concern earns a branch only by *displacing* complexity. The reviewer runs a **displacement audit**: name what existing state the branch removes or subsumes.

- "Folds the three ad-hoc places `X` lived into one home" → **passes**.
- "It's cleaner / it's separate / it feels tidier" → **fails**.

Four rules:

1. **Derive, don't store.** A value computable from existing state — a tally, a config selection, a recomputable report — is a **selector**, not a branch. (The `troubleshoot` report is borderline: it's derived, but it's read outside the flow and reset on replay, so it earns a one-field branch rather than a selector. Prefer a selector unless the value must persist independently or be consumed by foreign listeners.)
2. **Depth ≤ 3** — `branch.section.leaf`.
3. **One-screen rule** — the whole branch, counting the full union of any polymorphic payload, fits on one screen.
4. **Glanceability governs intra-branch shape.** A `Record<id, V>` counts as **one** concern regardless of key count — `byId` with 60 entries is one idea. Only distinct, named, structurally-different children are constrained, and softly ("few and named"), relaxing toward the leaves.

The question to ask: **"Can I name every distinct concern at a glance, and does each earn its place?"**

> **Don't teach the rejected first draft.** An earlier version proposed a hard "sub-tree budget ≤ 3 nodes". The owner rejected it as untruthful: fan-out legitimately grows toward the leaves (a `byId` with 60 keys is one concern, not 60). It measured node count instead of comprehensibility. Teach the displacement audit + the glanceability question, never a node count.
