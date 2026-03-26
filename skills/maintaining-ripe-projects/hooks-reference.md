# Hook Configurations

## Quality Gate Stack

Layered from fastest to most thorough:

| Layer | Hook Event | What Runs | Fail Behavior |
|-------|-----------|-----------|---------------|
| Format | PostToolUse (Write\|Edit) | Prettier | Auto-fix |
| Lint | PostToolUse (Write\|Edit) | ESLint | Auto-fix |
| Typecheck | PostToolUse (Write\|Edit .ts/.tsx) | `tsc --noEmit` | Show errors |
| Tests | Pre-commit (git hook) | `vitest run` | Block commit |
| Spec review | Post-task (orchestrator) | Pass 1: spec compliance | Dispatch fix agent |
| Ripe audit | Post-task (orchestrator) | Pass 2: code quality | Dispatch fix agent |
| Human review | Checkpoint or session end | Human reads diff | Approve or redirect |

## Hook Exit Codes

| Exit Code | Meaning |
|-----------|---------|
| 0 | Success — proceed normally |
| 1 | Error — hook itself failed (shown as warning) |
| 2 | **Feedback** — send message back to agent, don't stop |

Exit code 2 is how Stop hooks enforce "don't stop until typecheck passes":

```bash
#!/bin/sh
# Stop hook: block exit if typecheck fails
cd src/apps/cloud/lstv-portal
if ! npx tsc --noEmit 2>&1 | tail -5; then
  echo "Typecheck failed — fix before stopping."
  exit 2  # sends feedback, agent keeps working
fi
exit 0
```

## Claude Code Settings (`.claude/settings.json`)

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "bash -c 'FILE=\"$CLAUDE_FILE_PATH\"; if [[ \"$FILE\" == *.ts || \"$FILE\" == *.tsx ]]; then cd /path/to/project && npx tsc --noEmit --pretty 2>&1 | head -20; fi'"
          }
        ]
      },
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "bash -c 'if [[ \"$CLAUDE_FILE_PATH\" == *PROGRESS.md ]]; then echo \"{\\\"systemMessage\\\": \\\"Task marked done? Execute Task Completion Flow: reflect → archive → trim → backfill → commit\\\"}\"; fi'"
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Bash(git push*)",
        "hooks": [
          {
            "type": "command",
            "command": "echo 'Push requires human confirmation' && exit 2"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash -c 'cd /path/to/project && npx tsc --noEmit 2>&1 | tail -5 || exit 2'"
          }
        ]
      },
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash -c 'if [ -f PROGRESS.md ]; then ROWS=$(grep -c \"^|\" PROGRESS.md 2>/dev/null || echo 0); ROWS=$((ROWS - 2)); if [ \"$ROWS\" -gt 7 ]; then echo \"{\\\"systemMessage\\\": \\\"PROGRESS.md has $ROWS tasks (max 7) — archive completed tasks before ending session\\\"}\"; fi; fi'"
          }
        ]
      }
    ]
  }
}
```

## Git Hooks (via Husky)

**pre-commit:**
```bash
#!/bin/sh
cd src/apps/cloud/lstv-portal  # adjust path
npx vitest run --reporter=dot 2>&1 | tail -5
npx tsc --noEmit 2>&1 | tail -5
```

**post-commit:**
```bash
#!/bin/sh
echo "Committed. Remember to update PROGRESS.md if this completes a task."
```
