# Creating a Flow — End-to-End

## When to read this
- Building a brand-new flow feature (wizard, diagnostic, eligibility walk)
- Onboarding to the flow layout for the first time
- Need a complete walkthrough from empty folder to a registered, route-started journey
- Renovating a legacy config-driven wizard into a Ripe flow

## What's covered
- Step 0 — the journey is a human decision
- The file-by-file walkthrough (declare the flow → decision utils → the listener → optional R2 → components → wiring)
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

## Step 1: Declare the Flow — Literally, in the Flows Reducer

`steps` is an ordered array of milestone ids and nothing else. No transitions, guards, meta, or components. It is declared **in the flows reducer's initial state**, so the journey reads off the page and is in the store the moment the store exists:

```typescript
// src/store/flows/flows.reducer.ts
const initialState: FlowsState = {
	ids: ['troubleshoot', 'cleanup'],
	byId: {
		// Narrative milestones. "Replace battery" / "loading" / "clean up" are screens of these steps.
		troubleshoot: {
			status: 'idle',
			steps: uniqueSteps(['triage', 'battery', 'connectivity', 'storage', 'update', 'summary']),
			currentStep: null,
			data: {},
		},
		cleanup: {
			status: 'idle',
			steps: uniqueSteps(['select', 'cleaning', 'done']),
			currentStep: null,
			data: {},
		},
	},
};

export const flowsReducer = createReducer(initialState, (builder) => { /* the engine cases, unchanged */ });
```

`uniqueSteps` (in `flows.helpers.ts`) throws at module load on a repeated id, so two indistinguishable positions fail the first test rather than a customer's journey. The names the feature uses to talk about its steps live in the feature branch's `types.ts` as an as-const map, together with the flow id:

```typescript
// src/store/troubleshoot/types.ts
export const TROUBLESHOOT_FLOW_ID = 'troubleshoot';

export const STEP = {
	triage: 'triage',
	battery: 'battery',
	connectivity: 'connectivity',
	storage: 'storage',
	update: 'update',
	summary: 'summary',
} as const;
export type TroubleshootStep = (typeof STEP)[keyof typeof STEP];
```

A reducer test asserts that every `STEP` value is in the declared list, and pins the list itself — see [flow-tests.md → the step-order test](flow-tests.md#the-step-order-test). This is the one edit a feature makes inside `store/flows/`: its own entry in `initialState`. **There is no `<feature>.definition.ts`** and no `createFlowsReducer(definitions)` factory — older repos have both (`[contract-only]`), and the audit flags them (`FLOWS-M-GENERATED-FLOWS`).

---

## Step 2: The Decision Utils — Pure Functions in `lib/utils/<feature>/`

Every decision the brain makes delegates to a pure function here: no Redux, independently testable. This is what keeps the listener a thin dispatcher and the logic greppable. `lib/utils/` is the one home for pure helpers; `lib/modules/` holds deep implementations fronted by an `api/` function (a bridge, a codec). Neither is a top-level `src/modules/` (`ORG-M-SECOND-TREE`).

```typescript
// src/lib/utils/troubleshoot/decide.ts
import { STEP } from '@/store/troubleshoot/types';
import type { TroubleshootStep } from '@/store/troubleshoot/types';

type StepData = Record<string, unknown> | undefined;

/** Full-checkup order; `summary` is terminal. */
const FULL_ORDER: readonly TroubleshootStep[] = [STEP.battery, STEP.connectivity, STEP.storage, STEP.update, STEP.summary];

export const routeFromTriage = (triage: StepData): TroubleshootStep =>
	triage?.mode === 'focus' && isTroubleshootStep(triage.focus) ? triage.focus : STEP.battery;

export const afterSubsystem = (current: TroubleshootStep, triage: StepData): TroubleshootStep => {
	if (triage?.mode === 'focus') return STEP.summary; // focused run skips the rest
	const index = FULL_ORDER.indexOf(current);
	return FULL_ORDER[index + 1] ?? STEP.summary;
};

// Screen selection is ALSO a pure util — a step is a (step-data) → screen function
export type BatteryScreen = 'test' | 'passed' | 'replace';
export const batteryScreen = (battery: StepData): BatteryScreen => {
	if (battery?.ok === undefined) return 'test';
	return battery.ok ? 'passed' : 'replace';
};
```

`isTroubleshootStep` is a `value is TroubleshootStep` guard beside `STEP` in `types.ts` — the way to narrow a string read out of the data bag without an `as` cast. Screen selection (`batteryScreen`) lives here too — the component imports it (Step 5). Keep decisions out of both the reducer and the component; they live in `lib/utils/`.

---

## Step 3: The Brain — the Feature Listener

The brain is the feature's `Listener[]`. Two listeners matter at creation time — a **route-start** listener that starts the seeded flow when the route is entered, and **the routing brain** that turns `flowNext` into a move. [the-brain-listener.md](the-brain-listener.md) is the full reference for both, plus the async-intake, retry, sub-flow-resume, and conclude listeners a rich flow adds.

```typescript
// src/store/troubleshoot/troubleshoot.listener.ts (excerpt)
import { TROUBLESHOOT_FLOW_ID, STEP } from './types';
import { routeFromTriage } from '@/lib/utils/troubleshoot/decide';

const FLOW_ID = TROUBLESHOOT_FLOW_ID;
const isMine = (flowId: string) => flowId === FLOW_ID;

export const listener: Listener[] = [
	// route-start: start the declared flow when the route is entered and it's idle
	{
		actionCreator: setLocation,
		effect: (_action, api) => {
			const flow = selectFlow(api.getState(), FLOW_ID);
			if (flow && flow.status === 'idle') api.dispatch(flowStart({ flowId: FLOW_ID }));
		},
	},

	// THE routing brain: react to flowNext, switch on currentStep, commit via flowSetCurrent.
	// Full switch — every branch, the connectivity guard, the linear default — is in
	//   the-brain-listener.md § The Routing Brain
	{
		actionCreator: flowNext,
		effect: (action, api) => {
			if (!flowNext.match(action) || !isMine(action.payload.flowId)) return;
			const flow = selectFlow(api.getState(), FLOW_ID);
			if (!flow) return;
			const go = (step: string | null) => step && api.dispatch(flowSetCurrent({ flowId: FLOW_ID, step }));
			switch (flow.currentStep) {
				case STEP.triage:
					return go(routeFromTriage(flow.data.triage)); // each case delegates to a pure util
				// … connectivity guard, subsystem skip, linear default — see the-brain-listener.md
			}
		},
	},
	// … back, async-intake-on-entry, retry, sub-flow-resume, conclude — see the-brain-listener.md
];
```

The file is `<feature>.listener.ts`, the same name every branch uses — "brain" is what the listener *does* for a flow, not a file suffix; a `<feature>.brain.ts` next to it is a second decision file (`FLOWS-M-GENERATED-FLOWS`). `api.getState()` is typed through `AppStartListening`, so there is no `as RootState`; the creator's `.match` narrows the `UnknownAction` before the payload is read. Any I/O the listener needs is a function in `store/troubleshoot/api/`.

Two rules the full reference expands on: every `switch` case delegates to a pure util in `lib/utils/troubleshoot/` (no Redux in the decision), and a guard that means "stay here" is `return undefined` — the connectivity case dispatches nothing until `data.connectivity.connected` is true, so `flowNext` is a no-op and the user stays put. Note the route-start listener guards *differently*: it keys on `setLocation`, which carries no `flowId`, so it selects the flow by its known id rather than using `isMine` — see [the-brain-listener.md → What the Brain Is](the-brain-listener.md#what-the-brain-is) for which listeners guard and how.

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
export const troubleshootReducer = createReducer(defaultState, (builder) => {
	builder
		.addCase(troubleshootConcluded, (state, action) => { state.report = action.payload; })
		.addCase(flowStart, (state, action) => {
			if (action.payload.flowId === TROUBLESHOOT_FLOW_ID) state.report = null;
		});
});
```

The report is *derived by a pure util* (`buildReport(flow.data)`) in the conclude listener, never accumulated field-by-field. If you find yourself mirroring step intake into R2, stop — that's the redundancy ADR-0004 warns against. See [flow-state-model.md](flow-state-model.md) for the boundary test and the R2 amendment (an owned domain reducer, for flows that have genuine domain state beyond a summary).

---

## Step 5: The Components — Host + Self-Gating Steps

The journey lists every step as a named child of `<FlowHost flowId>`, each passed its identity — `flowId` and `step`. Each step self-gates on `isActive` and renders whichever screen fits its data (a step is a `(data) → screen` function). Full anatomy — the host, the `useFlowStep` binding, screen selection, mount-once — is in [flow-components.md](flow-components.md).

```typescript
// src/components/Troubleshoot/Troubleshoot.tsx — the JSX IS the step list
export function Troubleshoot() {
	return (
		<FlowHost flowId={TROUBLESHOOT_FLOW_ID}>
			<ProgressHeader flowId={TROUBLESHOOT_FLOW_ID} />
			<TriageStep flowId={TROUBLESHOOT_FLOW_ID} step={STEP.triage} />
			<BatteryStep flowId={TROUBLESHOOT_FLOW_ID} step={STEP.battery} />
			{/* … one named component per step, each passed flowId and step — never a Record<step, render> */}
		</FlowHost>
	);
}
```

Each step is the standard `building-ripe-components` anatomy with one flow-specific guard:

```typescript
// src/components/BatteryStep/BatteryStep.tsx (shape — full version in flow-components.md)
export function BatteryStep({ flowId, step }: StepViewProps) {
	const { isActive, data, setData } = useFlowStep(flowId, step);
	if (!isActive) return null;                              // self-gate — blanks output, does NOT unmount
	if (batteryScreen(data) === 'passed') return <OutcomePanel title={text.battery.passedTitle} />;
	// … 'replace' screen, then the 'test' screen with setData({ ok }) buttons — see flow-components.md
	return <StepPanel>{/* … */}</StepPanel>;
}
```

Every step under `components/`, grouping folders allowed (`components/diagnostics/<Check>/`); copy from the locale; variants as `data-*` attributes; no `useState` — the [building-ripe-components](../building-ripe-components/SKILL.md) rules apply unchanged.

`if (!isActive) return null` is the standard early-exit guard from `building-ripe-components` — nothing flow-specific except *what* it gates on. All steps stay mounted for the journey's life; the guard blanks output, it does not unmount. That fact is load-bearing for retry — see [flow-components.md → mount-once](flow-components.md#mount-once--start-on-activation).

---

## Step 6: Wire It Into the Root

A journey isn't live until its flow is declared (Step 1, in `flows.reducer.ts`) and its listener is registered. The flows reducer is one entry in the app's reducer map like any other branch:

```typescript
// src/store/store.ts — the reducer map; flows are in state from boot because the reducer declares them
export const reducer = {
	app: appReducer,
	router: routerReducer,
	flows: flowsReducer,               // ← declares troubleshoot and cleanup literally
	troubleshoot: troubleshootReducer, // ← R2 report; cleanup has no branch
};
```

```typescript
// src/store/listener.ts — register each brain (narrow import paths, ADR-0006)
import { listener as troubleshootListener } from './troubleshoot/troubleshoot.listener';
import { listener as cleanupListener } from './cleanup/cleanup.listener';

// Order matters once: when listener A must run before listener B on the same action, say why here.
const listeners: Listener[][] = [troubleshootListener, cleanupListener];
```

The engine stays generic: `flows.reducer.ts` names the app's flows as data and imports nothing from a feature. `[contract-only]` Older repos wire `flows: createFlowsReducer([troubleshoot, cleanup])` from `.definition.ts` objects — same state, generated instead of declared; a new app does not.

---

## Linear Flows vs Branching Flows — How Much Brain You Write

**A branching flow needs a brain** (the `flowNext` switch above). **A purely linear flow barely needs one** — the whole brain is a six-line `flowNext` listener that computes `nextStep(flow)` and commits `flowSetCurrent`, with no `switch`. The `cleanup` sub-flow is exactly that; the code is in [the-brain-listener.md → the linear default](the-brain-listener.md#the-linear-default-and-the-two-ways-to-advance).

**`[contract-only]`** — production `@mcesystems/dtl` DRYs even that away with an *engine-level* default-advance listener (`flows.listener.ts`) so a linear journey costs a declaration and *zero* listener code. The canonical `ripe-flows` engine ships **no** listener, and the MCE trade-in app deleted the one it inherited because its single journey branches and nothing called the linear default. Write the six lines; a branching flow always writes its own `flowNext` switch. Carry an engine listener only if a second, genuinely linear flow appears.

---

## Renovating a Legacy Config-Driven Flow

Renovation — converting an existing config-driven wizard into a Ripe flow while preserving behaviour exactly — is its own discipline with its own reference: **[renovating-a-flow.md](renovating-a-flow.md)**. In one line: the legacy config is a *research instrument, not a runtime dependency* — transcribe its rules into code, reproduce its quirks on purpose, and verify parity step-by-step. Everything on *this* page still applies; that page adds the Stage-1 loop on top.

---

## Quick Verification

- [ ] `steps` is milestones only — no per-step meta, no components — declared literally in `flows.reducer.ts` with `uniqueSteps`, and pinned by a reducer test
- [ ] No `<feature>.definition.ts`, no `<feature>.brain.ts`, no `createFlowsReducer` — FLOW_ID and STEP live in `store/<feature>/types.ts`
- [ ] Every decision the listener makes delegates to a pure util in `lib/utils/<feature>/`; every probe is a `store/<feature>/api/` function
- [ ] The engine (`store/flows/`) was not edited beyond the flow's `initialState` entry
- [ ] No feature/reducer code writes `currentStep` except via `flowSetCurrent` (only the engine's `flowStart` reset also sets it)
- [ ] No `as` in the listener: `.match` narrows the action, `getState()` is typed
- [ ] A reducer exists only if the feature has R2 state (a derived conclusion or domain state)
- [ ] Each step component takes `{ flowId, step }` and self-gates with `if (!isActive) return null`; the journey JSX lists the steps, no render registry
- [ ] Listener appended to `listeners: Listener[][]` in `listener.ts`
- [ ] For a renovation: run the checklist in [renovating-a-flow.md](renovating-a-flow.md#quick-verification) as well
