# Hook Configurations

## Overview

Ripe projects use a layered quality gate stack. Hooks are split between **global** (all projects) and **per-project** (project-specific paths and tools).

**Install hooks automatically:**
- Developers: `npx ripe-skills hooks` (global) or `npx ripe-skills hooks --local` (project)
- Agents: run `install-hooks.sh` bundled in this skill folder

## Quality Gate Stack

| Layer | Scope | Hook Event | What Runs | Fail Behavior |
|-------|-------|-----------|-----------|---------------|
| Typecheck | Per-project | PostToolUse (Write\|Edit .ts/.tsx) | `tsc --noEmit` | Show errors |
| PROGRESS.md guard | Per-project | PostToolUse (Write\|Edit PROGRESS.md) | Smart checks | Show warnings |
| Push guard | Global | PreToolUse (Bash git push) | Confirmation prompt | Exit 2 (feedback) |
| Typecheck gate | Global | Stop | `tsc --noEmit` | Exit 2 (block exit) |
| PROGRESS.md trim | Global | Stop | Row count check | Exit 2 (block exit) |
| Spec review | Orchestrator | Post-task | Pass 1: spec compliance | Dispatch fix agent |
| Ripe audit | Orchestrator | Post-task | Pass 2: code quality | Dispatch fix agent |
| Human review | Checkpoint | Session end | Human reads diff | Approve or redirect |

## Hook Exit Codes

| Exit Code | Meaning |
|-----------|---------|
| 0 | Success — proceed normally |
| 1 | Error — hook itself failed (shown as warning) |
| 2 | **Feedback** — send message back to agent, don't stop |

Exit code 2 is how Stop hooks enforce "don't stop until typecheck passes."

---

## Global Hooks (`~/.claude/settings.json`)

These apply to all Ripe projects. They don't reference project-specific paths.

### Push Guard (PreToolUse)

Prevents accidental `git push` without confirmation.

```json
{
  "matcher": "Bash(git push*)",
  "hooks": [
    {
      "type": "command",
      "command": "echo 'Push requires human confirmation' && exit 2"
    }
  ]
}
```

### Typecheck Gate (Stop)

Blocks session exit if TypeScript errors exist. Uses `git rev-parse` to auto-locate the project root.

```json
{
  "hooks": [
    {
      "type": "command",
      "command": "bash -c 'ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0; if [ -f \"$ROOT/tsconfig.json\" ]; then cd \"$ROOT\" && ERRORS=$(npx tsc --noEmit 2>&1); if [ $? -ne 0 ]; then echo \"$ERRORS\" | tail -10; echo \"{\\\"systemMessage\\\": \\\"Typecheck failed — fix before ending session.\\\"}\"; exit 2; fi; fi'"
    }
  ]
}
```

### PROGRESS.md Trim Gate (Stop)

Warns if PROGRESS.md exceeds 7 task rows.

```json
{
  "hooks": [
    {
      "type": "command",
      "command": "bash -c 'ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0; if [ -f \"$ROOT/PROGRESS.md\" ]; then ROWS=$(grep -c \"^| [0-9]\" \"$ROOT/PROGRESS.md\" 2>/dev/null || echo 0); if [ \"$ROWS\" -gt 7 ]; then echo \"{\\\"systemMessage\\\": \\\"PROGRESS.md has $ROWS task rows (max 7) — archive completed tasks before ending session.\\\"}\"; exit 2; fi; fi'"
    }
  ]
}
```

---

## Per-Project Hooks (`.claude/settings.json`)

These reference project-specific tools (tsc, vitest) and paths. Place in `.claude/settings.json` at the project root.

### Typecheck on Edit (PostToolUse)

Runs `tsc --noEmit` after editing `.ts` or `.tsx` files. Silent on success, shows errors on failure.

```json
{
  "matcher": "Write|Edit",
  "hooks": [
    {
      "type": "command",
      "command": "bash -c 'FILE=\"$CLAUDE_FILE_PATH\"; if [[ \"$FILE\" == *.ts || \"$FILE\" == *.tsx ]]; then ERRORS=$(npx tsc --noEmit --pretty 2>&1); if [ $? -ne 0 ]; then echo \"$ERRORS\" | head -20; fi; fi'"
    }
  ]
}
```

### PROGRESS.md Smart Guard (PostToolUse)

Fires on any edit to PROGRESS.md. Runs five checks:

1. **Task Completion Flow reminder** — always reminds to reflect/archive/trim
2. **Row count > 7** — warns to archive completed tasks
3. **Done without commit hash** — catches `done` rows with `—` in commit column
4. **Multiple in-progress** — flags if >1 task is `in progress` simultaneously
5. **TASK-ARCHIVE.md missing** — warns if archive file doesn't exist

```json
{
  "matcher": "Edit|Write",
  "hooks": [
    {
      "type": "command",
      "command": "bash -c 'FILE=\"$CLAUDE_FILE_PATH\"; if [[ \"$FILE\" != *PROGRESS.md ]]; then exit 0; fi; ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || ROOT=$(dirname \"$FILE\"); MSG=\"\"; ROWS=$(grep -c \"^| [0-9]\" \"$FILE\" 2>/dev/null || echo 0); if [ \"$ROWS\" -gt 7 ]; then MSG=\"$MSG PROGRESS.md has $ROWS task rows (max 7) — archive oldest done rows.\"; fi; DONE_NO_HASH=$(grep -E \"^\\|.*done.*\\|[[:space:]]*—[[:space:]]*\\|\" \"$FILE\" 2>/dev/null | wc -l | tr -d \" \"); if [ \"$DONE_NO_HASH\" -gt 0 ]; then MSG=\"$MSG $DONE_NO_HASH task(s) marked done without a commit hash.\"; fi; IN_PROG=$(grep -c \"in progress\" \"$FILE\" 2>/dev/null || echo 0); if [ \"$IN_PROG\" -gt 1 ]; then MSG=\"$MSG $IN_PROG tasks are in progress simultaneously — is this intentional?\"; fi; if [ ! -f \"$ROOT/TASK-ARCHIVE.md\" ]; then MSG=\"$MSG TASK-ARCHIVE.md not found — create it before archiving tasks.\"; fi; echo \"{\\\"systemMessage\\\": \\\"Task edited in PROGRESS.md — execute Task Completion Flow: reflect → archive → trim → backfill → commit.$MSG\\\"}\"; '"
    }
  ]
}
```

---

## Git Hooks (Optional, via Husky)

For teams using Husky or git hooks directly:

**pre-commit:**
```bash
#!/bin/sh
ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"
npx vitest run --reporter=dot 2>&1 | tail -5
npx tsc --noEmit 2>&1 | tail -5
```

**post-commit:**
```bash
#!/bin/sh
echo "Committed. Remember to update PROGRESS.md if this completes a task."
```

---

## Verifying Hooks Are Installed

After installation, verify with:

```bash
# Global hooks
cat ~/.claude/settings.json | grep -A2 '"matcher"'

# Per-project hooks
cat .claude/settings.json | grep -A2 '"matcher"'
```

Expected matchers:
- Global: `Bash(git push*)` (PreToolUse), two Stop hooks
- Per-project: `Write|Edit` (typecheck), `Edit|Write` (PROGRESS.md guard)
