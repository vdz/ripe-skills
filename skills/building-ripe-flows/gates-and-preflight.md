# Gates and Preflight — Preconditions as Flow Steps

> **`[contract-only]` — the whole of this file.** Gates are realized in `@mcesystems/dtl` (`src/lib/gates/`) and the VFUK trade-in renovation, and specified by ADR-0010 and ADR-0011 in the canonical `ripe-flows` repo. **They do NOT exist in `ripe-flows` code** — do not grep `ripe-flows` for `runGate` and expect to find it. This is the authoritative model; build a gate by transcribing this contract, or import DTL's `gates/` if the project depends on it.

## When to read this
- A step needs a precondition: a permission, a hardware toggle, a reachable network
- A whole journey (or the whole suite) needs a grant before it can run
- You're tempted to make a missing precondition surface as a test failure
- Deciding at what altitude a permission request belongs

## Contents
- The one idea: a gate is an ordinary step
- The `runGate` contract
- A gate never concludes, never times out, never auto-fails
- The Gatehouse family: Doorman and Switchboard
- Gate vs verdict-bearing test
- Owner-altitude placement
- What was rejected

## The One Idea: a Gate Is an Ordinary Step

A precondition gate is an **ordinary flow step** declared before the step it guards. Adding a precondition to a journey means adding a gate step to the flow's `steps` list in `flows.reducer.ts` — "the manifest is the composition." No engine change, no new branch, no registry, no gate primitive.

```typescript
// a journey that gates camera-permission before the photo step
steps: ['intro', 'cameraPermission', 'photo', 'summary']
//                 └── a gate step ──┘  └ the step it guards
```

A satisfied gate just advances (`next()` — the same `flowNext` intent any step uses). The brain sees an ordinary step reaching `flowNext` and moves on. The gate carries no verdict and needs no special handling.

## The `runGate` Contract

Every gate — whatever it probes — runs one shared state machine, implemented once as `runGate` and wrapped by small named components that differ only in *what* they probe and *what their blocked UI says*:

```
probe ──► satisfied ──────────────────────────► next()
   │
   └► not satisfied ──► (optionally) request ONCE
                              │
                              ├► granted ──► re-probe ──► satisfied ──► next()
                              │
                              └► denied / no request ──► blocked ──► await external re-check ──► re-probe …
```

- **probe** — check the precondition (is the permission granted? is the toggle on? is the network reachable?).
- **request, at most once per activation** — a real request (the OS permission prompt), but the *one-denial policy* means after a single denial the gate informs and waits; it does not nag.
- **satisfied** → call `next()` itself.
- **blocked** → wait, indefinitely, for an external re-check (the operator flips the OS setting and returns; the gate re-probes). The gate's local status (`probing | blocked | satisfied`) is projected one-way into `flows.data[step]` for foreign listeners — see [flow-state-model.md → one-way projection](flow-state-model.md#one-way-projection-mirror-out-contract-only).

Two first-class knobs:

- **Strictness** — `required` (default; a blocked gate holds the journey) or `advisory` (offer "continue anyway").
- **Polarity** — `on` / `off` (gate that a toggle is on, or that it is off).

## A Gate Never Concludes, Never Times Out, Never Auto-fails

This is the correctness heart of the Gatehouse, and the exact legacy defect it removes:

- **Never a verdict.** Verdicts are for tests. A gate produces no `{ verdict }` and carries no test envelope.
- **Never times out.** A blocked gate waits forever for the operator to resolve or abandon. There is no timer.
- **Never auto-fails.** Blocked is not failed. The operator resolves it or abandons the journey.

The recurring legacy defect was a missing precondition masquerading as a device defect — a "test" that failed because the camera permission was off, not because the camera was broken. Gating the precondition *upstream* lets the downstream test assume its precondition and stay a pure interrogator. Mapping an unmet precondition to a fail/timeout verdict re-introduces exactly that defect.

If a missing precondition *should* surface as a result, that is the **brain** deliberately mapping the unsatisfied gate to a nav-status or an early `testDone` — never an implicit side effect of the gate itself.

## The Gatehouse Family: Doorman and Switchboard

`runGate` is wrapped by small, named family components — each a step component that differs only in its probe and its blocked message:

- **Doorman** — a permission gate (camera, motion, location). Probes the permission, requests once, blocks on denial.
- **Switchboard** — a hardware-toggle gate (Bluetooth, Wi-Fi). Probes the toggle's state against its polarity, informs, waits.

Both take the same `StepViewProps { flowId, step }` as any step, live in the same flow, and on satisfied call `next()`. In the MCE trade-in app the permissions gate is `PermissionsStep`: the probe and the request are `api/permissions.ts` functions called from the assessment listener (`permissionsRequested` → `probeJourneyPermissions` / `requestJourneyPermissions` → `permissionsResolved` → `flowNext`), and the component only renders the gate's state and dispatches — the gate machine is listener logic, not a component hook. A new kind of gate is a new small wrapper over `runGate`, not a new engine concept.

> **`[contract-only]` async-onStart caveat.** A gate's `onStart` awaits a real seam (the OS permission API). Register teardown *before* the first `await` and re-check a `torndown` flag after each await — `onCleanup` registration is synchronous, so a cleanup registered after the first await can miss an early deactivation. See [flow-components.md → mount-once](flow-components.md#mount-once--start-on-activation) for the lifecycle rules a gate step shares with every step.

## Gate vs Verdict-Bearing Test

In one journey some steps advance via `flowNext` (gates, plain steps) and others via a domain event like `testDone` (verdict-bearing tests). Both resolve to `flowSetCurrent`, but the reader must not expect a uniform trigger:

| | Gate | Test |
|---|---|---|
| Produces a verdict? | Never | Yes (`pass | fail | skipped | aborted | notSupported | timeout`) |
| Touches the R2 atom? | No | Yes (owns a `TestAtom`) |
| Times out / auto-fails? | Never | May (`timeout` is a verdict) |
| Advances by | `next()` on satisfied | its domain `testDone` |
| Answers | "may this step run?" | "what is the device's condition?" |

A gate **gates** (controls whether a step runs); it does not **conclude** (say what the outcome was).

## Owner-Altitude Placement

*ADR-0010.* A gate lives at the **highest altitude that owns the requirement**:

- **Suite / run altitude** — the whole run needs it (a login grant). Placed once, high.
- **Journey / subsystem altitude** — one journey needs it (camera for the photo journey).
- **Pushed down to a single test** — only that one test cares.

An app/feature-wide grant placed high becomes **transparent once approved** — a satisfied-and-silent no-op the downstream steps never see. Adding a new step that needs that already-granted permission costs *zero* gate wiring. Matching ownership to altitude keeps tests pure interrogators and makes the common approved-permission case free.

## What Was Rejected

Two designs were considered and rejected — don't reach for them:

- **One generic declarative gate component** (configured by data). Rejected: it grows a config surface, reintroducing the name→implementation indirection ADR-0001 escapes. Gates are small named components over `runGate`, not one configurable component.
- **Gate outcomes as verdicts** (forcing every gate result into `flows.data` as a pass/fail). Rejected: it is the exact defect being removed — a precondition masquerading as a result. The engine offers no permission primitive; a gate is ordinary composition at its altitude.
