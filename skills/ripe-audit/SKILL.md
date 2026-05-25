---
name: ripe-audit
description: Audit a Ripe codebase for maintenance quality — Ripe-skill compliance, clean-code heuristics, and organisational shape. Produces an interactive HTML report at <project>/docs/audits/<date>-ripe-audit.html with H/M/L-graded findings the reviewer can comment on. Use when the user asks to audit, review for Ripe adherence, or check maintainability before merging / handing off a project.
---

# Ripe Audit

## Mission

**Is the system simple and tiny enough that anyone can pick it up and maintain it?**

The audit answers this through three lenses:

1. **Ripe compliance** — does the code follow the patterns in `building-ripe-store`, `building-ripe-components`, `building-ripe-routing`? Reducers stay dumb? Listeners own logic? Components are passive? Routes drive composition?
2. **Clean code** — are individual files small enough to read in one sitting? Are components shallow enough to follow? Are helpers in the right scope? Is dead code present?
3. **Organisation** — does the folder structure match conventions? Are imports consistent (`@` alias usage)? Are types co-located? Are tests where they should be?

A passing audit means a new contributor can read any file in the project and understand what it's doing without having to chase definitions through ten other files. That's the bar.

## When to use

- User says: "audit this for Ripe adherence" / "check this against the Ripe skills" / "review the X branch / src/components against Ripe rules"
- After a feature lands, before merging to main
- On a fresh project before opening it up to team contributions
- When `/ripe-audit` is invoked as a slash command (with or without a scope path)

## How to run

1. Read the checklists for each lens — `checklists/components.md`, `checklists/store.md`, `checklists/routing.md`, `checklists/clean-code.md`, `checklists/organisation.md`.
2. For each check, run the listed greps / heuristics across the project's source tree (`src/` by default, or the scope path passed via `/ripe-audit <scope>`).
3. For each hit, **auto-grade** per `grading.md` (H/M/L). The reviewer can override in their per-card comment.
4. Read the project's `CLAUDE.md` — note any documented deviations and mark them as `(Skip)` rather than re-litigating.
5. Generate the HTML report at `<project>/docs/audits/<YYYY-MM-DD>-ripe-audit.html` using `report-template.html` as the skeleton.
6. Tell the user the report path. They open it, comment per-finding, hit "Copy all comments", paste back.

See `runner.md` for the full end-to-end sequence.

## Scope

Default: full current state of the project (`src/` tree). The scope can be narrowed via `/ripe-audit <path>` — e.g. `/ripe-audit src/store/upload` for a focused pass.

The audit does NOT modify source files. It only reads. Fixes are the reviewer's call after they see the report.

## Output format

HTML at `<project>/docs/audits/<YYYY-MM-DD>-ripe-audit.html`. Same shape as the existing review formats in `mce-demo-portal/docs/audits/`:

- Sticky header with date, branch, commit, copy-comments button
- Mission statement banner ("is the system simple and tiny enough...")
- Severity counts table (H / M / L / OK / Skip)
- Sections per lens (Ripe compliance / clean code / organisation), each finding as a card
- Per-card: location (`path:line`), rule citation, what's wrong, fix as code, why it matters, severity badge
- Per-card: comment textarea for reviewer override
- Verified-compliant ("OK") section at the bottom
- Appendix: skipped / documented-deviation items

The HTML's JavaScript MUST use literal `>` and `&` characters inside `<script>` blocks — browsers don't decode entities inside `<script>`, and entity-escaped JS is a silent parse error. See `report-template.html`.

## Skill OR /ripe-audit slash command — both

Ship as both:

- **Skill** — invoked by intent. "Audit this for Ripe adherence" → the skill runs.
- **Slash command** — `/ripe-audit [scope]` for explicit triggering. Scope defaults to whole repo; can be a path for focused passes. The command wraps the skill invocation.

## Files

| File | What's in it |
|---|---|
| [grading.md](grading.md) | H/M/L/OK/Skip rubric. Auto-grade logic. |
| [runner.md](runner.md) | End-to-end execution sequence — from invocation to report. |
| [checklists/components.md](checklists/components.md) | Per-rule checks against `building-ripe-components` |
| [checklists/store.md](checklists/store.md) | Per-rule checks against `building-ripe-store` |
| [checklists/routing.md](checklists/routing.md) | Per-rule checks against `building-ripe-routing` |
| [checklists/clean-code.md](checklists/clean-code.md) | File size, JSX depth, helper count, dead code |
| [checklists/organisation.md](checklists/organisation.md) | Folder structure, imports, naming, test locations |
| [report-template.html](report-template.html) | Skeleton interactive HTML — fill in findings, write to project's docs/audits/ |
