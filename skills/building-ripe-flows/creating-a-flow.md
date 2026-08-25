# Creating a Flow — End-to-End

## When to read this
- Building a brand-new flow feature (wizard, diagnostic, eligibility walk)
- Onboarding to the flow layout for the first time
- Need a complete walkthrough from empty folder to a registered, route-started journey
- Renovating a legacy config-driven wizard into a Ripe flow

## What's covered
- Step 0 — the journey is a human decision
- The file-by-file walkthrough (definition → decision utils → brain → optional R2 → components → wiring)
- Linear flows vs branching flows — how much brain you actually write

For deeper coverage of any step:
- The brain's transition logic → [the-brain-listener.md](the-brain-listener.md)
- R1/R2, extension state, and the simplicity gate → [flow-state-model.md](flow-state-model.md)
- The host + step components → [flow-components.md](flow-components.md)
- Preconditions → [gates-and-preflight.md](gates-and-preflight.md)
- Renovating a legacy wizard → [renovating-a-flow.md](renovating-a-flow.md)

---

## Step 0: The Journey Is a Human Decision

**Before writing code, agree the journey with the project owner.** This is the load-bearing step — the rest is transcription. It is the flow analogue of [building-ripe-store → Step 0: State Composition](../building-ripe-store/creating-a-branch.md#step-0-state-composition-is-a-human-decision).

Decide, in writing:

- **The step list.** What are the *narrative milestones*? Not screens — milestones (cardinal rule #3). "Battery" is one step even though it shows a test screen, then a passed-or-replace screen. If you're tempted to make "Replace the battery" its own step, that's a screen of the battery step, not a milestone.
- **The branches.** Where does the path fork, skip, or guard? Triage picks a subsystem; a focused run skips the rest; connectivity blocks Next until connected. Each is a case in the brain — sketch them.
- **What each step produces.** The intake each step writes (`data[stepId]`) and the decisions downstream read. This is R1.
- **Is there an R2 conclusion?** A derived summary or state read outside the flow? Only that earns a feature reducer (cardinal rule #4). Most flows have none. Run it past the simplicity gate — see [flow-state-model.md](flow-state-model.md).
- **How does it start?** From a route (the common case) — the brain starts the seeded flow on `setLocation` if idle.
- **Any preconditions?** Permission, a hardware toggle, a reachable network — those become gate *steps* placed before the step they guard. See [gates-and-preflight.md](gates-and-preflight.md).

Present the step list + branch sketch to the owner. Get explicit approval. Only then start Steps 1–6.

The worked example below is `troubleshoot` (Device Doctor) from the canonical `ripe-flows` repo — a full-checkup diagnostic with a triage fork, a focused-run skip, an async-intake subsystem, a connectivity guard, a cleanup sub-flow, and a derived report.

---

## Step 1: The Definition — Pure Data

`steps` is an ordered array of milestone ids and nothing else. No transitions, guards, meta, or components.

```typescript
// src/store/troubleshoot/troubleshoot.definition.ts
import type { FlowDefinition } from '@/store/flows/types';

// Narrative milestones. "Replace battery" / "loading" / "clean up" are screens of these steps.
export const troubleshoot: FlowDefinition = {
	id: 'troubleshoot',
	steps: ['triage', 'battery', 'connectivity', 'storage', 'update', 'summary'],
};
```

By convention `bundleId === flowId === the definition id`. The definition is seeded into engine state at store-init (Step 6), so the flow's shape is already in the store the moment it exists.

---

## Step 2: The Decision Utils — Pure Functions in `modules/`

Every decision the brain makes delegates to a pure function here: no Redux, independently testable. This is what keeps the brain a thin dispatcher and the logic greppable.

```typescript
// src/modules/troubleshoot.decide.ts
type StepData = Record<string, unknown> | undefined;

// full-checkup order; `summary` is terminal
const FULL_ORDER = ['battery', 'connectivity', 'storage', 'update', 'summary'] as const;

export const routeFromTriage = (triage: StepData): string =>
	triage?.mode === 'focus' && typeof triage.focus === 'string' ? triage.focus : 'battery';

export const afterSubsystem = (current: string, triage: StepData): string => {
	if (triage?.mode === 'focus') return 'summary'; // focused run skips the rest
	const i = FULL_ORDER.indexOf(current as (typeof FULL_ORDER)[number]);
	return i >= 0 && i < FULL_ORDER.length - 1 ? FULL_ORDER[i + 1] : 'summary';
};

// Screen selection is ALSO a pure util — a step is a (step-data) → screen function
export type BatteryScreen = 'test' | 'passed' | 'replace';
export const batteryScreen = (battery: StepData): BatteryScreen => {
	if (battery?.ok === undefined) return 'test';
	return battery.ok ? 'passed' : 'replace';
};
```

Screen selection (`batteryScreen`) lives here too — the component imports it (Step 5). Keep decisions out of both the reducer and the component; they live in `modules/`.

---

## Step 3: The Brain — the Feature Listener

The brain is the feature's `Listener[]`. Two listeners matter at creation time — a **route-start** listener that starts the seeded flow when the route is entered, and **the routing brain** that turns `flowNext` into a move. [the-brain-listener.md](the-brain-listener.md) is the full reference for both, plus the async-intake, retry, sub-flow-resume, and conclude listeners a rich flow adds.

```typescript
// src/store/troubleshoot/troubleshoot.listener.ts (excerpt)
const FLOW_ID = troubleshoot.id;
const isMine = (flowId: string) => flowId === FLOW_ID;

export const listener: Listener[] = [
	// route-start: start the seeded flow when the route is entered and it's idle
	{
		actionCreator: setLocation,
		effect: (_action, api) => {
			const flow = selectFlow(api.getState() as RootState, FLOW_ID);
			if (flow && flow.status === 'idle') api.dispatch(flowStart({ flowId: FLOW_ID }));
		},
	},

	// THE routing brain: react to flowNext, switch on currentStep, commit via flowSetCurrent.
	// Full switch — every branch, the connectivity guard, the linear default — is in
	//   the-brain-listener.md § The Routing Brain
	{
		actionCreator: flowNext,
		effect: (action, api) => {
			if (!isMine(action.payload.flowId)) return;
			const flow = selectFlow(api.getState() as RootState, FLOW_ID);
			if (!flow) return;
			const go = (step: string | null) => step && api.dispatch(flowSetCurrent({ flowId: FLOW_ID, step }));
			switch (flow.currentStep) {
				case 'triage':
					return go(routeFromTriage(flow.data.triage)); // each case delegates to a pure util
				// … connectivity guard, subsystem skip, linear default — see the-brain-listener.md
			}
		},
	},
	// … back, async-intake-on-entry, retry, sub-flow-resume, conclude — see the-brain-listener.md
];
```

Two rules the full reference expands on: every `switch` case delegates to a pure util in `modules/` (no Redux in the decision), and a guard that means "stay here" is `return undefined` — the connectivity case dispatches nothing until `data.connectivity.connected` is true, so `flowNext` is a no-op and the user stays put. Note the route-start listener guards *differently*: it keys on `setLocation`, which carries no `flowId`, so it selects the flow by its known id rather than using `isMine` — see [the-brain-listener.md → What the Brain Is](the-brain-listener.md#what-the-brain-is) for which listeners guard and how.

---

## Step 4: R2 — Only If There's a Conclusion

Most flows stop at Step 3 — definition + brain + utils + view, no reducer. `troubleshoot` is the exception: it derives a **report** on reaching `summary`, consumed outside the flow. That derived conclusion is R2, so it earns a tiny branch.

```typescript
// src/store/troubleshoot/types.ts
export interface TroubleshootReport {
	batteryReplaced: boolean;
	wifiConnected: boolean;
	freedGB: number;
	firmwareUpdated: boolean;
	health: 'healthy' | 'issuesFixed' | 'issuesFound';
}
export interface TroubleshootState {
	report: TroubleshootReport | null;
}

// src/store/troubleshoot/troubleshoot.reducer.ts — dumb assignment, resets on replay
const defaultState: TroubleshootState = { report: null };
export const reducer = createReducer(defaultState, (builder) => {
	builder
		.addCase(troubleshootConcluded, (state, action) => { state.report = action.payload; })
		.addCase(flowStart, (state, action) => {
			if (action.payload.flowId === troubleshoot.id) state.report = null;
		});
});
```

The report is *derived by a pure util* (`buildReport(flow.data)`) in the conclude listener, never accumulated field-by-field. If you find yourself mirroring step intake into R2, stop — that's the redundancy ADR-0004 warns against. See [flow-state-model.md](flow-state-model.md) for the boundary test and the R2 amendment (an owned domain reducer, for flows that have genuine domain state beyond a summary).

---

## Step 5: The Components — Host + Self-Gating Steps

The host lists every step as a named child of `<FlowHost flowId>`, each passed `flowId`. Each step self-gates on `isActive` and renders whichever screen fits its data (a step is a `(data) → screen` function). Full anatomy — the host, the `useFlowStep` binding, screen selection, mount-once — is in [flow-components.md](flow-components.md).

```typescript
// src/components/Troubleshoot/Troubleshoot.tsx — the host IS the composition
export function Troubleshoot() {
	return (
		<FlowHost flowId="troubleshoot">
			<ProgressHeader flowId="troubleshoot" />
			<TriageStep flowId="troubleshoot" />
			<BatteryStep flowId="troubleshoot" />
			{/* … one named component per step, each passed flowId */}
		</FlowHost>
	);
}
```

Each step is the standard `building-ripe-components` anatomy with one flow-specific guard:

```typescript
// src/components/Troubleshoot/BatteryStep.tsx (shape — full version in flow-components.md)
export function BatteryStep({ flowId }: StepProps) {
	const { isActive, data, setData } = useFlowStep(flowId, 'battery');
	if (!isActive) return null;                              // self-gate — blanks output, does NOT unmount
	if (batteryScreen(data) === 'passed') return <OutcomePanel title="Battery OK ✓" />;
	// … 'replace' screen, then the 'test' screen with setData({ ok }) buttons — see flow-components.md
	return <StepPanel>{/* … */}</StepPanel>;
}
```

`if (!isActive) return null` is the standard early-exit guard from `building-ripe-components` — nothing flow-specific except *what* it gates on. All steps stay mounted for the journey's life; the guard blanks output, it does not unmount. That fact is load-bearing for retry — see [flow-components.md → mount-once](flow-components.md#mount-once--start-on-activation).

---

## Step 6: Wire It Into the Root

A journey isn't live until both its definition (into the engine reducer) and its brain (into the listener registration) are registered.

```typescript
// src/store/store.ts — definitions baked into initial state at boot
export const rootReducer = combineReducers({
	app: appReducer,
	router: routerReducer,
	flows: createFlowsReducer([troubleshoot, cleanup]), // ← the app's flows, in state from boot
	troubleshoot: troubleshootReducer, // ← R2 report; cleanup has no branch
});
```

```typescript
// src/store/listener.ts — register each brain (narrow import paths, ADR-0006)
import { listener as troubleshootListener } from './troubleshoot/troubleshoot.listener';
import { listener as cleanupListener } from './cleanup/cleanup.listener';

const listeners: Listener[][] = [troubleshootListener, cleanupListener];
```

`createFlowsReducer` builds the initial `flows` state straight from the definitions — there is no separate seed step and no `seedFlows` helper, despite what older docs say (see the drift note in the SKILL). The engine stays generic: it receives definitions as data and never imports a feature.

> **Direction of travel.** The `createFlowsReducer(...)` factory is the *current seam*, treated as a stopgap: a generating function obfuscates what is really declarative logic. The intended end-state is that the flows reducer is expanded and codified in the code files — declared explicitly, so the flow's shape reads off the page. Same behaviour; prefer the declared form when the project can afford it.

---

## Linear Flows vs Branching Flows — How Much Brain You Write

**A branching flow needs a brain** (the `flowNext` switch above). **A purely linear flow barely needs one** — the whole brain is a six-line `flowNext` listener that computes `nextStep(flow)` and commits `flowSetCurrent`, with no `switch`. The `cleanup` sub-flow is exactly that; the code is in [the-brain-listener.md → the linear default](the-brain-listener.md#the-linear-default-and-the-two-ways-to-advance).

**`[contract-only]`** — production `@mcesystems/dtl` DRYs even that away with an *engine-level* default-advance listener (`flows.listener.ts`) so a linear journey costs a `FlowDefinition` and *zero* listener code. The canonical `ripe-flows` engine ships **no** listener — do not expect to find `flows.listener.ts` there. If your project has the default-advance listener, a linear flow needs no brain; if not, write the six lines. Either way, a branching flow always writes its own `flowNext` switch.

---

## Renovating a Legacy Config-Driven Flow

Renovation — converting an existing config-driven wizard into a Ripe flow while preserving behaviour exactly — is its own discipline with its own reference: **[renovating-a-flow.md](renovating-a-flow.md)**. In one line: the legacy config is a *research instrument, not a runtime dependency* — transcribe its rules into code, reproduce its quirks on purpose, and verify parity step-by-step. Everything on *this* page still applies; that page adds the Stage-1 loop on top.

---

## Quick Verification

- [ ] `steps` is milestones only — no per-step meta, no components in the definition
- [ ] Every decision the brain makes delegates to a pure util in `modules/`
- [ ] The engine (`store/flows/`) was not edited
- [ ] No feature/reducer code writes `currentStep` except via `flowSetCurrent` (only the engine's `flowStart` reset also sets it)
- [ ] A reducer exists only if the feature has R2 state (a derived conclusion or domain state)
- [ ] Each step component self-gates with `if (!isActive) return null`
- [ ] Definition registered in `createFlowsReducer([...])`; brain registered in `listener.ts`
- [ ] For a renovation: run the checklist in [renovating-a-flow.md](renovating-a-flow.md#quick-verification) as well
