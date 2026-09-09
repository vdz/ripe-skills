# The Brain — the Feature Listener That Decides

## When to read this
- Writing the listener that moves a flow
- Adding a branch, skip, or guard to an existing flow
- Wiring async intake that runs when a step is entered
- Adding retry, a sub-flow resume, or a conclude step
- Debugging "my flow advanced when it shouldn't have" / "it won't advance"

## Contents
- What the brain is
- The anatomy: the seven listener kinds
- The routing brain: `switch(currentStep)` → pure util → `flowSetCurrent`
- Guards are `return undefined`
- The linear default, and the two ways to advance
- Async intake on entry
- Retry is re-entry
- Sub-flow resume on the child's `flowDone`
- Conclude and cancel
- The inert-vs-disruptive guard rule `[contract-only]`
- Re-entry is replay — the contract
- Common mistakes

This is the load-bearing skill file. Everything a journey *does* lives here; the reducer stays dumb and the component stays passive. It builds directly on [building-ripe-store → listeners.md](../building-ripe-store/listeners.md) — a brain is a `Listener[]`, subject to every rule there (the `Listener` interface, `getState()`, cross-branch placement, error handling). This file adds only what's flow-specific.

## What the Brain Is

**The brain is the feature's listeners that own the flow's transitions.** It reacts to the inert intents (`flowNext`, `flowBack`, `flowGoto`), `switch`es on `currentStep`, and delegates each case to a pure decision function in `lib/utils/<feature>/`. Branching, skipping, "may I leave this step?", and "am I done?" all live here — moving-forward logic dispersed across the feature's listeners and pure utils, placed where a reader would intuitively look, while the engine stays deliberately thin (cardinal rule #1).

Why a listener and not a declarative transition table: logic lives in listeners (the Ripe tenet), and a transition table would split behaviour between a data graph and code and reintroduce the config-hell the project escapes (ADR-0003). The payoff is greppability — one file per feature tells you how the whole journey moves.

Every effect that reacts to a **shared flow intent** — `flowNext`, `flowBack`, `flowStart`, `flowSetCurrent`, `flowCancel` — guards its own `flowId` first, because those actions fan out to *every* flow's brain:

```typescript
const FLOW_ID = TROUBLESHOOT_FLOW_ID; // from store/troubleshoot/types.ts
const isMine = (flowId: string) => flowId === FLOW_ID;
// … inside every effect that reacts to a shared flow intent:
if (!flowNext.match(action) || !isMine(action.payload.flowId)) return;
```

The effect receives an `UnknownAction` (see the `Listener` union in `building-ripe-store`), so the creator's own `.match` narrows it before the payload is read — no `action.payload as …`. `api.getState()` is already typed to the app's `RootState` through `AppStartListening`; never write `api.getState() as RootState`.

Two kinds of listener guard *differently* — pasting `isMine` there is a bug:
- **Triggered by a non-flow action.** Route-start (`setLocation`) and retry (`rescan`) carry no `flowId`; they select the flow by its known id instead (see #1 and #5 below).
- **Filtered to a *child* flow.** Sub-flow resume matches the child's `flowDone` with `payload.flowId !== 'cleanup'` — the *opposite* of `isMine` (see #6 below).

## The Anatomy: the Seven Listener Kinds

`troubleshoot.listener.ts` is the reference. A rich brain has up to seven listeners; a linear flow has one or two. Each is a normal entry in the feature's `Listener[]`:

| # | Listener | Trigger | Job |
|---|---|---|---|
| 1 | route-start | `setLocation` | `flowStart` the seeded flow if idle |
| 2 | **the routing brain** | `flowNext` | `switch(currentStep)` → decide → `flowSetCurrent` |
| 3 | positional back | `flowBack` | `flowSetCurrent(prevStep(flow))` |
| 4 | async intake on entry | `isAnyOf(flowStart, flowSetCurrent)` | run a step's probe, write the result via `setStepData`, maybe auto-advance |
| 5 | retry | a feature action (`rescan`) | re-dispatch `flowSetCurrent` to re-fire the entry probe |
| 6 | sub-flow resume | `isAnyOf(flowDone)` filtered to the child | read the child's result, advance the parent |
| 7 | conclude | `isAnyOf(flowStart, flowSetCurrent)` on the terminal step | dispatch the R2 conclusion + `flowDone` |

Plus a cancel listener when the flow owns a child (below). Not every flow needs all seven; a plain linear wizard is just #1 + a linear #2.

## The Routing Brain

The one listener that turns an intent into a move. It reads the latest intake, delegates the decision to a pure function in `lib/utils/<feature>/`, and commits the single move — always `flowSetCurrent`.

```typescript
{
	actionCreator: flowNext,
	effect: (action, api) => {
		if (!flowNext.match(action) || !isMine(action.payload.flowId)) return;
		const flow = selectFlow(api.getState(), FLOW_ID);
		if (!flow) return;
		const triage = flow.data.triage;
		const go = (step: string | null) => step && api.dispatch(flowSetCurrent({ flowId: FLOW_ID, step }));
		switch (flow.currentStep) {
			case 'triage':
				return go(routeFromTriage(triage));            // branch
			case 'connectivity':
				return flow.data.connectivity?.connected
					? go(afterSubsystem('connectivity', triage))
					: undefined;                                 // guard: stay
			case 'battery':
			case 'storage':
			case 'update':
				return go(afterSubsystem(flow.currentStep, triage)); // skip when focused
			default:
				return go(nextStep(flow));                     // linear positional default
		}
	},
},
```

Rules that make this readable:

- **The `switch` reads `currentStep`; each case delegates to a pure util.** `routeFromTriage`, `afterSubsystem` are in `lib/utils/troubleshoot/decide.ts` and take plain data, return a step id. No Redux in the decision, so it's unit-testable on its own.
- **The one move is always `flowSetCurrent`.** The `go` helper is the only writer. `flowNext` never writes state itself.
- **`nextStep(flow)` is the linear fallback** — a pure positional helper from the engine. Cases that aren't special fall through to it.

## Guards Are `return undefined`

A guard means "the answer to *may I advance?* is no — stay here." Express it by returning without dispatching:

```typescript
case 'connectivity':
	return flow.data.connectivity?.connected
		? go(afterSubsystem('connectivity', triage))
		: undefined; // no dispatch → currentStep unchanged → user stays on the step
```

The user presses Next, the brain runs, decides "not yet", dispatches nothing. `currentStep` is unchanged, the step re-renders, the guard holds until `data.connectivity.connected` becomes true. There is no separate "blocked" state — staying *is* the block. A gate is the same idea lifted into its own step; see [gates-and-preflight.md](gates-and-preflight.md).

## The Linear Default, and the Two Ways to Advance

The mechanism is always `flowSetCurrent`. The **trigger** is a feature choice.

**Trigger A — the generic `flowNext` intent.** A "Next" button, a linear wizard, a gate that satisfied itself. The brain's `flowNext` case computes `nextStep(flow)` and commits. The minimal linear brain is six lines (`cleanup.listener.ts`):

```typescript
{
	actionCreator: flowNext,
	effect: (action, api) => {
		if (!flowNext.match(action) || action.payload.flowId !== FLOW_ID) return;
		const flow = selectFlow(api.getState(), FLOW_ID);
		const next = flow ? nextStep(flow) : null;
		if (next) api.dispatch(flowSetCurrent({ flowId: FLOW_ID, step: next }));
	},
},
```

**Trigger B — a domain event.** `[contract-only]` In `@mcesystems/dtl`, the diagnostics brain does *not* use `flowNext`; a step advances on its own domain action `testDone`, and the brain computes `nextStep(flow)` and commits `flowSetCurrent` (or `flowDone` at the end). The trigger is "the test concluded", not "the user clicked next" — but the mechanism is identical. The brain couples to the step through its *events*, never by reading the verdict back out of state.

> **`[contract-only]` engine-level default advance — legitimate, but keep it this small.** Production `@mcesystems/dtl` adds an engine-level `flows.listener.ts` (`mce-dtl/src/lib/flows/flows.listener.ts:11-22`) that maps `flowNext` → linear advance (`indexOf + 1` → `flowSetCurrent`, else `flowDone`) for *every* flow, so trivially linear flows and gates need no brain at all; VFUK generalizes the same idea into composable brain factories (`makeLinearBrain`/`makeGotoListener`, `mce .../store/flows/flows.brain.ts`). The canonical `ripe-flows` engine ships no listener, and the MCE trade-in app deleted the carried-over generic brain outright: a linear-advance listener no feature calls is dead code, and a `flows.brain.ts` beside the engine is a second decision file (`FLOWS-M-GENERATED-FLOWS`). **Where advance logic lives is the engineer's call — the engine default is enough only for very simple cases; otherwise the feature's listeners dictate movement.** Whichever a project has, the engine listener must stay this simple — it maps one intent to the sole writer and decides nothing else; resist growing it into the driver.

## Async Intake on Entry

A step that must fetch/probe when entered does it in a **listener**, not a component effect — the engine stays synchronous; only the listener awaits. Match on `isAnyOf(flowStart, flowSetCurrent)` (both entry paths) and `switch` on the freshly-set current step.

```typescript
{
	matcher: isAnyOf(flowStart, flowSetCurrent),
	effect: async (action, api) => {
		if (!isAnyOf(flowStart, flowSetCurrent)(action) || !isMine(action.payload.flowId)) return;
		const step = selectCurrentStep(api.getState(), FLOW_ID);
		if (step === 'connectivity') {
			api.dispatch(setStepData({ flowId: FLOW_ID, step, patch: { scanning: true } }));
			const { signal } = await scanConnectivity();
			api.dispatch(setStepData({ flowId: FLOW_ID, step, patch: { scanning: false, signal } }));
		} else if (step === 'update') {
			api.dispatch(setStepData({ flowId: FLOW_ID, step, patch: { checking: true } }));
			const { current } = await checkFirmware();
			api.dispatch(setStepData({ flowId: FLOW_ID, step, patch: { checking: false, current } }));
			if (current) api.dispatch(flowNext({ flowId: FLOW_ID })); // already current → skip
		}
	},
},
```

- **The probe lives in the branch's `api/`** (`store/troubleshoot/api/scanConnectivity.ts`) and is `vi.mock`-ed in tests. It is I/O, so it is an api function called from the listener — see [building-ripe-store → api.md](../building-ripe-store/api.md). A deep implementation behind it (a bridge, a codec) sits in `lib/modules/`.
- **The component renders a loading screen off `data.scanning` / `data.checking`** — it never awaits.
- **The entry listener may auto-advance** (the `update` step dispatches `flowNext` when firmware is already current). That's a decision, so it's fine in the brain.
- **Real async listeners must re-check flow state after every `await`.** `[contract-only]` In VFUK, the battery listener re-checks "status still active? still the current step? verdict not already recorded?" after each await and holds a synchronous in-flight lock, because the recorded-verdict guard alone leaves a pre-await double-dispatch window. For simple probes like the above, re-checking on the next entry is enough; for anything that concludes or advances after an await, add the post-await re-check.

## Retry Is Re-entry

There is no retry action. To re-run a step's start work, **re-enter the step** — dispatch `flowSetCurrent` for the current step, which re-fires the entry listener above:

```typescript
{
	actionCreator: rescan,
	effect: (_action, api) => {
		const step = selectCurrentStep(api.getState(), FLOW_ID);
		// only the async steps have a probe to re-fire; re-entering anything else is a no-op
		if (step === 'connectivity' || step === 'storage' || step === 'update') {
			api.dispatch(flowSetCurrent({ flowId: FLOW_ID, step }));
		}
	},
},
```

Re-dispatching `flowSetCurrent({ step: currentStep })` re-commits the same step, re-firing the `isAnyOf(flowStart, flowSetCurrent)` entry listener, which re-runs the probe and overwrites the step's data. This only works because the entry listener is **idempotent** — it holds no latch, it just overwrites `data[step]`. `[contract-only]` VFUK/DTL package both retry shapes as one brain-composed `rerun` action carrying no reducer logic: `rerun` with a step id → `flowSetCurrent` (re-enter one); `rerun` without → `flowStart` (replay all). See [re-entry is replay](#re-entry-is-replay--the-contract) below.

## Sub-flow Resume on the Child's `flowDone`

A sub-flow is a plain second flow — its own definition, brain, and step components — with **no nesting primitive** (see [flow-components.md → sub-flows](flow-components.md#sub-flows-are-plain-composition)). The parent launches it with `flowStart` and resumes on the child's `flowDone`:

```typescript
// parent brain: cleanup finished → record freed space, advance past storage
{
	actionCreator: flowDone,
	effect: (action, api) => {
		if (!flowDone.match(action) || action.payload.flowId !== 'cleanup') return; // filter to the child
		const child = selectFlow(api.getState(), 'cleanup');
		const freedGB = Number(child?.data.cleaning?.freedGB ?? 0);
		api.dispatch(setStepData({ flowId: FLOW_ID, step: 'storage', patch: { freedGB, cleaned: true } }));
		api.dispatch(flowNext({ flowId: FLOW_ID }));
	},
},
```

The child needs no R2 — its result lives in its own R1 step data (`child.data.cleaning.freedGB`), which the parent reads and folds into its own step data. Adding a sub-flow costs zero new engine primitives.

## Conclude and Cancel

**Conclude** fires on reaching the terminal step (matched via the entry listener), derives the R2 conclusion with a pure util, and finishes:

```typescript
{
	matcher: isAnyOf(flowStart, flowSetCurrent),
	effect: (action, api) => {
		if (!isAnyOf(flowStart, flowSetCurrent)(action) || !isMine(action.payload.flowId)) return;
		const flow = selectFlow(api.getState(), FLOW_ID);
		if (flow?.currentStep !== 'summary') return;
		api.dispatch(troubleshootConcluded(buildReport(flow.data))); // R2, derived by a pure util
		api.dispatch(flowDone({ flowId: FLOW_ID }));
	},
},
```

**Cancel** cascades to any in-progress child:

```typescript
{
	actionCreator: flowCancel,
	effect: (action, api) => {
		if (!flowCancel.match(action) || !isMine(action.payload.flowId)) return;
		const child = selectFlow(api.getState(), 'cleanup');
		if (child && child.status === 'active') api.dispatch(flowCancel({ flowId: 'cleanup' }));
	},
},
```

## The Inert-vs-Disruptive Guard Rule `[contract-only]`

*This is the single most important correctness rule in a brain that both writes step data and moves the cursor. Proven in `@mcesystems/dtl`'s diagnostics brain.*

Split every dispatch the brain makes into two kinds and guard them differently:

- **Inert writes** — `setStepData`. Step-scoped, they never move the cursor. **Always apply; no current-step guard.** A late/background/out-of-order result must still record its own step's data.
- **Disruptive moves** — `flowSetCurrent` / `flowDone`. They move the cursor. **Guard them** with `testId === currentStep && status === 'active'`, so a stale or background conclusion cannot phantom-advance the journey.

```typescript
// projection (inert) — no guard: record the outcome even for a background/late step
api.dispatch(setStepData({ flowId, step: testId, patch: { status, verdict } }));

// advance (disruptive) — guard: only the current step of an active flow may move the cursor
if (testId === currentStep && status === 'active') {
	api.dispatch(flowSetCurrent({ flowId, step: nextStep(flow)! }));
}
```

Put the guard on the *projection* and you drop legitimate late results; omit it on the *advance* and a stale `testDone` phantom-advances. The asymmetry is the rule: guard the cursor move only.

## Re-entry Is Replay — the Contract

`flowStart` + `flowSetCurrent` already express both re-run shapes; no new action is needed (ADR-0008):

- `flowStart` → replay the whole flow (reset to `steps[0]`, clear `data`).
- `flowSetCurrent({ step })` → re-enter one step (re-commit `currentStep`).

Both re-fire the entry listeners matched on `isAnyOf(flowStart, flowSetCurrent)`. **That re-firing is the retry.** The correctness of every replay/rerun depends entirely on those entry effects being idempotent — the listener form is idempotent by construction (it holds no latch; it overwrites `data[step]`). The *component-latch* form of start-on-activation is subtler and has a headline bug; that lives in [flow-components.md → mount-once / start-on-activation](flow-components.md#mount-once--start-on-activation), because it's a component-lifecycle concern. Prefer the listener form.

## Common Mistakes

### Deciding in the reducer or the component
The reducer is dumb assignment; the component is a passive projection. If a decision ("which step next?", "may I leave?", "am I done?") lives anywhere but the brain, move it. This is [building-ripe-store cardinal rule #2](../building-ripe-store/SKILL.md#cardinal-rules) applied to flows.

### Reading the verdict back to advance
The brain advances on the *event* (`testDone`, `flowDone`, `flowNext`), never by reading a conclusion back out of the store. Reading state back couples the brain to another feature's shape; reacting to its event does not (ADR-0005).

### A non-idempotent entry effect
An entry listener that appends, increments, or latches breaks on re-entry. Entry effects must be safe to run again — overwrite, don't accumulate. If you need a one-time effect, key it on data you can check idempotently, not on a module-level boolean.

### Forgetting the ownership guard on a shared intent
Every effect that reacts to a **shared flow intent** (`flowNext` / `flowBack` / `flowStart` / `flowSetCurrent` / `flowCancel`) starts with `if (!<creator>.match(action) || !isMine(action.payload.flowId)) return`. Two flows share the same eight actions; without the guard, one flow's `flowNext` fires the other's brain. (Effects triggered by a non-flow action like `rescan`, or filtered to a *child* flow, guard differently — don't paste `isMine` there or you'll break them.)

### Casting to reach the payload or the state
`action.payload as FlowPayload` and `api.getState() as RootState` are findings (`STORE-H-CAST`). The creator's `.match` narrows the action; `getState()` is typed through `AppStartListening`. If a cast seems needed, the `Listener` type in `store/types.ts` is the older optional-fields shape — upgrade it to the discriminated union from `building-ripe-store`.

### Expecting `flowGoto` / `flowBack` to work for free
Both are inert intents. `flowGoto` has no handler in the reference features — dispatching it is a no-op until you add a brain case. `flowBack` is positional (`prevStep`) only because the brain wires it so.
