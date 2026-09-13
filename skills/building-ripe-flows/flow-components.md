# Flow Components — Host, Steps, and the Mount-Once Contract

## When to read this
- Building the host that composes a journey's steps
- Writing a step component (self-gating, screen selection)
- Wiring a step's "start" work (a probe, a test-start) correctly
- Debugging "the step is stuck on loading after Rerun"
- Rendering a sub-flow inside a parent step
- Building the progress header / re-run control
- Giving each step its own URL; wiring browser back/forward

## Contents
- The host is the composition
- Step components: self-gating and `(data) → screen`
- StepViewProps and portability
- Mount-once / start-on-activation
- The two-piece conductor
- Sub-flows are plain composition
- Every step gets a URL — the URL is a projection `[contract-only]`

This file is the flow-specific layer over [building-ripe-components](../building-ripe-components/SKILL.md). Step components follow the standard anatomy (SETUP → EARLY EXIT → RETURN → HELPERS), use semantic styled components, hold no `useState`, and fetch no data — everything in that skill applies unchanged.

## The Host Is the Composition

`<FlowHost flowId>` is a thin, status-aware wrapper that renders its step children. The journey *file* lists every step as a named component, each told which step it is — that JSX IS the flow's composition (code-composition-over-config, ADR-0001). There is no separate flow-config file, and no `Record<StepId, () => ReactElement>` registry the host indexes into: a registry is a config table in disguise, and the audit flags it (`COMPONENT-M-RENDER-REGISTRY`).

```typescript
// src/components/AssessmentJourney/AssessmentJourney.tsx (MCE trade-in)
export function AssessmentJourney() {
	return (
		<FlowHost flowId={ASSESSMENT_FLOW_ID}>
			<LandingStep flowId={ASSESSMENT_FLOW_ID} step={STEP.landing} />
			<PermissionsStep flowId={ASSESSMENT_FLOW_ID} step={STEP.permissions} />
			<DtlTestStep flowId={ASSESSMENT_FLOW_ID} step={STEP.touchscreen}>
				<Touchscreen flowId={ASSESSMENT_FLOW_ID} step={STEP.touchscreen} />
			</DtlTestStep>
			<DtlTestStep flowId={ASSESSMENT_FLOW_ID} step={STEP.buttons}>
				<PhysicalButtons flowId={ASSESSMENT_FLOW_ID} step={STEP.buttons} />
			</DtlTestStep>
			{/* … cameraBack, cameraFront, condition, damage, background, offerReview, voucher */}
		</FlowHost>
	);
}
```

A step that stages a library screen — an explainer beat, then the check — is a **host that takes its screen as `children`** (`DtlTestStep`) and renders it bare once the step is live. A host that draws its own frame over the screen it wraps is a finding (`COMPONENT-M-RENDER-REGISTRY`, which also covers a host drawn over the screen it wraps).

`FlowHost` itself is trivial — it surfaces the flow's status as a `data-status` attribute so the styled wrapper (and a test) can read it, and renders its children:

```typescript
// src/components/FlowHost/FlowHost.tsx
export function FlowHost({ flowId, children }: FlowHostProps) {
	// ═══ SETUP ═══
	const { status } = useFlow(flowId);

	// ═══ RETURN ═══
	return <FlowHostWrapper data-status={status}>{children}</FlowHostWrapper>;
}
```

```typescript
// src/components/FlowHost/FlowHost.styled.tsx
/** Step viewport: step screens render absolutely inside it, below the journey chrome. */
export const FlowHostWrapper = styled.div`
	position: relative;
	flex-grow: 1;
	width: 100%;
`;
```

The trade-in wrapper styles nothing by status — the attribute is there for tests and for a host that wants to. When one does, the variant is an attribute selector, never an interpolation:

```typescript
&[data-status="completed"] { opacity: 0.6; }
```

**The host does not iterate, route, or choose a step.** It renders all steps unconditionally; each step decides for itself whether it's visible. Adding a step = add it to the flow's `steps` in `flows.reducer.ts` + drop its component into the journey JSX. The host does not grow logic.

## Step Components: Self-Gating and `(data) → screen`

Two rules define a step component:

**1. It self-gates.** It reads `useFlowStep(flowId, stepId).isActive` and returns `null` when it isn't the current step. This is the standard early-exit guard — nothing flow-specific except what it gates on.

**2. It is a `(step-data) → screen` function.** Within one active step, the component renders whichever *screen* fits the step's data. The engine never models screens; the component does, delegating the choice to a pure util.

```typescript
// src/components/BatteryStep/BatteryStep.tsx
export function BatteryStep({ flowId, step }: StepViewProps) {
	// ═══ SETUP ═══
	const { isActive, data, setData } = useFlowStep(flowId, step);
	const screen = batteryScreen(data);

	// ═══ EARLY EXIT ═══ — self-gate, then pick the screen
	if (!isActive) return null;
	if (screen === 'passed') return <OutcomePanel title={text.battery.passedTitle} /* … */ />;
	if (screen === 'replace') return <OutcomePanel title={text.battery.replaceTitle} /* … */ />;

	// ═══ RETURN ═══ — the 'test' screen
	return (
		<StepPanel>
			<StepTitle>{text.battery.title}</StepTitle>
			<StepActions>
				<StepButton data-intent="primary" onClick={() => setData({ ok: true })}>{text.battery.ok}</StepButton>
				<StepButton data-intent="secondary" onClick={() => setData({ ok: false })}>{text.battery.failed}</StepButton>
			</StepActions>
		</StepPanel>
	);
}
```

`batteryScreen(data)` is a pure util in `lib/utils/troubleshoot/` (see [creating-a-flow.md → Step 2](creating-a-flow.md#step-2-the-decision-utils--pure-functions-in-libutilsfeature)) — screen selection is a decision, so it stays out of the JSX and out of the store. Copy is `text.*` from the locale; the button variant is a `data-intent` attribute the styled file selects on (`&[data-intent="primary"]`), never a class string — see [building-ripe-components → styled.md](../building-ripe-components/styled.md#variants-are-data--attributes).

### The two binding hooks

Every step component uses one of two hooks from the engine:

- **`useFlow(flowId)`** — the nav view-model + drivers: `{ currentStep, status, stepIndex, total, isFirst, isLast, start, next, back, goTo, cancel }`. Used by the host, the progress header, and the summary.
- **`useFlowStep(flowId, stepId)`** — step-scoped sugar with `flowId` and `stepId` baked in: `{ isActive, data, setData, next, back }`. `data`/`setData` use the *generic engine bag*; a feature flow with R2 reads its own branch/selectors instead of the generic `data`.

## StepViewProps and Portability

A step receives its **identity** — which flow, which step — explicitly from the composing journey; it does not discover either. The default shape is `{ flowId, step }`, declared once in the journey folder and reused by every step:

```typescript
// src/components/JourneyStep/types.ts
export interface StepViewProps {
	/** Identifies the flow instance the step reads and drives. */
	flowId: string;
	/** The step this view self-gates on and writes intake under. */
	step: string;
}

// a host that stages a library screen takes it as children
export interface DtlTestStepProps extends StepViewProps {
	/** The check's own screen, rendered bare once the step is live. */
	children: ReactNode;
}
```

Passing `step` is what makes one component journey-portable: the camera check renders at `cameraBack` and `cameraFront` from one file. A step component's props stop at identity — a timeout, a skip flag, a threshold is a **parameter**, declared on the check's record in the diagnostics reducer's defaults and selected by step id (`selectCameraParams(state, step)`), never threaded through props (`COMPONENT-M-PARAM-PROP`; see [building-ripe-components → Props Are Identity](../building-ripe-components/SKILL.md#props-are-identity-parameters-come-from-the-branchs-defaults)). `[contract-only]` The canonical `ripe-flows` demo bakes the step id into each component (`useFlowStep(flowId, 'battery')`) with a bare `{ flowId }` — fine for a one-off demo, but a shared check needs `step`.

## Mount-Once / Start-on-Activation

*The subtlest correctness contract in the whole model (ADR-0007). Read it before wiring any "start" work into a component.*

**All step components mount once and stay mounted for the journey's life.** They are all children of `<FlowHost>`, always rendered. A step self-gates with `if (!isActive) return null`, which **blanks output but does not unmount**. So a step's lifecycle is: *mount once*, then `isActive` toggles `true`/`false` — possibly many times, e.g. on retry re-entry.

Therefore **"start" work — fire a probe, dispatch a test-start — must run on the `false → true` activation, never in a bare mount effect.**

**Preferred: put start work in the engine's entry listener**, not the component. The brain's `isAnyOf(flowStart, flowSetCurrent)` listener holds no latch, so it is idempotent and re-entrant by construction — it just overwrites the step's data. This is the `ripe-flows` approach (see [the-brain-listener.md → async intake on entry](the-brain-listener.md#async-intake-on-entry)). Prefer it.

**If you must latch start work in a component** (`[contract-only]`, DTL's `useTestLifecycle`): the latch must **re-arm on deactivation** — in the `[active]` effect's cleanup — not on unmount.

```typescript
// [contract-only] the shape — re-arm on the active→inactive edge, not on unmount
useEffect(() => {
	if (!active) return;
	if (started.current) return;
	started.current = true;
	onStart();
	return () => { started.current = false; }; // ← re-arm HERE (deactivation), not in a []-deps unmount
}, [active]);
```

> **The headline bug this prevents.** DTL's Storage step hung on "Reading…" after Rerun because its start-latch re-armed only in a `[]`-deps *unmount* cleanup — which never fires mid-journey, because the step stays mounted. The second activation never re-fired `onStart`. **This is invisible to isolated unit tests** (which DO unmount between cases); only an end-to-end re-entry test reproduces it. Keep re-entry coverage — it is the only guard on this contract (see [flow-tests.md](flow-tests.md)). Also: `useTestLifecycle` does not dedupe React StrictMode's double-invoke, so a side-effecting `onStart` must be idempotent or carry its own guard.

The rule in one line: **entry effects must be idempotent, because a step is re-entered while still mounted.**

## The Two-Piece Conductor

A journey's chrome — the progress label, the back button, the re-run control — is **two pieces, not a controller**:

1. **A once-rendered generic header** (`ProgressHeader`) that reads `useFlow` and dispatches the drivers. It shows position and offers back/cancel/re-run:

```typescript
// src/components/ProgressHeader/ProgressHeader.tsx
export function ProgressHeader({ flowId }: ProgressHeaderProps) {
	const { currentStep, stepIndex, total, isFirst, status, back, cancel } = useFlow(flowId);
	if (!currentStep) return null;
	const label = progressLabel(status, stepIndex, total, currentStep);
	return (
		<Progress>
			<ProgressLabel>{label}</ProgressLabel>
			<ProgressActions>
				<BackButton disabled={isFirst} onClick={() => back()}>{text.progress.back}</BackButton>
				{status === 'active' && <CancelButton onClick={() => cancel()}>{text.progress.cancel}</CancelButton>}
			</ProgressActions>
		</Progress>
	);
}

// ═══ HELPERS ═══
function progressLabel(status: FlowStatus, stepIndex: number, total: number, currentStep: string): string {
	if (status === 'completed') return text.progress.completed;
	if (status === 'cancelled') return text.progress.cancelled;
	return fill(text.progress.stepOf, { current: stepIndex + 1, total, step: currentStep });
}
```

The disabled state is the native `:disabled`, not a `className`; copy is `text.*` with `fill()` for the template.

2. **The per-journey host** listing the named steps (above).

The header reads `status` for its label — never the presence of `currentStep`, because a completed flow still has one set (see the SKILL's gotcha). `[contract-only]` DTL's `ProgressHeader` also dispatches `rerun`, which composes `flowStart` (replay all) and `flowSetCurrent` (re-enter one) — no new engine action.

## Sub-flows Are Plain Composition

A sub-flow is a second, independent, seeded flow — its own definition, brain, and step components. There is **no nesting primitive**. A parent step launches it and renders its host inline:

```typescript
// src/components/Troubleshoot/StorageStep.tsx (excerpt)
if (cleanupActive) {
	return (
		<StepPanel>
			<StepTitle>Cleaning up storage</StepTitle>
			<FlowHost flowId="cleanup"><CleanupSteps flowId="cleanup" /></FlowHost>
		</StepPanel>
	);
}
// … the default screen offers "Clean up", which dispatches flowStart({ flowId: 'cleanup' }):
<StepButton data-intent="primary" onClick={() => dispatch(flowStart({ flowId: 'cleanup' }))}>{text.storage.cleanUp}</StepButton>
```

- **Parent → child:** the parent step dispatches `flowStart({ flowId: 'cleanup' })` and renders `<FlowHost flowId="cleanup">` inline while the child is active (gated on `selectFlowStatus(state, 'cleanup') === 'active'`).
- **Child → parent:** the *parent brain* resumes on the child's `flowDone` (see [the-brain-listener.md → sub-flow resume](the-brain-listener.md#sub-flow-resume-on-the-childs-flowdone)).

The child is just another flow rendered in a different place. It needs no R2 — its result lives in its own R1 step data, which the parent brain reads.

> **Scope note.** The engine is `flowId`-keyed and runs any number of flows; the reference app simply doesn't exercise concurrent *unrelated* flows or deeper nesting. Don't design for them until the project actually needs them.

## Every Step Gets a URL — the URL Is a Projection `[contract-only]`

*Proven in the VFUK trade-in (`mce .../components/RoutedJourney/`). The default for any routed flow: every screen / step / logical location has its own URL.*

Three rules make per-step URLs safe:

1. **One pure format constructs the URL from flow state.** A single `canonicalJourneyPath(flow)`-style function maps flow state to a hierarchical path — `/eligibility/<step-slug>`, `/eligibility/<step-slug>/info` for a step's sub-location, `/eligibility/result` when completed, `/eligibility/cancelled` (`journeyPaths.ts:4-19,67-75`). If there's a format for constructing a URL for a state, back/forward navigation is solvable mechanically.
2. **The URL is a one-way *projection* of flow state — never a second source of truth.** A sync hook (VFUK: `useJourneyUrlSync` inside `RoutedJourney.tsx`) pushes the canonical path when flow state changes (`push` for forward progress, `replace` for corrections). The routes themselves are cosmetic — every route renders the same journey component; *flow state, not the route match, decides which screen shows* (`RoutedJourney.tsx:161-167`).
3. **Browser navigation becomes a flow intent.** `popstate` to an earlier step's URL dispatches exactly one `flowBack`; the brain resolves it like any other intent (`RoutedJourney.tsx:85-117`). The URL never writes `currentStep` directly — the projection loop stays one-way.

Two hard-won implementation details worth copying: key back/forward freshness on `location.key`, not `useNavigationType()` (which reports a stale `POP` — a real logged bug), and hold a one-shot pending-intent latch so the projection effect doesn't re-assert the stale canonical path and fight the intent within the same commit (`RoutedJourney.tsx:20-26,59-68,124-148`).

The *generic reusable* NavigationAdapter (ADR-0002) remains unbuilt — VFUK's sync hook is bespoke, and that's fine. Write the small hook per app; don't build the abstraction until a second host shape forces it.
