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

## Output schema (visual-first)

The HTML has 7 blocks. Prose is concentrated in Block 2 and Block 6's leverage pick; everything else is visual artifacts that the reader scans in seconds.

### Block 1 — Header
Project name · branch + short SHA · timestamp · composite simplicity score (small badge, top-right).

### Block 2 — Where you are (1 paragraph)
~60 words, present tense, drop cap. Branch shape + data gravity + current "phase". Observations first; phase label last. **No second paragraph** — the rest of the report shows what prose used to claim.

### Block 3 — Timeline (the centrepiece)
Horizontal scrollable SVG, last 3 weeks left-to-right, "today" marker at the right edge.

- **5 lanes** stacked: Commits · Audits · Designs · Handoffs · Plans
- **Dots per event**, sized by impact, coloured by lane. Audits coloured by severity (H/M/L).
- Hover → tooltip with SHA / path / one-line title.
- Below: **2-sentence framing**, not a paragraph. ("Eleven structural commits in three weeks; audit trend shrinking.")

### Block 4 — Stalled threads (list)
Files/branches with **no commits in N days** AND have an open handoff/design/plan pointing at them. Three to five items. Each item: thread name, days-since-last-touch, path of the pointing doc. Surfaces work that fell off the map.

If nothing is stalled: a single line "No stalled threads in the last N days." (signal in its own right.)

### Block 5 — Shipped vs drafted (two-column ledger)
For each `docs/designs/*.html` and `docs/plan/*.html`: did the corresponding code land?

Heuristic: grep the doc's filename slug (`editable-field-lifecycle` → `edit`/`editable`/`inline-edit`) against `git log --since=4.weeks --pretty=%s`. Match = shipped. No match within 7 days of the doc's mtime = drafted.

Two columns:
- **Shipped** — doc + matching commit SHA
- **Drafted (pending)** — doc + days since drafted

Sorted by recency within each column.

### Block 6 — Branch heat map (small grid)
14 columns (last 14 days) × N rows (branches). Each cell shaded by commit count that day. Reveals data gravity visually — a glance shows which branches are hot.

Cell shades: 0 = empty, 1 = soft, 2-3 = medium, 4+ = full accent.

### Block 7 — Where you might go (intro + list + pick)
- **Intro** (~20 words): one sentence framing the open threads.
- **List**: 3–5 named open threads. Each: thread name (bold), one sentence, path inline.
- **Closing pick** (~30 words): committed leverage pick, no hedging.

Voice: conditional. The only list-with-prose-narration in the document.

### Block 8 — Footer
Run metadata: timestamp, runtime, input counts, React major + RTK major.

## Simplicity composite (single number)

A composite 0–100 score lives in the header badge. The five sub-dimensions are computed but **not displayed** in the overview — they belong in `ripe-audit`'s detail. The composite is the at-a-glance signal.

Composite = weighted average of:
- **State management** (25): branch count ideal 4–8; sizes < 600 lines each; dual-structure compliance
- **Business logic** (25): listener count 10–40; sizes < 250 lines; no file > 500
- **TSX structure** (20): components 10–80; sizes < 150 lines; no file > 250; `.styled.tsx` co-location
- **Routing** (15): routes 5–25; one `setLocation` listener per branch; idempotency guards
- **Documentation** (15): `CLAUDE.md` < 300 lines; `docs/` subfolders present; `CONTEXT.md` / `docs/adr/` bonus

Bands: 70+ healthy · 50–69 fine · 30–49 strained · < 30 creaking.

Heuristics are cheap — `wc -l` per area, grep counts, file existence. Full dimensional breakdown lives in the `ripe-audit` skill's clean-code + organisation checklists; don't duplicate it here.

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
