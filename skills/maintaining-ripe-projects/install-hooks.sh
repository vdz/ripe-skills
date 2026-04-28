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
      "command": "bash -c 'ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0; if [ -f \"$ROOT/tsconfig.json\" ]; then cd \"$ROOT\" && TS_CHANGED=$(git diff --name-only HEAD 2>/dev/null | grep -E \"\\.(ts|tsx)$\" | head -1); if [ -z \"$TS_CHANGED\" ]; then TS_CHANGED=$(git diff --name-only 2>/dev/null | grep -E \"\\.(ts|tsx)$\" | head -1); fi; if [ -n \"$TS_CHANGED\" ]; then ERRORS=$(npx tsc --noEmit 2>&1); if [ $? -ne 0 ]; then echo \"$ERRORS\" | tail -10; echo \"{\\\"systemMessage\\\": \\\"Typecheck failed — fix before ending session.\\\"}\"; exit 2; fi; fi; fi'"
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
