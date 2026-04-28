#!/usr/bin/env node

const fs   = require('fs');
const path = require('path');
const os   = require('os');

// ── Constants ─────────────────────────────────────────────────────────────────

const SKILLS_SRC  = path.join(__dirname, 'skills');
const SKILLS_DEST = path.join(os.homedir(), '.claude', 'skills');

const AVAILABLE = fs.readdirSync(SKILLS_SRC)
  .filter((e) => fs.statSync(path.join(SKILLS_SRC, e)).isDirectory());

// ── Args ──────────────────────────────────────────────────────────────────────

const [,, command, skillName] = process.argv;

// ── Route ─────────────────────────────────────────────────────────────────────

if (!command || command === 'install') {
  installAll();
} else if (command === 'add') {
  if (!skillName) {
    console.error('Usage: npx ripe-skills add <skill-name>');
    process.exit(1);
  }
  installOne(skillName);
} else if (command === 'list') {
  listSkills();
} else if (command === 'hooks') {
  installHooks();
} else {
  console.error(`Unknown command: "${command}"`);
  printHelp();
  process.exit(1);
}

// ── Commands ──────────────────────────────────────────────────────────────────

function installAll() {
  console.log('Installing all Ripe skills...\n');
  for (const skill of AVAILABLE) installOne(skill);
  console.log('\nDone. Restart Claude Code to activate the skills.');
}

function installOne(name) {
  if (!AVAILABLE.includes(name)) {
    console.error(`Skill not found: "${name}"`);
    console.error(`Available: ${AVAILABLE.join(', ')}`);
    process.exit(1);
  }
  fs.mkdirSync(SKILLS_DEST, { recursive: true });
  copyDir(path.join(SKILLS_SRC, name), path.join(SKILLS_DEST, name));
  console.log(`  ✓ ${name}`);
}

function listSkills() {
  console.log('Ripe skills:\n');
  for (const skill of AVAILABLE) {
    const installed = fs.existsSync(path.join(SKILLS_DEST, skill));
    console.log(`  ${skill.padEnd(32)} ${installed ? '[installed]' : ''}`);
  }
}

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
      command: "bash -c 'ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0; if [ -f \"$ROOT/tsconfig.json\" ]; then cd \"$ROOT\" && TS_CHANGED=$(git diff --name-only HEAD 2>/dev/null | grep -E \"\\.(ts|tsx)$\" | head -1); if [ -z \"$TS_CHANGED\" ]; then TS_CHANGED=$(git diff --name-only 2>/dev/null | grep -E \"\\.(ts|tsx)$\" | head -1); fi; if [ -n \"$TS_CHANGED\" ]; then ERRORS=$(npx tsc --noEmit 2>&1); if [ $? -ne 0 ]; then echo \"$ERRORS\" | tail -10; echo \"{\\\\\"systemMessage\\\\\": \\\\\"Typecheck failed \u2014 fix before ending session.\\\\\"}\"; exit 2; fi; fi; fi'",
    }],
  };

  const globalStopProgress = {
    hooks: [{
      type: 'command',
      command: "bash -c 'ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0; if [ -f \"$ROOT/PROGRESS.md\" ]; then ROWS=$(grep -c \"^| [0-9]\" \"$ROOT/PROGRESS.md\" 2>/dev/null || echo 0); if [ \"$ROWS\" -gt 7 ]; then echo \"{\\\\\"systemMessage\\\\\": \\\\\"PROGRESS.md has $ROWS task rows (max 7) \u2014 archive completed tasks before ending session.\\\\\"}\"; exit 2; fi; fi'",
    }],
  };

  const localTypecheck = {
    matcher: 'Write|Edit',
    hooks: [{
      type: 'command',
      command: "bash -c 'FILE=\"$CLAUDE_FILE_PATH\"; if [[ \"$FILE\" == *.ts || \"$FILE\" == *.tsx ]]; then ERRORS=$(npx tsc --noEmit --pretty 2>&1); if [ $? -ne 0 ]; then echo \"$ERRORS\" | head -20; fi; fi'",
    }],
  };

  const localProgress = {
    matcher: 'Edit|Write',
    hooks: [{
      type: 'command',
      command: "bash -c 'FILE=\"$CLAUDE_FILE_PATH\"; if [[ \"$FILE\" != *PROGRESS.md ]]; then exit 0; fi; ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || ROOT=$(dirname \"$FILE\"); MSG=\"\"; ROWS=$(grep -c \"^| [0-9]\" \"$FILE\" 2>/dev/null || echo 0); if [ \"$ROWS\" -gt 7 ]; then MSG=\"$MSG PROGRESS.md has $ROWS task rows (max 7) \u2014 archive oldest done rows.\"; fi; DONE_NO_HASH=$(grep -E \"^\\\\|.*done.*\\\\|[[:space:]]*\u2014[[:space:]]*\\\\|\" \"$FILE\" 2>/dev/null | wc -l | tr -d \" \"); if [ \"$DONE_NO_HASH\" -gt 0 ]; then MSG=\"$MSG $DONE_NO_HASH task(s) marked done without a commit hash.\"; fi; IN_PROG=$(grep -c \"in progress\" \"$FILE\" 2>/dev/null || echo 0); if [ \"$IN_PROG\" -gt 1 ]; then MSG=\"$MSG $IN_PROG tasks are in progress simultaneously \u2014 is this intentional?\"; fi; if [ ! -f \"$ROOT/TASK-ARCHIVE.md\" ]; then MSG=\"$MSG TASK-ARCHIVE.md not found \u2014 create it before archiving tasks.\"; fi; echo \"{\\\\\"systemMessage\\\\\": \\\\\"Task edited in PROGRESS.md \u2014 execute Task Completion Flow: reflect \u2192 archive \u2192 trim \u2192 backfill \u2192 commit.$MSG\\\\\"}\"; '",
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

    const existing = settings.hooks[event];
    const fingerprint = hookDef.matcher || hookDef.hooks[0].command.slice(0, 60);
    const alreadyPresent = existing.some((entry) => {
      const entryPrint = entry.matcher || (entry.hooks && entry.hooks[0] && entry.hooks[0].command.slice(0, 60));
      return entryPrint === fingerprint;
    });

    if (alreadyPresent) {
      console.log(`  \u2713 ${label} (already present)`);
      return;
    }

    existing.push(hookDef);
    fs.writeFileSync(filePath, JSON.stringify(settings, null, 2) + '\n');
    console.log(`  + ${label} (installed)`);
  }

  // ── Install ────────────────────────────────────────────────────────────

  if (flag === '--global' || flag === '--all') {
    console.log(`\nInstalling global hooks \u2192 ${GLOBAL_SETTINGS}`);
    ensureSettingsFile(GLOBAL_SETTINGS);
    mergeHook(GLOBAL_SETTINGS, 'PreToolUse',  globalPreToolUse,     'Push guard (PreToolUse)');
    mergeHook(GLOBAL_SETTINGS, 'Stop',        globalStopTypecheck,  'Typecheck gate (Stop)');
    mergeHook(GLOBAL_SETTINGS, 'Stop',        globalStopProgress,   'PROGRESS.md trim gate (Stop)');
  }

  if (flag === '--local' || flag === '--all') {
    console.log(`\nInstalling per-project hooks \u2192 ${LOCAL_SETTINGS}`);
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src)) {
    const s = path.join(src, entry);
    const d = path.join(dest, entry);
    fs.statSync(s).isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d);
  }
}
