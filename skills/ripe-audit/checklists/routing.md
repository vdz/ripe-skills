# Routing Checklist — against `building-ripe-routing`

---

## ROUTING-H-IDEM — setLocation listener branch without idempotency guard

**Rule source:** building-ripe-routing/SKILL.md → "Idempotency in setLocation Listeners" (covers entry AND exit listeners)
**Severity:** H
**Heuristics:**
```
rg -nU 'actionCreator:\s*setLocation' src/store
```
For each hit, read the effect body. Flag any `dispatch(` call inside the effect that ISN'T preceded (in the same conditional branch) by a state-comparison guard. Also flag the inverse: a `state.x.y === ...` comparison followed by no early return — the next conditional branch may double-fire.
**False positives:**
- A dispatch whose effect is **truly idempotent** (e.g. `clearTransientUiState`, safe to call N times). Even then, prefer a guard for clarity. Flag with a comment, not as H.
**Fix template:** Wrap the dispatch in `if (state.x !== intendedValue) dispatch(...)`. Add `return` after each handled branch. See SKILL.md "Idempotency in setLocation Listeners".

---

## ROUTING-H-COMPONENT-FETCH — Component fetches data on mount

**Rule source:** building-ripe-routing/SKILL.md → "Preemptive Hydration via Listeners"; building-ripe-components anti-pattern
**Severity:** H
**Heuristics:**
```
rg -nU 'useEffect\([^)]+\)\s*=>\s*\{[^}]*dispatch\([^)]*[Ff]etch' src/components
```
**False positives:**
- The router→store bridge in `App.tsx` — this is the one legitimate `setLocation` dispatch from `useEffect`.
**Fix template:** Move the fetch trigger into a `setLocation` listener in the data-owning branch. Component just reads `state.X.byId[id]`.

---

## ROUTING-M-URL-DERIVED-STATE — Reading the URL at component render time instead of state

**Rule source:** building-ripe-routing/SKILL.md → "State is the source of truth — listeners reconcile URL → state"
**Severity:** M
**Heuristics:**
```
rg -nE 'matchPath\(' src/components
rg -nE 'useLocation\(\)' src/components | rg -v 'App\.tsx'   # App.tsx is the bridge
```
**False positives:**
- `useParams()` for an ID that the component uses purely as a selector key — acceptable (the listener already updated state from the URL by the time the component renders).
**Fix template:** Move the URL inspection to a `setLocation` listener that updates state accordingly. The component reads state, not the URL.

---

## ROUTING-L-CENTRAL-ORCHESTRATOR — A listener that orchestrates other listeners

**Rule source:** building-ripe-store/listeners.md → "Pattern 7: Listener Concurrency" ("You do not need: a 'central orchestrator' listener")
**Severity:** L
**Heuristics:**
- Look for `setLocation` listeners that dispatch many actions in sequence with `await`s between them, or that re-dispatch `setLocation`-derived actions to "trigger" other listeners.
- Look for listener files that import from many branches and dispatch into many.
**False positives:**
- A bridge listener that legitimately fans out a single intent (e.g. `setLocation` → `selectDemo`) — this is Pattern 7, not orchestration.
**Fix template:** Each branch should own its own `setLocation` listener. Remove the orchestrator; let RTK's concurrency model fire all matching listeners in parallel.

---

## OK — Sections to verify and report compliant

- All `setLocation` listener branches have idempotency guards → "OK — N/N setLocation dispatch branches guarded"
- All components read state, not URL (except App.tsx bridge) → "OK — no URL-derived rendering"
- All hydration via listeners, not component `useEffect` → "OK — components are passive projections"
