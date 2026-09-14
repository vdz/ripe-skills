---
name: building-ripe-flows
description: Builds sequential user journeys — wizards, diagnostics, eligibility/trade-in flows — on The Ripe Method's flow engine. Use when creating a flow feature, adding steps, writing the brain listener that decides transitions, extending a flow with feature logic or its own state branch, adding gates or preconditions, composing sub-flows, giving steps URLs, testing a flow, or renovating a legacy config-driven wizard into code. Builds on building-ripe-store and building-ripe-components; pair with building-ripe-tests for flow tests.
---

# Building Ripe Flows

A flow is a named journey through an ordered set of narrative steps — a wizard, a diagnostic sequence, a trade-in eligibility walk. Ripe runs every flow on one generic engine and expresses each journey as code, not config.

## Cardinal Rules

These are non-negotiable. Every other section assumes them. Each cites the governing ADR in the canonical `ripe-flows` repo (`docs/adr/`).

**1. The engine stays deliberately thin; the feature's brain drives.** (ADR-0001, ADR-0003)
The engine (`store/flows/`) owns navigation state + intake. Moving the journey forward is the feature's job: branches, skips, guards ("may I leave?"), and completion ("am I done?") are decided by the feature's listeners — **the brain** — with each decision delegated to a pure function in `lib/utils/<feature>/`, logic dispersed intuitively across the feature's utils. The engine *may* carry one convenience — a default linear-advance listener for trivially linear flows (`[contract-only]`, canonical ships none) — but **engine listeners must stay simple: resist the constant pressure for them to become the drivers.** Where advance logic lives is ultimately the engineer's call; the default lean is the brain. Read one brain to know how a journey moves; read one step component to know what it shows. See [the-brain-listener.md](the-brain-listener.md).

**2. `flowSetCurrent` is the sole writer of `currentStep` for in-flow moves.**
There are exactly eight `flowId`-carrying actions, defined *once* in the engine — never per-flow. `flowNext` / `flowBack` / `flowGoto` are inert intents: nothing moves until the brain reacts and commits via `flowSetCurrent`. The engine literally cannot advance itself. The one other writer is `flowStart`'s reset, which sets `currentStep` to `steps[0]`; no feature or reducer code ever writes it directly. See [the eight engine actions](#the-eight-engine-actions).

**3. A step is a narrative milestone, not a screen.** (ADR-0003)
A flow's `steps` — declared literally in the flows reducer's initial state — is an ordered array of milestone ids and nothing else — no transitions, guards, meta, or components. Within one step the component renders whichever *screen* fits the step's data. A step component is a `(step-data) → screen` function; the engine never models screens. See [flow-components.md](flow-components.md).

**4. R1 intake vs R2 conclusions — and one coupling rule for extension state.** (ADR-0004, ADR-0005)
The engine holds journey-altitude, step-scoped **intake** (`flows.byId[id].data[stepId]`, written live via `setStepData`) — that is R1. A feature earns its own reducer only for **conclusions or domain state that is not step intake** — that is R2. Most features carry no reducer at all. When a flow *is* extended with feature logic, one rule governs: **a feature couples to a flow only through actions and selectors; where its state lives is a separate, engineer's-judgment decision** — three sanctioned shapes in [flow-state-model.md → extending a flow](flow-state-model.md#extending-a-flow--one-coupling-rule-three-state-shapes).

**5. Re-entry is replay; entry effects must be idempotent.** (ADR-0007, ADR-0008)
`flowStart` replays the whole flow (reset to `steps[0]`, clear data); `flowSetCurrent({step})` re-enters one step. Both re-fire the entry listeners matched on `isAnyOf(flowStart, flowSetCurrent)` — that re-firing *is* the retry. There is no separate retry/replay action. Because a step stays mounted for the journey's life, "start" work must key on activation and be safe to run again. See [flow-components.md → mount-once / start-on-activation](flow-components.md#mount-once--start-on-activation).

**6. A new top-level state branch must pass the simplicity gate.** (ADR-0009)
Default answer is NO. A concern earns a branch only by *displacing* complexity, not by feeling cleaner. Derive, don't store — a value computable from existing state is a selector, not a branch. See [flow-state-model.md → the simplicity gate](flow-state-model.md#the-simplicity-gate).

## The Mental Model

```
flows.reducer.ts initialState     ← each flow declared literally: { status:'idle', steps: uniqueSteps([…]), currentStep:null, data:{} }
        │
        ▼
   flowNext (intent)  ─────────►  THE BRAIN (feature listener)
                                    switch (currentStep) → pure decide util → flowSetCurrent
        ▲                                 │
        │                                 ▼
   Step components  ◄──────────  currentStep changes → step self-gates (isActive) → renders a screen
   (under <FlowHost flowId>)
```

The engine never sits between the intent and the move on its own. The intent (`flowNext`) is inert; the brain reads `data[currentStep]`, decides, and commits the one move — always `flowSetCurrent` (or `flowDone`). No feature or reducer code writes `currentStep` except by dispatching `flowSetCurrent`; only the engine's own `flowStart` reset also sets it (to `steps[0]`). When a tap has more to say than "next" — it aborts running work, records why, or lands somewhere the brain must weigh — the component dispatches a domain-named interaction action and a step-guarded listener turns it into `flowNext`; the component never names a destination ([the-brain-listener.md → Trigger A′](the-brain-listener.md#the-linear-default-and-the-two-ways-to-advance)).

## The Eight Engine Actions

All carry a `flowId`. Defined once in `store/flows/flows.actions.ts` — never generated per journey.

| Action | Kind | What the reducer does |
|---|---|---|
| `flowStart` | reducer-backed | reset: `status='active'`, `currentStep=steps[0]`, `data={}` (replay discards intake; a step that needs a starting value writes it on entry) |
| `flowSetCurrent` | reducer-backed | **the sole writer of `currentStep` for in-flow moves** (only `flowStart`'s reset also sets it) — validates `steps.includes(step)`, then sets it, nothing else |
| `setStepData` | reducer-backed | merge `patch` into `data[step ?? currentStep]` (step-scoped intake) |
| `flowDone` | reducer-backed | flip `status='completed'` (leaves `currentStep` set — see gotcha) |
| `flowCancel` | reducer-backed | flip `status='cancelled'` |
| `flowNext` | **intent** (no reducer) | nothing — the brain reacts and commits |
| `flowBack` | **intent** (no reducer) | nothing — the brain reacts and commits |
| `flowGoto` | **intent** (no reducer) | nothing — the brain reacts and commits |

> **Gotcha — `flowDone` leaves `currentStep` set.** A finished flow still has a live `currentStep` and stays mounted/visible. Consumers MUST read `status`, never the presence of `currentStep`, to know a flow is done (ADR-0008).

> **Gotcha — `flowGoto` and `flowBack` have no free behaviour.** They are inert intents like `flowNext`. `useFlow` exposes `goTo`/`back`, but dispatching them is a no-op until the feature brain adds a case. `flowBack` in the reference brain is positional (`prevStep`) with no history stack; path-aware back is the brain's job if the feature wants it.

## Canonical File Layout

```
src/store/flows/                 # the generic engine — plumbing, NO listeners, edited per-feature ONLY to declare a flow
├── flows.actions.ts             # the engine actions, defined once
├── flows.reducer.ts             # initialState declares every flow literally; flowSetCurrent is sole currentStep writer
├── flows.selectors.ts           # selectFlow / selectCurrentStep / selectFlowStatus / selectStepData …
├── flows.helpers.ts             # uniqueSteps (declaration guard) + pure stepIndex / nextStep (positional)
├── flows.hooks.ts               # useFlow + useFlowStep (the two binding hooks)
└── types.ts                     # FlowInstance, FlowsState, payloads

src/store/<feature>/             # one journey's Redux parts — types, actions, reducer, selectors, listener, api. Nothing else.
├── types.ts                     # FLOW_ID, the STEP as-const map, any step→domain bridge (isInteractiveCheck), R2 state + payloads
├── <feature>.listener.ts        # the listener that decides every move (the "brain" — a role, not a file suffix)
├── <feature>.{actions,reducer,selectors}.ts   # ONLY when the feature has R2 state
└── api/<verb><Thing>.ts         # the feature's I/O (probes, requests) — called from the listener only

src/lib/utils/<feature>/         # pure decision utils (no Redux, independently testable): decide.ts, resume.ts, …

src/components/<Feature>/        # the view
├── <Feature>.tsx                # the journey: <FlowHost flowId> listing named step components — the JSX IS the step list
├── <Step>Step/<Step>Step.tsx    # per-step component; self-gates with if (!isActive) return null
└── types.ts                     # only when a component owns a type; step props are StepViewProps { flowId, step }
```

There is no `<feature>.definition.ts` and no `<feature>.brain.ts`. The step list lives in the reducer's initial state so it reads off the page; the brain is the listener, named `<feature>.listener.ts` like every other branch's. Wire the journey in at the root: declare it in `initialState.byId` in `flows.reducer.ts` (wrapped in `uniqueSteps`) and append its listener to `listeners: Listener[][]` in `listener.ts`. A journey isn't live until both are there. Full walkthrough: [creating-a-flow.md](creating-a-flow.md).

> **Portability (ADR-0006).** Store-side wiring imports a feature's reducer/listener by its **narrowest** module path, never a barrel — a barrel re-exports components that import `@/store`, closing an ESM cycle. Barrels are host-side only. The build (`tsc` + `vite build`) is the cycle gate.

## Two Altitudes — Demonstrated In-Repo vs Contract-Only

The model has two altitudes, and a reader who greps the wrong repo will be confused. `[contract-only]` is a **provenance tag, not a "secondary" signal** — contract-only patterns are first-class parts of the model; the tag only says which repo holds the proving code. **Mark which is which whenever you teach a pattern.**

| Pattern | Where it is proven | Skill treats it as |
|---|---|---|
| Engine + brain, step-as-milestone, R1 intake, R2 = a derived report, sub-flow via `flowStart`/`flowDone`, positional back, retry via re-entry | **`ripe-flows`** (`troubleshoot` + `cleanup`) | demonstrated in-repo — code examples are transcribed from real files |
| Owned R2 domain reducer (a `TestAtom`), the three extension-state shapes, one-way projection (MIRROR-OUT), gates-as-steps (Doorman/Switchboard over `runGate`), owner-altitude preflight, `useTestLifecycle` start-latch, the engine-level default-advance listener, per-step URLs, the renovation discipline | **`@mcesystems/dtl`** and the **VFUK trade-in** renovation (`mce`, branch `feature/PROD-59385-vfuk-tradein-ripe-renovation`) | **`[contract-only]`** — first-class, but the proving code is not in `ripe-flows`; sections cite exact production files. |

> **Declared, not generated.** Older code (`ripe-flows`, `@mcesystems/dtl`, the VFUK renovation) seeds flows through a `createFlowsReducer(definitions)` factory fed by `<feature>.definition.ts` files. The MCE trade-in app (`mce`, `src/clients/mce/tradein`, ticket 03 of PROD-60389) replaced that with a literal `initialState` in `flows.reducer.ts` — same reducer cases, no factory, no definition objects — because a generating function obfuscates declarative logic: the step order should read off the page. **That is the shape this skill teaches.** A `createFlowsReducer` or `.definition.ts` in a new app is an audit finding (`FLOWS-M-GENERATED-FLOWS`). Where a reference below still names the older shape, it is tagged `[contract-only]` and the code is transcribed from the older repo.

> **The blueprint visual model is a design aid, not a generated view.** There is no transition table, so a visualizer can drift from the code — the brain is always the source of truth for how a journey moves.

## Common Tasks

| What you're doing | Read |
|---|---|
| Building a new flow feature end-to-end (declare → utils → listener → steps → journey → wiring) | [creating-a-flow.md](creating-a-flow.md) |
| Renovating a legacy config-driven wizard into code (Stage-1 behaviour-preserving) | [renovating-a-flow.md](renovating-a-flow.md) |
| Writing or extending the brain (routing, guards, async intake, retry, sub-flow resume) | [the-brain-listener.md](the-brain-listener.md) |
| Deciding what state a flow needs (R1 vs R2, the simplicity gate) | [flow-state-model.md](flow-state-model.md) |
| Extending a flow with feature logic/state — an owned branch, projection, or the engine's data bag | [flow-state-model.md → extending a flow](flow-state-model.md#extending-a-flow--one-coupling-rule-three-state-shapes) |
| Giving each step its own URL, wiring browser back/forward | [flow-components.md → every step gets a URL](flow-components.md#every-step-gets-a-url--the-url-is-a-projection-contract-only) |
| Adding a precondition — permission, hardware toggle, network check | [gates-and-preflight.md](gates-and-preflight.md) |
| Building the host and step components (FlowHost, self-gating, mount-once) | [flow-components.md](flow-components.md) |
| Testing a flow (behavioural store test, the settle loop, re-entry coverage) | [flow-tests.md](flow-tests.md) |
| Scaffolding the store branch / component shape the flow reuses | `building-ripe-store`, `building-ripe-components` |

## Where Flows Sit in the Ripe Skill Family

A flow is not a new architecture — it is store + components + routing arranged into a journey. This skill teaches the *arrangement*; the siblings teach the parts.

- **`building-ripe-store`** — the brain is a `Listener[]`; the engine is a reducer branch; an R2 feature branch is an ordinary branch. Everything in that skill (the `Listener` interface, `getState()`, error handling, cross-branch placement, `createSelector`) applies unchanged. This skill adds only what's flow-specific.
- **`building-ripe-components`** — step components follow the standard anatomy (SETUP → EARLY EXIT → RETURN → HELPERS), semantic styled components, no `useState`, no data-fetching. `if (!isActive) return null` is just the early-exit guard.
- **`building-ripe-routing`** — a flow starts from a route: the `setLocation` bridge lets the brain start the seeded flow if idle. **By default, every screen / step / logical location gets its own URL**: one pure format constructs the URL from flow state (the URL is a one-way *projection* of flow state, never a second source of truth), and given that, browser back/forward resolve to flow intents (`popstate` → `flowBack`). See [flow-components.md → every step gets a URL](flow-components.md#every-step-gets-a-url--the-url-is-a-projection-contract-only). The *generic reusable* adapter (ADR-0002) remains unbuilt — a bespoke per-app sync hook is the proven shape.
- **`building-ripe-tests`** — owns the harness, reducer/listener/component test shapes. [flow-tests.md](flow-tests.md) covers only the flow-specific patterns and leans on that skill for the rest.
- **`ripe-init`** — scaffolds the store root (`store.ts`, `listener.ts`, `types.ts`). The flow engine is added on top; it is not part of the base scaffold today.
- **`ripe-audit`** — audits a flow with the same store/component checklists plus `checklists/flows.md`: the engine untouched, flows declared literally (no definition/brain files), decisions in the listener, step props `{ flowId, step }`.

## Workflow Checklist

```
Flow Feature Progress:
- [ ] Decide the journey with the owner: the step list (milestones), the branches, what state each step produces (Step 0 — a human decision)
- [ ] flows.reducer.ts — declare the flow in initialState.byId: { status:'idle', steps: uniqueSteps([…]), currentStep:null, data:{} } (milestones only, no meta)
- [ ] store/<feature>/types.ts — FLOW_ID, the STEP as-const map, the step→domain bridge if any
- [ ] lib/utils/<feature>/decide.ts — pure decision utils (routeFromX, afterX, screen selection)
- [ ] <feature>.listener.ts — the brain (route-start, flowNext switch, entry-intake, retry, conclude); I/O behind store/<feature>/api/
- [ ] R2? Only if there's a derived conclusion or domain state that isn't intake — then add the branch
- [ ] components/<Feature>/ — host (<FlowHost flowId> + named steps) + one self-gating component per step
- [ ] Gates? Add a gate step before the step it guards (see gates-and-preflight.md)
- [ ] Routed app? Each step/screen gets its own URL via one pure state→URL format; popstate → flow intents (see flow-components.md)
- [ ] Register: the flow's entry in flows.reducer.ts initialState; the listener appended to listeners: Listener[][] in listener.ts
- [ ] Tests — reducer test asserting the literal step list (the step-order test) + behavioural store test through makeTestHarness (branch/skip/guard/retry/sub-flow/cancel/back) + re-entry coverage
- [ ] Verify: the engine (store/flows/) was NOT edited beyond the flow's initialState entry
- [ ] Verify: no feature/reducer code writes currentStep except by dispatching flowSetCurrent (only the engine's flowStart reset also sets it)
- [ ] Verify: entry effects are idempotent (safe to re-run on re-entry)
- [ ] Verify: consumers read status, not the presence of currentStep, to detect "done"
```

**Import aliasing:** Use `@` for `src/` (e.g. `@/store/flows/flows.hooks`, `@/lib/utils/troubleshoot/decide`).

## References

| Document | When to read | What's covered |
|---|---|---|
| [creating-a-flow.md](creating-a-flow.md) | Building a flow end-to-end | Step 0 (human decision), the file-by-file walkthrough (declare → utils → listener → R2 → components → wiring), linear vs branching |
| [renovating-a-flow.md](renovating-a-flow.md) | Converting a legacy config-driven wizard, behaviour-preserving | The Stage-1 loop, per-dimension step resolution, the skip-predicate inversion, user-skip vs gate-skip, quirk reproduction, parity verification |
| [the-brain-listener.md](the-brain-listener.md) | Writing the listener that decides transitions | The brain's anatomy, the `switch(currentStep)` pattern, guards, async intake, retry, sub-flow resume, the advance trigger, the inert-vs-disruptive guard rule |
| [flow-state-model.md](flow-state-model.md) | Deciding what state a flow needs / extending a flow | R1/R2 boundary test, the coupling rule + three extension-state shapes, one-way projection, the simplicity gate |
| [gates-and-preflight.md](gates-and-preflight.md) | Adding a precondition to a journey | Gates-as-steps, the `runGate` contract, gate vs verdict, owner-altitude placement `[contract-only]` |
| [flow-components.md](flow-components.md) | Building the host + step views, or wiring per-step URLs | FlowHost, self-gating, step-as-`(data)→screen`, mount-once/start-on-activation + the headline bug, the two-piece conductor, sub-flows, URL-as-projection |
| [flow-tests.md](flow-tests.md) | Testing a flow | The behavioural store test, the settle loop, re-entry coverage, sub-flow-via-`flowDone`, pure-util tests |
| `building-ripe-store` skill | The listener/reducer/selector rules the flow reuses | Load it for anything about the brain-as-listener or an R2 branch |
| `building-ripe-tests` skill | The harness and general test shapes | Load it alongside flow-tests.md |
