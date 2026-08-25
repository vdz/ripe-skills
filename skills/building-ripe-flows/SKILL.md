---
name: building-ripe-flows
description: Builds sequential user journeys — wizards, diagnostics, eligibility/trade-in flows — on The Ripe Method's flow engine. Use when creating a flow feature, adding steps, writing the brain listener that decides transitions, extending a flow with feature logic or its own state branch, adding gates or preconditions, composing sub-flows, giving steps URLs, testing a flow, or renovating a legacy config-driven wizard into code. Builds on building-ripe-store and building-ripe-components; pair with building-ripe-tests for flow tests.
---

# Building Ripe Flows

A flow is a named journey through an ordered set of narrative steps — a wizard, a diagnostic sequence, a trade-in eligibility walk. Ripe runs every flow on one generic engine and expresses each journey as code, not config.

## Cardinal Rules

These are non-negotiable. Every other section assumes them. Each cites the governing ADR in the canonical `ripe-flows` repo (`docs/adr/`).

**1. The engine stays deliberately thin; the feature's brain drives.** (ADR-0001, ADR-0003)
The engine (`store/flows/`) owns navigation state + intake. Moving the journey forward is the feature's job: branches, skips, guards ("may I leave?"), and completion ("am I done?") are decided by the feature's listeners — **the brain** — with each decision delegated to a pure function in `modules/`, logic dispersed intuitively across the feature's modules. The engine *may* carry one convenience — a default linear-advance listener for trivially linear flows (`[contract-only]`, canonical ships none) — but **engine listeners must stay simple: resist the constant pressure for them to become the drivers.** Where advance logic lives is ultimately the engineer's call; the default lean is the brain. Read one brain to know how a journey moves; read one step component to know what it shows. See [the-brain-listener.md](the-brain-listener.md).

**2. `flowSetCurrent` is the sole writer of `currentStep` for in-flow moves.**
There are exactly eight `flowId`-carrying actions, defined *once* in the engine — never per-flow. `flowNext` / `flowBack` / `flowGoto` are inert intents: nothing moves until the brain reacts and commits via `flowSetCurrent`. The engine literally cannot advance itself. The one other writer is `flowStart`'s reset, which sets `currentStep` to `steps[0]`; no feature or reducer code ever writes it directly. See [the eight engine actions](#the-eight-engine-actions).

**3. A step is a narrative milestone, not a screen.** (ADR-0003)
A `FlowDefinition`'s `steps` is an ordered array of milestone ids and nothing else — no transitions, guards, meta, or components. Within one step the component renders whichever *screen* fits the step's data. A step component is a `(step-data) → screen` function; the engine never models screens. See [flow-components.md](flow-components.md).

**4. R1 intake vs R2 conclusions — and one coupling rule for extension state.** (ADR-0004, ADR-0005)
The engine holds journey-altitude, step-scoped **intake** (`flows.byId[id].data[stepId]`, written live via `setStepData`) — that is R1. A feature earns its own reducer only for **conclusions or domain state that is not step intake** — that is R2. Most features carry no reducer at all. When a flow *is* extended with feature logic, one rule governs: **a feature couples to a flow only through actions and selectors; where its state lives is a separate, engineer's-judgment decision** — three sanctioned shapes in [flow-state-model.md → extending a flow](flow-state-model.md#extending-a-flow--one-coupling-rule-three-state-shapes).

**5. Re-entry is replay; entry effects must be idempotent.** (ADR-0007, ADR-0008)
`flowStart` replays the whole flow (reset to `steps[0]`, clear data); `flowSetCurrent({step})` re-enters one step. Both re-fire the entry listeners matched on `isAnyOf(flowStart, flowSetCurrent)` — that re-firing *is* the retry. There is no separate retry/replay action. Because a step stays mounted for the journey's life, "start" work must key on activation and be safe to run again. See [flow-components.md → mount-once / start-on-activation](flow-components.md#mount-once--start-on-activation).

**6. A new top-level state branch must pass the simplicity gate.** (ADR-0009)
Default answer is NO. A concern earns a branch only by *displacing* complexity, not by feeling cleaner. Derive, don't store — a value computable from existing state is a selector, not a branch. See [flow-state-model.md → the simplicity gate](flow-state-model.md#the-simplicity-gate).

## The Mental Model

```
FlowDefinition { id, steps }      ← pure data, seeded into engine state at store-init
        │
        ▼
   flowNext (intent)  ─────────►  THE BRAIN (feature listener)
                                    switch (currentStep) → pure decide util → flowSetCurrent
        ▲                                 │
        │                                 ▼
   Step components  ◄──────────  currentStep changes → step self-gates (isActive) → renders a screen
   (under <FlowHost flowId>)
```

The engine never sits between the intent and the move on its own. The intent (`flowNext`) is inert; the brain reads `data[currentStep]`, decides, and commits the one move — always `flowSetCurrent` (or `flowDone`). No feature or reducer code writes `currentStep` except by dispatching `flowSetCurrent`; only the engine's own `flowStart` reset also sets it (to `steps[0]`).

## The Eight Engine Actions

All carry a `flowId`. Defined once in `store/flows/flows.actions.ts` — never generated per journey.

| Action | Kind | What the reducer does |
|---|---|---|
| `flowStart` | reducer-backed | reset: `status='active'`, `currentStep=steps[0]`, `data={}` (replay discards intake — `initialData` seeds only at store-init, never here) |
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
src/store/flows/                 # the generic engine — plumbing, NO listeners, never edited per-feature
├── flows.actions.ts             # the 8 actions
├── flows.reducer.ts             # createFlowsReducer(definitions) — flowSetCurrent is sole currentStep writer
├── flows.selectors.ts           # selectFlow / selectCurrentStep / selectFlowStatus / selectStepData …
├── flows.helpers.ts             # pure nextStep / prevStep (positional)
├── flows.hooks.ts               # useFlow + useFlowStep (the two binding hooks)
└── types.ts                     # FlowDefinition, FlowInstance, FlowsState, payloads

src/store/<feature>/             # one journey's Redux parts
├── <feature>.definition.ts      # { id, steps } — pure data
├── <feature>.listener.ts        # THE BRAIN (a Listener[])
└── <feature>.{actions,reducer,selectors,types}.ts   # ONLY when the feature has R2 state

src/modules/<feature>.decide.ts  # pure decision utils (no Redux, independently testable)
src/modules/<feature>.scan.ts    # mocked async probes returning promises (service-module boundary)

src/components/<Feature>/        # the view
├── <Feature>.tsx                # the host: <FlowHost flowId> listing named step components
├── <Step>Step.tsx              # per-step component; self-gates with if (!isActive) return null
└── types.ts                     # StepProps { flowId }
```

Wire the journey in at the root: add its definition to `createFlowsReducer([...])` in `store.ts` (baked into initial state at boot) and its brain to the listener registration in `listener.ts`. A journey isn't live until both are registered. Full walkthrough: [creating-a-flow.md](creating-a-flow.md).

> **Portability (ADR-0006).** Store-side wiring imports a feature's reducer/listener by its **narrowest** module path, never a barrel — a barrel re-exports components that import `@/store`, closing an ESM cycle. Barrels are host-side only. The build (`tsc` + `vite build`) is the cycle gate.

## Two Altitudes — Demonstrated In-Repo vs Contract-Only

The model has two altitudes, and a reader who greps the wrong repo will be confused. `[contract-only]` is a **provenance tag, not a "secondary" signal** — contract-only patterns are first-class parts of the model; the tag only says which repo holds the proving code. **Mark which is which whenever you teach a pattern.**

| Pattern | Where it is proven | Skill treats it as |
|---|---|---|
| Engine + brain, step-as-milestone, R1 intake, R2 = a derived report, sub-flow via `flowStart`/`flowDone`, positional back, retry via re-entry | **`ripe-flows`** (`troubleshoot` + `cleanup`) | demonstrated in-repo — code examples are transcribed from real files |
| Owned R2 domain reducer (a `TestAtom`), the three extension-state shapes, one-way projection (MIRROR-OUT), gates-as-steps (Doorman/Switchboard over `runGate`), owner-altitude preflight, `useTestLifecycle` start-latch, the engine-level default-advance listener, per-step URLs, the renovation discipline | **`@mcesystems/dtl`** and the **VFUK trade-in** renovation (`mce`, branch `feature/PROD-59385-vfuk-tradein-ripe-renovation`) | **`[contract-only]`** — first-class, but the proving code is not in `ripe-flows`; sections cite exact production files. |

> **Doc/code drift to teach around.** ADR-0001 and the design HTML reference a `seedFlows` helper + `preloadedState`; the actual code seeds via `createFlowsReducer(definitions)` building initial state inline, and `flows.helpers.ts` holds only `nextStep`/`prevStep`. **Teach the code's shape, not the docs' wording.**

> **Direction of travel — declared over generated.** The `createFlowsReducer(...)` factory is the *current seam* and a stopgap: a generating function obfuscates declarative logic. The intended end-state is a flows reducer expanded and codified in the code files — declared explicitly, so the flow's shape reads off the page. Prefer the declared form when a project can afford it.

> **The blueprint visual model is a design aid, not a generated view.** There is no transition table, so a visualizer can drift from the code — the brain is always the source of truth for how a journey moves.

## Common Tasks

| What you're doing | Read |
|---|---|
| Building a new flow feature end-to-end (definition → brain → utils → steps → host → wiring) | [creating-a-flow.md](creating-a-flow.md) |
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
- **`ripe-audit`** — audits a flow with the same store/component checklists; a flow introduces no new audit rules beyond "does the brain hold the decisions and the reducer stay dumb?".

## Workflow Checklist

```
Flow Feature Progress:
- [ ] Decide the journey with the owner: the step list (milestones), the branches, what state each step produces (Step 0 — a human decision)
- [ ] <feature>.definition.ts — { id, steps } (milestones only, no meta)
- [ ] modules/<feature>.decide.ts — pure decision utils (routeFromX, afterX, screen selection)
- [ ] <feature>.listener.ts — THE BRAIN (route-start, flowNext switch, entry-intake, retry, conclude)
- [ ] R2? Only if there's a derived conclusion or domain state that isn't intake — then add the branch
- [ ] components/<Feature>/ — host (<FlowHost flowId> + named steps) + one self-gating component per step
- [ ] Gates? Add a gate step before the step it guards (see gates-and-preflight.md)
- [ ] Routed app? Each step/screen gets its own URL via one pure state→URL format; popstate → flow intents (see flow-components.md)
- [ ] Register: definition in createFlowsReducer([...]) in store.ts; brain in listener.ts
- [ ] Tests — behavioural store test (branch/skip/guard/retry/sub-flow/cancel/back) + re-entry coverage
- [ ] Verify: the engine (store/flows/) was NOT edited
- [ ] Verify: no feature/reducer code writes currentStep except by dispatching flowSetCurrent (only the engine's flowStart reset also sets it)
- [ ] Verify: entry effects are idempotent (safe to re-run on re-entry)
- [ ] Verify: consumers read status, not the presence of currentStep, to detect "done"
```

**Import aliasing:** Use `@` for `src/` (e.g. `@/store/flows/flows.hooks`, `@/modules/troubleshoot.decide`).

## References

| Document | When to read | What's covered |
|---|---|---|
| [creating-a-flow.md](creating-a-flow.md) | Building a flow end-to-end | Step 0 (human decision), the file-by-file walkthrough, linear vs branching |
| [renovating-a-flow.md](renovating-a-flow.md) | Converting a legacy config-driven wizard, behaviour-preserving | The Stage-1 loop, per-dimension step resolution, the skip-predicate inversion, user-skip vs gate-skip, quirk reproduction, parity verification |
| [the-brain-listener.md](the-brain-listener.md) | Writing the listener that decides transitions | The brain's anatomy, the `switch(currentStep)` pattern, guards, async intake, retry, sub-flow resume, the advance trigger, the inert-vs-disruptive guard rule |
| [flow-state-model.md](flow-state-model.md) | Deciding what state a flow needs / extending a flow | R1/R2 boundary test, the coupling rule + three extension-state shapes, one-way projection, the simplicity gate |
| [gates-and-preflight.md](gates-and-preflight.md) | Adding a precondition to a journey | Gates-as-steps, the `runGate` contract, gate vs verdict, owner-altitude placement `[contract-only]` |
| [flow-components.md](flow-components.md) | Building the host + step views, or wiring per-step URLs | FlowHost, self-gating, step-as-`(data)→screen`, mount-once/start-on-activation + the headline bug, the two-piece conductor, sub-flows, URL-as-projection |
| [flow-tests.md](flow-tests.md) | Testing a flow | The behavioural store test, the settle loop, re-entry coverage, sub-flow-via-`flowDone`, pure-util tests |
| `building-ripe-store` skill | The listener/reducer/selector rules the flow reuses | Load it for anything about the brain-as-listener or an R2 branch |
| `building-ripe-tests` skill | The harness and general test shapes | Load it alongside flow-tests.md |
