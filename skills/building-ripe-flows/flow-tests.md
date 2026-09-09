# Flow Tests — Behavioural Store Tests for a Journey

## When to read this
- Writing the first test for a flow
- Testing a branch, skip, guard, retry, sub-flow, or cancel
- Draining a flow's async intake hops in a test
- Making sure a re-entry / rerun path actually works
- Testing a pure decision util

## Contents
- The boundary with `building-ripe-tests`
- The behavioural store test — one harness, real listeners
- The `settle()` drain loop
- What to test — the capability matrix
- Re-entry coverage — the one non-negotiable
- Sub-flow via `flowDone`
- Pure-util tests

## The Boundary With `building-ripe-tests`

`building-ripe-tests` owns the general shapes: the `makeTestHarness`, reducer tests, listener tests (`vi.resetModules` + dynamic import, `vi.waitFor`, service-module stubbing), selector tests, and RTL component tests. **Load it — everything there applies.** This file adds only what's *flow-specific*: the whole-journey behavioural test, the `settle()` drain loop, and the re-entry coverage that guards the mount-once contract.

The centre of gravity for a flow is a **behavioural store test**: the flow *behaviour* — branch, skip, guard, retry, sub-flow, cancel — is the unit under test, exercised through the real wired listener chain. This is the pipeline-test shape from [building-ripe-tests → listener-tests.md](../building-ripe-tests/listener-tests.md#pipeline-tests-crossing-branches), applied to a journey. Reducer-only and pure-util tests sit underneath it.

## The Behavioural Store Test — One Harness, Real Listeners

Build a store through `makeTestHarness` with the *actual* production listeners (the brains) — the harness uses the app's reducer map, so the flows are already in the initial state exactly as `flows.reducer.ts` declares them. Mock only the branch's `api/` probes. Then drive the flow with real actions and assert on the cursor and the derived state.

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeTestHarness } from '@/store/__tests__/makeTestHarness';
import { flowStart, flowNext, flowBack, flowCancel, setStepData } from '@/store/flows/flows.actions';
import { selectCurrentStep, selectFlowStatus, selectFlow } from '@/store/flows/flows.selectors';
import { TROUBLESHOOT_FLOW_ID } from '../types';
import { listener as troubleshootListener } from '../troubleshoot.listener';
import { listener as cleanupListener } from '@/store/cleanup/cleanup.listener';

// mock the probes at the api boundary — deterministic, no real timers
const probes = vi.hoisted(() => ({ connectivity: vi.fn(), storage: vi.fn(), firmware: vi.fn() }));
vi.mock('../api/scanConnectivity', () => ({ scanConnectivity: probes.connectivity }));
vi.mock('../api/scanStorage', () => ({ scanStorage: probes.storage }));
vi.mock('../api/checkFirmware', () => ({ checkFirmware: probes.firmware }));

beforeEach(() => {
	probes.connectivity.mockReset().mockResolvedValue({ signal: 3 });
	probes.storage.mockReset().mockResolvedValue({ usageGB: 54, capacityGB: 64 });
	probes.firmware.mockReset().mockResolvedValue({ current: true, version: '0.0.0' });
});

const FLOW_ID = TROUBLESHOOT_FLOW_ID;

// both brains — sub-flow resume needs the real chain
const makeStore = () => makeTestHarness([...troubleshootListener, ...cleanupListener]).store;
```

Assert through the engine's selectors, not by inspecting the middleware:

```typescript
const currentStepOf = (store: ReturnType<typeof makeStore>) => selectCurrentStep(store.getState(), FLOW_ID);
const intake = (store: ReturnType<typeof makeStore>, step: string, patch: Record<string, unknown>) =>
	store.dispatch(setStepData({ flowId: FLOW_ID, step, patch }));
```

> The harness registers through the app's own `registerListener`, so a listener behaves in the test exactly as in production — the [never-hand-roll-a-store rule](../building-ripe-tests/SKILL.md#the-harness) applies to flow tests too. A hand-rolled `configureStore` with `l.actionCreator as never` is two findings at once (`TEST-M-HAND-ROLLED-STORE`, `TEST-M-CAST-DOUBLE`). `[contract-only]` `@mcesystems/dtl` ships an older twin, `src/test/makeStore.ts`; an app that carried it over deletes it in favour of `store/__tests__/makeTestHarness.ts`.

## The Step-Order Test

Because the step list is declared literally in `flows.reducer.ts`, its default state **is** the journey contract, and one reducer test pins it (see [building-ripe-tests → reducer-tests.md](../building-ripe-tests/reducer-tests.md)):

```typescript
it('declares the assessment flow literally: idle, eleven steps in order, no cursor, no data', () => {
	const state = flowsReducer(undefined, { type: '@@INIT' });
	expect(state.ids).toEqual(['assessment']);
	expect(state.byId.assessment).toEqual({
		status: 'idle',
		steps: ['landing', 'permissions', 'touchscreen', 'buttons', 'cameraBack', 'cameraFront',
			'condition', 'damage', 'background', 'offerReview', 'voucher'],
		currentStep: null,
		data: {},
	});
});

it('every step name the feature branch knows is a step of the flow', () => {
	const { steps } = flowsReducer(undefined, { type: '@@INIT' }).byId.assessment;
	for (const step of Object.values(STEP)) expect(steps).toContain(step);
});
```

Beside it, `flows.helpers.test.ts` proves the declaration guard: `uniqueSteps(['a', 'b', 'a'])` throws `/"a" is declared twice/`. A reordered, dropped or duplicated step is then a one-line failure, not a journey that silently skips a milestone.

## The `settle()` Drain Loop

A flow's move triggers a chain of async hops: an entry probe → `setStepData` → maybe `flowNext` → the routing brain → `flowSetCurrent` → the next entry probe. `vi.waitFor` polls one assertion; a whole-journey test instead **drains the microtask queue** after each dispatch so the chain runs to rest:

```typescript
// drain the listener middleware's async hops (probe → setStepData → next …)
const settle = async () => {
	for (let i = 0; i < 12; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};
```

Then each step of the journey is `dispatch → settle → assert`:

```typescript
it('runs every subsystem (incl. cleanup sub-flow) and concludes', async () => {
	const store = makeStore();
	store.dispatch(flowStart({ flowId: FLOW_ID })); await settle();
	expect(currentStepOf(store)).toBe('triage');

	intake(store, 'triage', { mode: 'full' }); store.dispatch(flowNext({ flowId: FLOW_ID })); await settle();
	expect(currentStepOf(store)).toBe('battery');

	intake(store, 'battery', { ok: true }); store.dispatch(flowNext({ flowId: FLOW_ID })); await settle();
	expect(currentStepOf(store)).toBe('connectivity');
	// … through to summary
	expect(selectFlowStatus(store.getState(), FLOW_ID)).toBe('completed');
});
```

The 12-iteration count is empirical — enough hops for the deepest chain in the flow. If a longer chain appears (a sub-flow inside a sub-flow), raise it. These whole-journey tests are exempt from the one-concern-per-`it()` rule — the journey is the concern.

## What to Test — the Capability Matrix

One `it()` per capability the brain implements. From the reference `troubleshoot.test.ts`:

| Capability | The test |
|---|---|
| **Happy path** | full checkup runs every subsystem (incl. the cleanup sub-flow) and concludes |
| **Branch** | `routeFromTriage` sends `focus=battery` to `battery`, not the full order |
| **Skip** | a focused run jumps a subsystem straight to `summary` |
| **Guard** | `flowNext` on `connectivity` does *not* advance until `data.connected` is true |
| **Retry** | `rescan` re-fires the entry probe in place (see below) |
| **Sub-flow** | the cleanup child's `flowDone` advances the parent past `storage` |
| **Cancel** | `flowCancel` sets `status === 'cancelled'` mid-flow |
| **Positional back** | `flowBack` from `battery` lands on `triage` |
| **Auto-skip** | firmware already current → the `update` entry listener auto-advances |

The guard test is worth its own note — it asserts a *non-move*:

```typescript
it('connectivity guard blocks Next until connected', async () => {
	const store = makeStore();
	store.dispatch(flowStart({ flowId: FLOW_ID })); await settle();
	intake(store, 'triage', { mode: 'focus', focus: 'connectivity' }); store.dispatch(flowNext({ flowId: FLOW_ID })); await settle();
	expect(currentStepOf(store)).toBe('connectivity');
	store.dispatch(flowNext({ flowId: FLOW_ID })); await settle();
	expect(currentStepOf(store)).toBe('connectivity');   // ← still here: the guard held
	intake(store, 'connectivity', { connected: true }); store.dispatch(flowNext({ flowId: FLOW_ID })); await settle();
	expect(currentStepOf(store)).toBe('summary');
});
```

## Re-entry Coverage — the One Non-negotiable

The mount-once / start-on-activation bug (see [flow-components.md](flow-components.md#mount-once--start-on-activation)) is **invisible to isolated unit tests** — a component mounted in isolation IS unmounted between cases, so the "step stays mounted, latch never re-arms" failure never reproduces. **Only an end-to-end re-entry test catches it.** Every flow with async intake must keep one:

```typescript
it('rescan re-fires the entry probe (retry)', async () => {
	const store = makeStore();
	store.dispatch(flowStart({ flowId: FLOW_ID })); await settle();
	intake(store, 'triage', { mode: 'focus', focus: 'connectivity' }); store.dispatch(flowNext({ flowId: FLOW_ID })); await settle();
	expect(currentStepOf(store)).toBe('connectivity');   // entry probe wrote signal:3
	intake(store, 'connectivity', { signal: 0 });        // wipe it
	store.dispatch(rescan()); await settle();            // must re-run the probe in place
	expect(selectFlow(store.getState(), FLOW_ID)?.data.connectivity?.signal).toBe(3);
});
```

If a flow uses a component-level start-latch (`[contract-only]` `useTestLifecycle`), the equivalent RTL test must **render once, activate → deactivate → re-activate the step, and assert the second activation re-fired `onStart`** — the case an isolated mount/unmount test cannot express. This is the only guard on the contract; do not drop it.

## Sub-flow via `flowDone`

Register both brains and drive the child, then assert the parent advanced — proving the resume listener fires through the real chain:

```typescript
// … parent is on 'storage'
store.dispatch(flowStart({ flowId: 'cleanup' })); await settle();
store.dispatch(setStepData({ flowId: 'cleanup', step: 'select', patch: { targets: ['cache'] } }));
store.dispatch(flowNext({ flowId: 'cleanup' })); await settle();   // child cleans → flowDone

expect(currentStepOf(store)).toBe('summary');                      // parent resumed and finished
expect(selectReport(store.getState())).toMatchObject({ freedGB: 1.2 });
```

## Pure-util Tests

The decision utils in `lib/utils/<feature>/` are pure functions — test them directly in `lib/utils/<feature>/__tests__/`, no store, no mocks. This is the cheapest, highest-value coverage: `routeFromTriage`, `afterSubsystem`, `batteryScreen`, `buildReport` each get a small table of input → expected step/screen/report. A branch bug caught here is a one-line failure instead of a whole-journey debug.
