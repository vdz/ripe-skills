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

function printHelp() {
  console.log(`
Usage:
  npx ripe-skills               Install all skills
  npx ripe-skills add <name>    Install one skill
  npx ripe-skills list          List available skills
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
