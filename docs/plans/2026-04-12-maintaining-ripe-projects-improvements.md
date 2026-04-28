# Maintaining Ripe Projects — Skill Improvement Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the `maintaining-ripe-projects` skill with grilled-out decisions: better session lifecycle, promoted Learning Routing section, smart PROGRESS.md hooks, code-reviewer default for Pass 2, auto-install hooks via CLI and shell script, and updated README.

**Architecture:** All changes target the `ripe-skills` repo (`~/Dev/ripe-skills`). Skill files live under `skills/maintaining-ripe-projects/`. The CLI is `cli.js` at repo root. Changes are then synced to `~/.claude/skills/maintaining-ripe-projects/` via `npx ripe-skills` (or manual copy during dev).

**Tech Stack:** Markdown (skill files), Node.js (cli.js), Bash (hook install script)

**Repos:** `~/Dev/ripe-skills` (single repo, all changes here)

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `skills/maintaining-ripe-projects/SKILL.md` | Modify | Session lifecycle, Learning Routing promotion, skill update instructions |
| `skills/maintaining-ripe-projects/hooks-reference.md` | Rewrite | Global/local docs, smart PROGRESS.md checks, auto-install instructions |
| `skills/maintaining-ripe-projects/dispatch-protocol.md` | Modify | Pass 2 → code-reviewer default, Ripe skills as context |
| `skills/maintaining-ripe-projects/audit-checklist.md` | Modify | Add note about code-reviewer agent usage |
| `skills/maintaining-ripe-projects/install-hooks.sh` | Create | Agent-facing auto-install shell script |
| `cli.js` | Modify | Add `hooks` command with `--global`/`--local` flags |
| `README.md` | Modify | Quick Setup section at top, document `hooks` command |

---

### Task 1: Update SKILL.md — Session Lifecycle + Learning Routing

**Files:**
- Modify: `skills/maintaining-ripe-projects/SKILL.md`

This is the core skill file. Three changes:

**1a. Session Start — remove TASK-ARCHIVE.md, add parallel test sub-agent**

- [ ] **Step 1: Read current Session Start section (lines 139–148)**

Current:
```
### Session Start

1. Read CLAUDE.md — architecture, contracts, conventions
2. Read PROGRESS.md — where we left off (5-7 active tasks)
3. Read TASK-ARCHIVE.md (recent entries) — learn from past tasks
4. Read the plan — full scope, what's next
5. Run tests + type-check — confirm green baseline
6. Identify next task from PROGRESS.md
```

- [ ] **Step 2: Replace Session Start with revised version**

Replace lines 139–148 with:
```markdown
### Session Start

```
1. Read CLAUDE.md — architecture, contracts, conventions
2. Dispatch sub-agent to run tests + type-check (non-blocking)
3. Read PROGRESS.md — where we left off (5-7 active tasks)
4. Read the plan — full scope, what's next
5. Review test baseline report from sub-agent
6. Identify next task from PROGRESS.md
```

The test sub-agent runs in parallel while you read context. It reports:
- Pass/fail counts
- Which test files are failing

This is **informational, not a hard blocker** — mid-development tests may be legitimately failing. The orchestrator uses PROGRESS.md context (which tasks are in-progress) to judge whether failures are expected TDD red or regressions.
```

Also remove the standalone sentence after the block:
```
If tests or type-check fail, fix before starting new work.
```

Replace with:
```
If the test report shows unexpected failures (not covered by in-progress tasks), investigate before starting new work.
```

- [ ] **Step 3: Verify no broken internal references**

Search SKILL.md for any reference to "TASK-ARCHIVE.md" in the Session Start context. The file is still referenced elsewhere (Task Completion Flow, Learning Routing) — those references stay. Only the Session Start read is removed.

**1b. Promote Improvement Scan to top-level "Learning Routing" section**

- [ ] **Step 4: Cut the Improvement Scan subsection from Task Completion Flow (lines 119–131)**

Remove this entire subsection from inside Task Completion Flow:
```markdown
### Improvement Scan (Session End)

TASK-ARCHIVE.md is the **single intake** for all learnings. The scan **routes** each takeaway:

```
DESTINATION              │ WHEN TO USE
─────────────────────────┼──────────────────────────────────────
Skill update             │ Pattern applies to ALL Ripe projects
CLAUDE.md fix            │ Learning specific to THIS project
Hook addition            │ Enforcement can be automated
Feedback memory          │ Cross-project user preference
No action                │ One-off, not a pattern
```

Feedback memories are a **promotion** from the archive — only learnings that transcend the current project.
```

- [ ] **Step 5: Create new top-level "Learning Routing" section**

Insert a new `---` delimited section after Task Completion Flow and before Session Lifecycle. Content:

```markdown
---

## Learning Routing

TASK-ARCHIVE.md is the **single intake** for all learnings. Every takeaway from the Task Completion Flow gets routed through this table:

```
DESTINATION              │ WHEN TO USE                              │ HOW TO EXECUTE
─────────────────────────┼──────────────────────────────────────────┼──────────────────────────────────────────────
Skill update             │ Pattern applies to ALL Ripe projects     │ Invoke `writing-skills` skill (see example below)
CLAUDE.md fix            │ Learning specific to THIS project        │ Edit CLAUDE.md directly
Hook addition            │ Enforcement can be automated             │ Update hooks-reference.md + install via CLI
Feedback memory          │ Cross-project user preference             │ Save to Claude Code memory system
No action                │ One-off, not a pattern                   │ —
```

Feedback memories are a **promotion** from the archive — only learnings that transcend the current project.

### Skill Update Example

When the routing table points to "Skill update", invoke the `writing-skills` skill with:
- **Target file** — which skill file to change
- **What to change** — the specific rule, pattern, or instruction to add/modify
- **Why** — the takeaway that motivated it

Example invocation:
> "In `maintaining-ripe-projects/hooks-reference.md`, add a staleness signal for TASK-ARCHIVE.md referenced in CLAUDE.md but missing from disk. Reason: fresh clones fail silently when the archive file doesn't exist yet."
```

- [ ] **Step 6: Update Session End to reference Learning Routing by name**

In Session End (step 4), change:
```
4. Run Improvement Scan on TASK-ARCHIVE.md
```
to:
```
4. Run Learning Routing scan on TASK-ARCHIVE.md (see Learning Routing section)
```

**1c. Add missing staleness signal to CLAUDE.md Freshness table**

- [ ] **Step 7: Add row to Staleness Detection table**

Add this row to the end of the table:
```
| TASK-ARCHIVE.md linked but file missing | Create empty TASK-ARCHIVE.md with header |
```

- [ ] **Step 8: Commit**

```bash
cd ~/Dev/ripe-skills
git add skills/maintaining-ripe-projects/SKILL.md
git commit -m "refactor(maintaining): session lifecycle, learning routing promotion, staleness signal"
```

---

### Task 2: Rewrite hooks-reference.md — Global/Local Split + Smart Checks

**Files:**
- Rewrite: `skills/maintaining-ripe-projects/hooks-reference.md`

The current file mixes documentation and example configs without distinguishing global vs. local. It uses `/path/to/project` placeholders. Rewrite entirely.

- [ ] **Step 1: Read current hooks-reference.md**

Read `skills/maintaining-ripe-projects/hooks-reference.md` (already read — 111 lines).

- [ ] **Step 2: Write new hooks-reference.md**

```markdown
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

Fires on any edit to PROGRESS.md. Runs four checks:

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
```

- [ ] **Step 3: Commit**

```bash
cd ~/Dev/ripe-skills
git add skills/maintaining-ripe-projects/hooks-reference.md
git commit -m "rewrite(hooks-reference): global/local split, smart PROGRESS.md checks, verification"
```

---

### Task 3: Update dispatch-protocol.md — Code-Reviewer Default for Pass 2

**Files:**
- Modify: `skills/maintaining-ripe-projects/dispatch-protocol.md`

- [ ] **Step 1: Read current Two-Stage Review section (lines 98–130)**

Already read. The section describes Pass 1 (spec compliance) and Pass 2 (code quality) as manual checks.

- [ ] **Step 2: Replace Pass 2 section with code-reviewer default**

Replace lines 108–118:
```markdown
### Pass 2: Code Quality (Ripe Audit)

Use [audit-checklist.md](audit-checklist.md) for the full checklist. Key checks:

- Reducers: simple assignment only, no logic?
- Listeners: all business logic here?
- Components: passive, no useEffect for data?
- TSX return: semantic names only?

If either pass fails, dispatch a fix agent with specific issues — don't re-do the whole task.
```

With:
```markdown
### Pass 2: Code Quality (Ripe Audit)

**Default:** Dispatch the `superpowers:code-reviewer` agent with this context:
1. The [audit-checklist.md](audit-checklist.md) content
2. The relevant Ripe skill content — load `building-ripe-components`, `building-ripe-store`, and/or `building-ripe-routing` depending on which layers the task touched

The audit checklist is a quick-scan summary; the skills are the authoritative spec for code patterns, styling, naming, and structure.

If Pass 1 or Pass 2 fails, dispatch a fix agent with specific issues — don't re-do the whole task.
```

- [ ] **Step 3: Commit**

```bash
cd ~/Dev/ripe-skills
git add skills/maintaining-ripe-projects/dispatch-protocol.md
git commit -m "feat(dispatch-protocol): code-reviewer agent default for Pass 2 with Ripe skills context"
```

---

### Task 4: Update audit-checklist.md — Code-Reviewer Note

**Files:**
- Modify: `skills/maintaining-ripe-projects/audit-checklist.md`

- [ ] **Step 1: Read current audit-checklist.md (already read — 36 lines)**

- [ ] **Step 2: Add code-reviewer note at top**

After line 1 (`# Ripe Audit Checklist`), add:

```markdown

> **Preferred method:** Dispatch `superpowers:code-reviewer` agent with this checklist + the relevant Ripe skills (`building-ripe-components`, `building-ripe-store`, `building-ripe-routing`) as context. The checklist below is the quick-scan summary; the skills are the authoritative spec.
```

- [ ] **Step 3: Commit**

```bash
cd ~/Dev/ripe-skills
git add skills/maintaining-ripe-projects/audit-checklist.md
git commit -m "docs(audit-checklist): note code-reviewer agent as preferred method"
```

---

### Task 5: Create install-hooks.sh — Agent-Facing Auto-Install Script

**Files:**
- Create: `skills/maintaining-ripe-projects/install-hooks.sh`

- [ ] **Step 1: Write the script**

```bash
#!/usr/bin/env bash
set -euo pipefail

# ── Ripe Hooks Auto-Installer (Agent-Facing) ─────────────────────────────────
#
# Installs Ripe quality gate hooks into Claude Code settings.json.
# Merges with existing hooks — never overwrites.
#
# Usage:
#   bash install-hooks.sh              # install global hooks
#   bash install-hooks.sh --local      # install per-project hooks
#   bash install-hooks.sh --all        # install both global and per-project

MODE="${1:---global}"

GLOBAL_SETTINGS="$HOME/.claude/settings.json"
LOCAL_SETTINGS=".claude/settings.json"

# ── Global hook definitions ───────────────────────────────────────────────────

read -r -d '' GLOBAL_PRE_TOOL_USE << 'HOOKS_EOF' || true
{
  "matcher": "Bash(git push*)",
  "hooks": [
    {
      "type": "command",
      "command": "echo 'Push requires human confirmation' && exit 2"
    }
  ]
}
HOOKS_EOF

read -r -d '' GLOBAL_STOP_TYPECHECK << 'HOOKS_EOF' || true
{
  "hooks": [
    {
      "type": "command",
      "command": "bash -c 'ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0; if [ -f \"$ROOT/tsconfig.json\" ]; then cd \"$ROOT\" && ERRORS=$(npx tsc --noEmit 2>&1); if [ $? -ne 0 ]; then echo \"$ERRORS\" | tail -10; echo \"{\\\"systemMessage\\\": \\\"Typecheck failed — fix before ending session.\\\"}\"; exit 2; fi; fi'"
    }
  ]
}
HOOKS_EOF

read -r -d '' GLOBAL_STOP_PROGRESS << 'HOOKS_EOF' || true
{
  "hooks": [
    {
      "type": "command",
      "command": "bash -c 'ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0; if [ -f \"$ROOT/PROGRESS.md\" ]; then ROWS=$(grep -c \"^| [0-9]\" \"$ROOT/PROGRESS.md\" 2>/dev/null || echo 0); if [ \"$ROWS\" -gt 7 ]; then echo \"{\\\"systemMessage\\\": \\\"PROGRESS.md has $ROWS task rows (max 7) — archive completed tasks before ending session.\\\"}\"; exit 2; fi; fi'"
    }
  ]
}
HOOKS_EOF

# ── Local hook definitions ────────────────────────────────────────────────────

read -r -d '' LOCAL_TYPECHECK << 'HOOKS_EOF' || true
{
  "matcher": "Write|Edit",
  "hooks": [
    {
      "type": "command",
      "command": "bash -c 'FILE=\"$CLAUDE_FILE_PATH\"; if [[ \"$FILE\" == *.ts || \"$FILE\" == *.tsx ]]; then ERRORS=$(npx tsc --noEmit --pretty 2>&1); if [ $? -ne 0 ]; then echo \"$ERRORS\" | head -20; fi; fi'"
    }
  ]
}
HOOKS_EOF

read -r -d '' LOCAL_PROGRESS << 'HOOKS_EOF' || true
{
  "matcher": "Edit|Write",
  "hooks": [
    {
      "type": "command",
      "command": "bash -c 'FILE=\"$CLAUDE_FILE_PATH\"; if [[ \"$FILE\" != *PROGRESS.md ]]; then exit 0; fi; ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || ROOT=$(dirname \"$FILE\"); MSG=\"\"; ROWS=$(grep -c \"^| [0-9]\" \"$FILE\" 2>/dev/null || echo 0); if [ \"$ROWS\" -gt 7 ]; then MSG=\"$MSG PROGRESS.md has $ROWS task rows (max 7) — archive oldest done rows.\"; fi; DONE_NO_HASH=$(grep -E \"^\\|.*done.*\\|[[:space:]]*—[[:space:]]*\\|\" \"$FILE\" 2>/dev/null | wc -l | tr -d \" \"); if [ \"$DONE_NO_HASH\" -gt 0 ]; then MSG=\"$MSG $DONE_NO_HASH task(s) marked done without a commit hash.\"; fi; IN_PROG=$(grep -c \"in progress\" \"$FILE\" 2>/dev/null || echo 0); if [ \"$IN_PROG\" -gt 1 ]; then MSG=\"$MSG $IN_PROG tasks are in progress simultaneously — is this intentional?\"; fi; if [ ! -f \"$ROOT/TASK-ARCHIVE.md\" ]; then MSG=\"$MSG TASK-ARCHIVE.md not found — create it before archiving tasks.\"; fi; echo \"{\\\"systemMessage\\\": \\\"Task edited in PROGRESS.md — execute Task Completion Flow: reflect → archive → trim → backfill → commit.$MSG\\\"}\"; '"
    }
  ]
}
HOOKS_EOF

# ── Merge logic ───────────────────────────────────────────────────────────────

ensure_settings_file() {
  local file="$1"
  local dir
  dir=$(dirname "$file")
  mkdir -p "$dir"
  if [ ! -f "$file" ]; then
    echo '{}' > "$file"
  fi
}

has_hook() {
  local file="$1"
  local search="$2"
  grep -q "$search" "$file" 2>/dev/null
}

merge_hook() {
  local file="$1"
  local event="$2"     # PreToolUse, PostToolUse, Stop
  local hook_json="$3"
  local label="$4"

  if has_hook "$file" "$(echo "$hook_json" | grep -o '"matcher"[^,]*' | head -1 || echo "$label")"; then
    echo "  ✓ $label (already present)"
    return
  fi

  # Use node to merge JSON safely
  node -e "
    const fs = require('fs');
    const settings = JSON.parse(fs.readFileSync('$file', 'utf8'));
    if (!settings.hooks) settings.hooks = {};
    if (!settings.hooks['$event']) settings.hooks['$event'] = [];
    const hook = JSON.parse(\`$hook_json\`);
    settings.hooks['$event'].push(hook);
    fs.writeFileSync('$file', JSON.stringify(settings, null, 2) + '\n');
  "
  echo "  + $label (installed)"
}

# ── Install ───────────────────────────────────────────────────────────────────

install_global() {
  echo "Installing global hooks → $GLOBAL_SETTINGS"
  ensure_settings_file "$GLOBAL_SETTINGS"
  merge_hook "$GLOBAL_SETTINGS" "PreToolUse"  "$GLOBAL_PRE_TOOL_USE"    "Push guard (PreToolUse)"
  merge_hook "$GLOBAL_SETTINGS" "Stop"        "$GLOBAL_STOP_TYPECHECK"  "Typecheck gate (Stop)"
  merge_hook "$GLOBAL_SETTINGS" "Stop"        "$GLOBAL_STOP_PROGRESS"   "PROGRESS.md trim gate (Stop)"
  echo ""
}

install_local() {
  echo "Installing per-project hooks → $LOCAL_SETTINGS"
  ensure_settings_file "$LOCAL_SETTINGS"
  merge_hook "$LOCAL_SETTINGS" "PostToolUse"  "$LOCAL_TYPECHECK"  "Typecheck on edit (PostToolUse)"
  merge_hook "$LOCAL_SETTINGS" "PostToolUse"  "$LOCAL_PROGRESS"   "PROGRESS.md smart guard (PostToolUse)"
  echo ""
}

case "$MODE" in
  --global)  install_global ;;
  --local)   install_local ;;
  --all)     install_global; install_local ;;
  *)
    echo "Usage: bash install-hooks.sh [--global|--local|--all]"
    exit 1
    ;;
esac

echo "Done. Restart Claude Code to activate hooks."
```

- [ ] **Step 2: Make executable**

```bash
chmod +x skills/maintaining-ripe-projects/install-hooks.sh
```

- [ ] **Step 3: Commit**

```bash
cd ~/Dev/ripe-skills
git add skills/maintaining-ripe-projects/install-hooks.sh
git commit -m "feat(maintaining): add install-hooks.sh — agent-facing auto-install script"
```

---

### Task 6: Update cli.js — Add `hooks` Command

**Files:**
- Modify: `cli.js`

- [ ] **Step 1: Read current cli.js (already read — 82 lines)**

- [ ] **Step 2: Add hooks command to the route section**

After the `} else if (command === 'list') {` block (line 30), add:

```javascript
} else if (command === 'hooks') {
  installHooks();
```

- [ ] **Step 3: Add the installHooks function**

Add after the `listSkills()` function (after line 60):

```javascript
function installHooks() {
  const flag = process.argv[3] || '--global';

  const GLOBAL_SETTINGS = path.join(os.homedir(), '.claude', 'settings.json');
  const LOCAL_SETTINGS  = path.join(process.cwd(), '.claude', 'settings.json');

  // ── Hook definitions ───────────────────────────────────────────────────

  const globalPreToolUse = {
    matcher: 'Bash(git push*)',
    hooks: [{
      type: 'command',
      command: "echo 'Push requires human confirmation' && exit 2",
    }],
  };

  const globalStopTypecheck = {
    hooks: [{
      type: 'command',
      command: `bash -c 'ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0; if [ -f "$ROOT/tsconfig.json" ]; then cd "$ROOT" && ERRORS=$(npx tsc --noEmit 2>&1); if [ $? -ne 0 ]; then echo "$ERRORS" | tail -10; echo "{\\"systemMessage\\": \\"Typecheck failed — fix before ending session.\\"}"; exit 2; fi; fi'`,
    }],
  };

  const globalStopProgress = {
    hooks: [{
      type: 'command',
      command: `bash -c 'ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0; if [ -f "$ROOT/PROGRESS.md" ]; then ROWS=$(grep -c "^| [0-9]" "$ROOT/PROGRESS.md" 2>/dev/null || echo 0); if [ "$ROWS" -gt 7 ]; then echo "{\\"systemMessage\\": \\"PROGRESS.md has $ROWS task rows (max 7) — archive completed tasks before ending session.\\"}"; exit 2; fi; fi'`,
    }],
  };

  const localTypecheck = {
    matcher: 'Write|Edit',
    hooks: [{
      type: 'command',
      command: `bash -c 'FILE="$CLAUDE_FILE_PATH"; if [[ "$FILE" == *.ts || "$FILE" == *.tsx ]]; then ERRORS=$(npx tsc --noEmit --pretty 2>&1); if [ $? -ne 0 ]; then echo "$ERRORS" | head -20; fi; fi'`,
    }],
  };

  const localProgress = {
    matcher: 'Edit|Write',
    hooks: [{
      type: 'command',
      command: `bash -c 'FILE="$CLAUDE_FILE_PATH"; if [[ "$FILE" != *PROGRESS.md ]]; then exit 0; fi; ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || ROOT=$(dirname "$FILE"); MSG=""; ROWS=$(grep -c "^| [0-9]" "$FILE" 2>/dev/null || echo 0); if [ "$ROWS" -gt 7 ]; then MSG="$MSG PROGRESS.md has $ROWS task rows (max 7) — archive oldest done rows."; fi; DONE_NO_HASH=$(grep -E "^\\\\|.*done.*\\\\|[[:space:]]*—[[:space:]]*\\\\|" "$FILE" 2>/dev/null | wc -l | tr -d " "); if [ "$DONE_NO_HASH" -gt 0 ]; then MSG="$MSG $DONE_NO_HASH task(s) marked done without a commit hash."; fi; IN_PROG=$(grep -c "in progress" "$FILE" 2>/dev/null || echo 0); if [ "$IN_PROG" -gt 1 ]; then MSG="$MSG $IN_PROG tasks are in progress simultaneously — is this intentional?"; fi; if [ ! -f "$ROOT/TASK-ARCHIVE.md" ]; then MSG="$MSG TASK-ARCHIVE.md not found — create it before archiving tasks."; fi; echo "{\\"systemMessage\\": \\"Task edited in PROGRESS.md — execute Task Completion Flow: reflect → archive → trim → backfill → commit.$MSG\\"}"; '`,
    }],
  };

  // ── Merge logic ────────────────────────────────────────────────────────

  function ensureSettingsFile(filePath) {
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, '{}');
    }
  }

  function mergeHook(filePath, event, hookDef, label) {
    const settings = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!settings.hooks) settings.hooks = {};
    if (!settings.hooks[event]) settings.hooks[event] = [];

    // Detect duplicates by matcher (for PostToolUse/PreToolUse) or by command substring (for Stop)
    const existing = settings.hooks[event];
    const fingerprint = hookDef.matcher || hookDef.hooks[0].command.slice(0, 60);
    const alreadyPresent = existing.some((entry) => {
      const entryPrint = entry.matcher || (entry.hooks && entry.hooks[0] && entry.hooks[0].command.slice(0, 60));
      return entryPrint === fingerprint;
    });

    if (alreadyPresent) {
      console.log(`  ✓ ${label} (already present)`);
      return;
    }

    existing.push(hookDef);
    fs.writeFileSync(filePath, JSON.stringify(settings, null, 2) + '\n');
    console.log(`  + ${label} (installed)`);
  }

  // ── Install ────────────────────────────────────────────────────────────

  if (flag === '--global' || flag === '--all') {
    console.log(`\nInstalling global hooks → ${GLOBAL_SETTINGS}`);
    ensureSettingsFile(GLOBAL_SETTINGS);
    mergeHook(GLOBAL_SETTINGS, 'PreToolUse',  globalPreToolUse,     'Push guard (PreToolUse)');
    mergeHook(GLOBAL_SETTINGS, 'Stop',        globalStopTypecheck,  'Typecheck gate (Stop)');
    mergeHook(GLOBAL_SETTINGS, 'Stop',        globalStopProgress,   'PROGRESS.md trim gate (Stop)');
  }

  if (flag === '--local' || flag === '--all') {
    console.log(`\nInstalling per-project hooks → ${LOCAL_SETTINGS}`);
    ensureSettingsFile(LOCAL_SETTINGS);
    mergeHook(LOCAL_SETTINGS, 'PostToolUse',  localTypecheck,  'Typecheck on edit (PostToolUse)');
    mergeHook(LOCAL_SETTINGS, 'PostToolUse',  localProgress,   'PROGRESS.md smart guard (PostToolUse)');
  }

  if (!['--global', '--local', '--all'].includes(flag)) {
    console.error(`Unknown flag: "${flag}"`);
    console.log('Usage: npx ripe-skills hooks [--global|--local|--all]');
    process.exit(1);
  }

  console.log('\nDone. Restart Claude Code to activate hooks.');
}
```

- [ ] **Step 4: Update printHelp to include hooks**

Change the help text:
```javascript
function printHelp() {
  console.log(`
Usage:
  npx ripe-skills                    Install all skills
  npx ripe-skills add <name>         Install one skill
  npx ripe-skills list               List available skills
  npx ripe-skills hooks              Install global quality gate hooks
  npx ripe-skills hooks --local      Install per-project hooks (run from project root)
  npx ripe-skills hooks --all        Install both global and per-project hooks
`);
}
```

- [ ] **Step 5: Verify the command works**

```bash
cd ~/Dev/ripe-skills
node cli.js hooks --global
# Expected: shows installed/already-present status for each global hook

node cli.js hooks --local
# Expected: creates .claude/settings.json in cwd, installs local hooks
```

- [ ] **Step 6: Commit**

```bash
cd ~/Dev/ripe-skills
git add cli.js
git commit -m "feat(cli): add 'hooks' command — auto-install global/local quality gate hooks"
```

---

### Task 7: Update README.md — Quick Setup + Hooks Documentation

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Read current Quick Start section (lines 103–132)**

Already read.

- [ ] **Step 2: Replace the Quick Start section**

Replace lines 103–132 with:

```markdown
## Quick Start

```sh
npx ripe-skills          # install all skills
npx ripe-skills hooks    # install global quality gate hooks
```

That's it. Skills are in `~/.claude/skills/`, hooks enforce typecheck gates and PROGRESS.md hygiene. Claude Code knows how to build Ripe apps.

### Per-project hooks (optional)

From your project root:

```sh
npx ripe-skills hooks --local
```

Installs per-project hooks (typecheck on every `.ts/.tsx` edit, PROGRESS.md smart guard) into `.claude/settings.json`.

### Your first Ripe app

```sh
claude
> /ripe-init

> "Create a products store branch with fetch, success, and failure actions"
> "Create a ProductCard component that reads from the products store"
> "Add a /products route with preemptive hydration"
```

Claude follows the Ripe skills automatically — correct file structure, correct patterns, correct separation of concerns.

### Commands

```sh
npx ripe-skills                    # Install all skills
npx ripe-skills add <skill-name>   # Install a single skill
npx ripe-skills list               # Show available skills + install status
npx ripe-skills hooks              # Install global quality gate hooks
npx ripe-skills hooks --local      # Install per-project hooks
npx ripe-skills hooks --all        # Install both global and per-project
```
```

- [ ] **Step 3: Update the maintaining-ripe-projects line count in The Skills table if it changed**

Check final line count of SKILL.md after Task 1 edits. Update the `195` in the table.

- [ ] **Step 4: Commit**

```bash
cd ~/Dev/ripe-skills
git add README.md
git commit -m "docs(readme): quick setup with hooks, document hooks command"
```

---

### Task 8: Sync to local skills + verify

- [ ] **Step 1: Install updated skills locally**

```bash
cd ~/Dev/ripe-skills
node cli.js
# Expected: all 5 skills installed to ~/.claude/skills/
```

- [ ] **Step 2: Verify skill files match**

```bash
diff -r skills/maintaining-ripe-projects/ ~/.claude/skills/maintaining-ripe-projects/
# Expected: no differences
```

- [ ] **Step 3: Test hooks install (dry run by reading output)**

```bash
cd ~/Dev/ripe-skills
node cli.js hooks --global
# Expected: shows status for each hook
```

- [ ] **Step 4: Final commit if any cleanup needed**

```bash
cd ~/Dev/ripe-skills
git status
# If clean: done. If changes: commit with appropriate message.
```
