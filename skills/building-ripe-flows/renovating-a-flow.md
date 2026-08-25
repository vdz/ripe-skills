# Renovating a Legacy Config-Driven Flow

## When to read this
- Converting an existing config-driven wizard into a Ripe flow
- The "spec" is a running legacy app, not a fresh design
- Onboarding a new tenant whose journey exists as a legacy flow document
- Reviewing a renovation for behaviour parity

## Contents
- What renovation is (and isn't)
- The Stage-1 loop
- Per-dimension step resolution at `flowStart`
- The skip-predicate inversion — absorb it exactly once
- User-skip vs gate-skip — different verdicts
- Reproduce quirks on purpose
- Async correctness under renovation pressure
- Quick verification

*The discipline on this page is proven by the VFUK trade-in renovation (`mce`, branch `feature/PROD-59385-vfuk-tradein-ripe-renovation`) — the first DTL tenant's eligibility journey, transcribed from prod config `flows/eligibility` v3.327.999. Citations point at that code.*

## What Renovation Is (and Isn't)

Renovation is still *building a flow* — everything in [creating-a-flow.md](creating-a-flow.md) and the ADRs applies. The extra discipline is twofold:

1. **The legacy config document is a research instrument, not a runtime dependency.** You transcribe its rules into code; the running app fetches no flow document (ADR-0005, config-divorced flow-in-code). In VFUK, every `flows/eligibility` reference left in source is a provenance *comment*, never a fetch.
2. **Stage 1 preserves observable behaviour exactly.** Product changes — however tempting — are Stage 2 and deferred. Stage 1's only promise is parity.

## The Stage-1 Loop

1. **Reverse-engineer the legacy flow into a human-readable behaviour map.** Steps in order, every gate/skip/fail rule, per-OS or per-dimension variations, the terminal outcomes. This is [Step 0](creating-a-flow.md#step-0-the-journey-is-a-human-decision), recovered from code instead of designed.
2. **Transcribe every config rule into code** — the step list into a `FlowDefinition`, the gating/branching/fail-semantics into the brain + pure `modules/*.rules.ts`. VFUK's `eligibility.rules.ts` opens with "transcribed VERBATIM from the prod `flows/eligibility` config" — that's the standard.
3. **Reproduce quirks on purpose** (section below). A future reader must not "fix" them in Stage 1 — leave a comment citing the parity requirement.
4. **Verify behaviour parity** step-by-step against the legacy app, then keep a decision trail (see the `show-me-your-work` skill) so a reviewer can trust the reproduction.

## Per-Dimension Step Resolution at `flowStart`

Legacy config services overlay steps per device dimension (OS, model). In code: hold the **union** of variant steps in the definition and drop the wrong variant when the flow starts.

```typescript
// [contract-only] mce eligibility.definition.ts:49-52 — union in the definition, resolved at start
export function resolveEligibilitySteps(deviceOs: DeviceOs): string[] {
	const droppedTwin = deviceOs === 'ios' ? FRP_TWIN : FMIP_TWIN;
	return eligibility.steps.filter((step) => step !== droppedTwin);
}
```

The definition carries both account-lock twins (`FmipQuestion` / `FrpQuestion`); resolution drops one, yielding the legacy 12-step run list. Both start paths (the boot pipeline and the route-mount backup) resolve identically — a divergence there is a parity bug. This requires a `flowStart` that accepts a resolved `steps` payload — VFUK's engine does (`flows.reducer.ts:35`); canonical `ripe-flows` doesn't yet, so a project renovating on canonical adds that first.

## The Skip-Predicate Inversion — Absorb It Exactly Once

If the legacy dialect uses an object predicate whose **truth means skip**, invert it in one place. Absorbing the inversion twice silently re-flips it.

```typescript
// [contract-only] mce eligibility.rules.ts:116-127 — the single inversion
export function shouldRunStep(rule, context): boolean {
	const predicate = rule.predicate;
	if (!predicate) return true;
	if (predicate.type === 'OS') return context.deviceOs !== predicate.os;
	const referenced = context.verdictOf(predicate.stepId);
	const skipSignal = referenced === undefined ? !predicate.expectedResult : referenced.passed === predicate.expectedResult;
	return !skipSignal; // ← legacy truth = SKIP; inverted here and nowhere else
}
```

Related cascade rule: the advance walk records each gate-skip into its walk context **before** evaluating the next step (`resolveAdvance`, `eligibility.rules.ts:144-163`), mirroring legacy's "record each skip into the results map as you go". Skip it and later predicates read stale verdicts.

## User-Skip vs Gate-Skip — Different Verdicts

They have different downstream meaning; conflating them once let a skipped step count a walk eligible — a real logged bug. VFUK distinguishes **three** shapes:

| Verdict shape | Meaning | Pricing | Outcome |
|---|---|---|---|
| `{ passed: false, skipped: true }` (no `answer`) | **gate-skip** — a predicate removed the step | contributes nothing | not a meaningful failure |
| `{ passed: false }` | **fail — and USER skip folds to this** | sends the *fail* option id | meaningful failure |
| `{ passed: false, skipped: true, answer }` | a "Yes, damaged" answer — skipped-shaped but answered | contributes the fail option id | meaningful failure |

The user-skip fold is deliberate (`foldTestVerdict`, `eligibility.brain.ts:124-132`; product ruling 2026-07-19: "the skip for trading should mean fail") — legacy finds no result option for a Skipped verdict and falls back to the FAIL option, so the renovation reproduces that. The `skipped: true` marker stays reserved for gate-skips; the presence of `answer` is what separates an answered skip-shape from a pure gate-skip.

## Reproduce Quirks on Purpose

Behaviour-preserving means legacy quirks are *kept*, not cleaned up, each with a comment citing the parity requirement:

- **"Unknown test counts as pass."** VFUK's battery check bakes `passOnUnknown`: an absent/rejected reading normalizes to `health: unknown`, which is in the passing set (`eligibility.battery.ts` — `withinRangeOrUnknown`, `UNKNOWN_BATTERY_STATS`). A hard *timeout* is still a fail; a *rejection* is Unknown → pass — that distinction is itself a recorded ruling.
- **Per-OS predicate gating** — steps gated by OS, not reordered.
- **A skip that folds to a fail for pricing** (the table above).

## Async Correctness Under Renovation Pressure

Renovated steps often front real probes (battery stats, OTAC, IMEI checks). Two patterns VFUK proves are load-bearing:

- **A synchronous in-flight lock + re-check-after-await triad.** The recorded-verdict guard alone leaves a pre-await double-dispatch window; hold a closure lock (`batteryCheckInFlight`), and after *every* `await` re-check: status still active? still the current step? verdict not already recorded? (`eligibility.brain.ts:178-231` — the triad runs twice, after the probe and again after the success-animation hold.) The general rule is in [the-brain-listener.md → async intake](the-brain-listener.md#async-intake-on-entry).
- **Distinguish "check failed" from "check negative".** An IMEI-blacklist *lookup error* records a retryable non-terminal reason; a *real* blacklist hit is terminal (`eligibility.brain.ts:282-316`). Collapsing them turns an outage into a rejection.

## Quick Verification

- [ ] The behaviour map exists in writing and the owner signed off on it
- [ ] Every legacy rule is transcribed into a pure `modules/*.rules.ts` function; the app fetches no flow document
- [ ] The definition holds the union of variant steps; one resolver drops variants at `flowStart`, used by *every* start path
- [ ] The skip-when-true inversion is absorbed exactly once
- [ ] User-skip and gate-skip produce distinct verdict shapes with the intended pricing/outcome fold
- [ ] Every reproduced quirk carries a comment citing the parity requirement
- [ ] Async listeners hold an in-flight lock and re-check flow state after every `await`
- [ ] Parity verified step-by-step against the legacy app, with a decision trail
