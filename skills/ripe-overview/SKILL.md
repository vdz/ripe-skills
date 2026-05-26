---
name: ripe-overview
description: Reads a Ripe project and writes a narrative report on its current state, recent history, simplicity score, and likely next moves. Use when starting work on an unfamiliar Ripe project, returning after a break, refreshing context after compaction, or onboarding a teammate. Produces an HTML report at <project>/docs/overview/<YYYY-MM-DD-HHmm>-ripe-overview.html with auto dark/light mode based on local time. Triggers on "explain this project", "where are we", "give me an overview", "what's the state of things", "/ripe-overview". Not an audit (that's `ripe-audit`); this is project state in prose plus a simplicity score.
---

# Ripe Overview

## Mission

**Read the project. Write about it.** The Overview is a magazine column about the codebase — not a reference doc, not metrics, not a diagram. It tells you where the project is, where it's been, what its simplicity looks like across five dimensions, and what's worth picking up next.

Useful every time it runs, because the project moved.

## When to use

- Starting work on an unfamiliar Ripe project
- Returning to a project after a break of more than a day
- Refreshing context after a `/clear` or after compaction
- Onboarding a teammate or another agent
- Triggers: "explain this project", "give me an overview", "where are we", "/ripe-overview", "what's the state of things"

**Not** for: rule compliance (use `ripe-audit`), domain glossary (use `improve-codebase-architecture`), running notes in conversation (use `taking-notes`).

## How to run

1. Read all sources per the **Signals** table below — cheaply (sizes, counts, mtimes, `git log` summaries; never full source files).
2. Compute the **simplicity score** across 5 dimensions (state, logic, TSX, routing, docs) per the rubric below.
3. Write the narrative — three sections in the voice prescribed by [writing-style.md](writing-style.md).
4. Render into [report-template.html](report-template.html) with section content + the simplicity scores. The template auto-switches dark/light based on local hour.
5. Write to `<project>/docs/overview/<YYYY-MM-DD-HHmm>-ripe-overview.html`. Create the folder if needed.
6. Report the file path back to the user.

Total runtime budget: ~15 seconds. If reading takes longer, narrow the scope (commit window, doc scan depth).

## Output schema

The HTML has 6 blocks. Each has explicit rules.

### Block 1 — Header
Project name · branch + short SHA · timestamp. One line, monospace.

### Block 2 — Where you are (2 paragraphs)
- **P1** (~50 words): branch shape + data gravity + active vs quiet branches. Specific counts.
- **P2** (~50 words): current "phase" of the project — derived from design-docs-to-recent-commits ratio + open handoffs spread.

Voice: present tense. Observations first; phase label last.

### Block 3 — Simplicity (visual panel)
Radar chart of 5 dimensions + composite score 0–100. Per dimension, a one-line interpretation. See **Simplicity rubric** below for how each is computed.

### Block 4 — Where you've been (2 paragraphs)
- **P1** (~60 words): trajectory — "three weeks ago this was X; since then Y happened". Cite structural-commit SHAs.
- **P2** (~40 words): audit trend — change in H/M/L counts over time, plus what that says.

Voice: past tense. Inline SHAs and dates.

### Block 5 — Where you might go (intro + list + closing)
- **Intro** (~20 words): one sentence framing.
- **List**: 3–5 named open threads. Per item: thread name (bold), one sentence of state, suggested next move. File paths inline.
- **Closing** (~30 words): committed leverage pick — no hedging.

Voice: conditional. List items are the only list in the document.

### Block 6 — Footer
Run metadata: timestamp, runtime, input counts, React major + RTK major.

## Simplicity rubric

Each dimension scores 0–100. The composite is a weighted average; defaults shown.

### State management simplicity (weight 25)
- Branch count: ideal 4–8. Penalty outside.
- Average branch size: ideal < 600 lines. Penalty above.
- No branch exceeds 1500 lines (steep penalty if violated).
- Dual-structure pattern in collections (`items` + `byId`): bonus for compliance.

Heuristic: `wc -l src/store/*/*.ts` per branch; flag outliers.

### Business logic simplicity (weight 25)
- Listener count total: ideal 10–40 across all branches. Outside → penalty.
- Average listener `.ts` file size: ideal < 250 lines.
- No listener file exceeds 500 lines (penalty if violated — the audit's M1 case).
- Ratio of "uses `getOriginalState`" or "uses `cancelActiveListeners`" → bonus (indicates richer pattern coverage).

Heuristic: count `Listener[]` entries; `wc -l` on `*.listener.ts`.

### TSX structure simplicity (weight 20)
- Component count: ideal 10–80. Outside → penalty.
- Average component file size: ideal < 150 lines.
- No component exceeds 250 lines (penalty if violated — clean-code threshold).
- Ratio of components with `.styled.tsx` peer: bonus for separation.

Heuristic: `wc -l src/components/**/*.tsx`; check `.styled.tsx` co-location.

### Routing simplicity (weight 15)
- Route count: ideal 5–25. Outside → penalty.
- One `setLocation` listener entry per branch (penalty for more).
- Idempotency guards present in route-driven dispatches (audit C1 / ROUTING-H).

Heuristic: count routes in `src/router/routes.tsx`; grep `actionCreator: setLocation` per branch.

### Documentation simplicity (weight 15)
- `CLAUDE.md` exists and < 300 lines (high score). Missing or > 600 (low).
- `docs/` structure has conventional subfolders (`audits/`, `handoffs/`, `plans/`, `designs/`) — bonus for each present.
- `CONTEXT.md` or `docs/adr/` present — bonus.

Heuristic: file existence + line counts.

### Composite
Weighted sum of the five, normalised to 0–100. A score in the 70s+ is "healthy"; 50–70 "fine"; below 50 "creaking".

## Signals — what to read

| Source | What | Section it feeds |
|---|---|---|
| `src/store/*/` | branch list, file counts, line totals, mtimes | Block 2 (state shape) + Block 3 (simplicity) |
| `src/components/*/` | component count, size distribution | Block 2 + Block 3 |
| `src/router/` | routes count, hydration listener count | Block 3 |
| `git log --since=3.weeks --oneline` | commit subjects, clusters, structural-commit SHAs | Block 4 (trajectory) |
| `docs/audits/*.html` | title, severity counts (regex), mtime | Block 4 (trend) |
| `docs/handoffs/*.md` | title, status from frontmatter or first paragraph | Block 5 (open work) |
| `docs/plan/*.html` | title, status, mtime | Block 5 |
| `docs/designs/*.html` | title, mtime, "in code / not in code" signal | Block 5 |
| `CLAUDE.md` | "Open items", "Ripe deviations" sections | Block 5 + Block 3 (docs simplicity) |
| `docs/adr/` | ADR titles + dates | Block 4 + Block 3 |
| `CONTEXT.md` | glossary terms (for terminology citation) | Cross-section + Block 3 |
| `package.json` | React major, RTK major | Block 6 footer |

## Output path & filename

```
<project>/docs/overview/<YYYY-MM-DD-HHmm>-ripe-overview.html
```

Dated archive. Past reports stay around for diffing. No symlink to "latest" — agents reading should pick by mtime.

## What this skill won't do

- **Not an audit.** Doesn't list rule violations or grade per-rule. Severity-count *trends* from existing audit reports are fair game; running fresh checks isn't.
- **Not a diagram.** No tree, no graph, no atlas. The simplicity radar is the only visualisation; everything else is prose.
- **Not metrics-only.** Numbers anchor the prose; they don't replace it.
- **No code changes.** Read-only.
- **No git operations beyond `git log`.** No `git status` dependency; works on dirty working trees.
- **Doesn't invoke other skills.** Reads `ripe-audit` output if present; never runs `ripe-audit` itself.

## Voice (short — full rules in writing-style.md)

1. Tense per section: present / past / conditional.
2. Specific numbers, never vague quantifiers.
3. File paths and SHAs inline.
4. Observation before summary.
5. No AI-isms (banned word list).
6. Length budgets per section (50/50/60/40/30 words).
7. No hedging on the leverage pick.
8. No headers within sections.

See [writing-style.md](writing-style.md) for examples and the banned-word list.

## References

| Document | When to read |
|---|---|
| [writing-style.md](writing-style.md) | Before writing the narrative; voice rules with do/don't examples |
| [report-template.html](report-template.html) | Template skeleton; substitute section content + simplicity scores |
| `ripe-audit` skill | For the audit-trend data; never run, only read past reports |
| `ripe-init` skill | For knowing what a fresh-scaffold project looks like (so the Overview gracefully handles "no history yet") |
