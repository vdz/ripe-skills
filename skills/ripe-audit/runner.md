# Runner — End-to-End Execution

This is the sequence an agent follows when the audit is invoked.

## 1. Resolve scope

- Default: full `src/` of the current working directory.
- If invoked as `/ripe-audit <path>`: scope is `<path>` (resolve relative to project root).
- Confirm the scope path exists; if not, ask the user.

## 2. Read context

- Project's `CLAUDE.md` (for documented deviations + any "open items" / "Ripe alignment" sections).
- Project's `docs/audits/` directory if it exists — prior audits inform what was already addressed.
- Run `git status` and `git log -1 --format='%h %s'` to capture branch + commit for the report header.

## 3. Run each checklist

Process in this order; findings accumulate into a single report:

1. `checklists/store.md` — usually the most findings, biggest leverage.
2. `checklists/components.md`
3. `checklists/routing.md`
4. `checklists/clean-code.md`
5. `checklists/organisation.md`

For each check:
- Run the listed grep(s) / heuristic(s).
- For each hit, read enough of the file to confirm it's a true positive (not a false positive listed in the check's "False positives" notes).
- Auto-grade per `grading.md`.
- Capture: location (`path:line`), the violating excerpt, the rule citation, the fix template, the "why it matters" sentence.

Also capture **verified compliant** items — when a check finds no hits in code that COULD have had them (e.g. there are reducers, but none have business-decision `if`s), that's an OK finding worth recording.

## 4. Compose the report

- Use `report-template.html` as the skeleton.
- Fill in the header (date, branch, commit).
- For each finding, instantiate a card (see `report-template.html` for the card structure).
- Group by severity: H first, then M, then L. OK section at the bottom. Skipped (documented deviations) in an appendix.
- Severity counts table goes near the top.

## 5. Write the report

- Path: `<project>/docs/audits/<YYYY-MM-DD>-ripe-audit.html`. Create `docs/audits/` if it doesn't exist.
- If a report for today's date already exists, append a suffix: `-v2`, `-v3`, etc.

## 6. Tell the user

Concise message:
- Path of the report
- Severity counts (e.g. "3 H · 7 M · 4 L · 18 OK · 2 Skip")
- Top 2–3 H findings by ID and one-line summary
- "Open the HTML, comment per-finding, hit Copy all comments, paste back. I'll apply the accepted fixes."

## 7. Wait

The agent does NOT apply fixes from the audit. The reviewer must read, comment, copy back. Only then does the conversation move into fix-application.

If the reviewer is in auto-mode and they want fixes applied without review, ASK FIRST. Audit findings can be subtle; auto-applying without review is a recipe for regressions.

## Common pitfalls

- **Don't read full files when a grep window will do.** The agent's context is precious; pull surrounding lines with `rg -n -B 2 -A 4` rather than full Reads.
- **Don't list false positives in the report.** Each check's "False positives" notes exist so the auditor filters them BEFORE writing cards.
- **Don't try to fix in the audit pass.** Fixes happen in a separate turn after the reviewer responds.
- **HTML script bug.** Inside `<script>` blocks, use literal `>` and `&` characters. Browsers don't decode entities in scripts — entity-escaped JS is a silent parse error. The clipboard button will silently fail.
