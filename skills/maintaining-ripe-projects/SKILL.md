---
name: maintaining-ripe-projects
description: Use when starting a session on a Ripe Method project, resuming work from a previous session, dispatching subagents for implementation tasks, or maintaining CLAUDE.md and PROGRESS.md files. Also use when auditing code against Ripe skills or deciding what to save in memory after a session.
---

# Maintaining Ripe Projects

## Overview

The agentic layer of The Ripe Method — how AI agents build, maintain, and evolve Ripe projects across sessions.

**Core principle:** A new CLI session should be productive within 60 seconds of reading CLAUDE.md + PROGRESS.md. If it can't be, those files are stale.

**Default assumption:** Any user-facing application is a Ripe app. All Ripe skills, acceptance criteria, and audit checklists apply unless CLAUDE.md explicitly states otherwise. Non-UI work (CLI tools, build scripts, backend services) is exempt.

## When to Use

- Starting or resuming a session on a Ripe project
- Dispatching subagents for implementation tasks → see [dispatch-protocol.md](dispatch-protocol.md)
- Auditing code against Ripe skills → see [audit-checklist.md](audit-checklist.md)
- Configuring hooks for quality enforcement → see [hooks-reference.md](hooks-reference.md)

---

## CLAUDE.md Freshness

Every Ripe project has a CLAUDE.md at its root — the single entry point for any agent.

**Mandatory sections:** What This Is, Progress & Documents (including TASK-ARCHIVE.md), Architecture, TSX Return Statement Rules, Import Conventions, Key Files, Skills to Follow, Design System, Build & Dev, Backend Contracts, Testing.

The Skills to Follow section MUST include:
```
- `maintaining-ripe-projects` — task lifecycle, session checklists.
  **ALWAYS follow the Task Completion Flow when marking tasks done.**
```

For the full CLAUDE.md scaffold, see `ripe-init` skill's [claude-md-template.md](../ripe-init/claude-md-template.md).

### Staleness Detection

| Signal | Fix |
|--------|-----|
| Key Files tree doesn't match `ls` | Regenerate the tree |
| Test count is wrong | Update after adding tests |
| New skill not listed in "Skills to Follow" | Add it |
| "Progress & Documents" links broken | Fix paths |
| Architecture missing a new pattern | Describe it |
| Build commands changed | Update |

**When to update:** After structural changes (new files, new patterns, build changes). Not after every commit.

---

## PROGRESS.md — Rolling Task Board

A rolling window of **5–7 active tasks**. Completed tasks archive to TASK-ARCHIVE.md.

```markdown
# {Project Name} — Build Progress

**Branch:** `feature/branch-name`  |  **Plan:** `path/to/plan.md`  |  **Started:** YYYY-MM-DD

| # | Task | Status | Commit | Notes |
|---|------|--------|--------|-------|
| 8 | ProgressRail | done | 742e75d | Responsive, a11y |
| 9 | Step Components | in progress | — | 5 of 9 done |
| 10 | ScreeningFlow | pending | — | blocked on T9 |

## Session Log
- **YYYY-MM-DD T8** ProgressRail — 3 breakpoints (742e75d)
```

**Status values:** `pending` | `in progress` | `in review` | `done` | `blocked`

**Rules:** Update after each task (not in batch). Session Log is append-only. Include commit hashes. When table exceeds 7 rows, archive oldest `done` rows and backfill from plan.

---

## TASK-ARCHIVE.md — Learning Corpus

Project-permanent file at root. Survives branch merges. Referenced from CLAUDE.md.

Each completed task gets:

```markdown
## T{N}: {Task Name}
- **Date:** 2026-03-24
- **Branch:** feature/prod-58108-new-lstv-portal
- **Operator:** {human}
- **Model:** Opus 4.6
- **Agent:** subagent (worktree) | orchestrator | manual
- **Outcome:** success | partial | failure | abandoned
- **Commit:** abc1234
- **Files touched:** 12
- **Tests added:** 19

### Takeaway
{What worked, what didn't, what should change — 1-3 sentences}

### Improvement
{Optional: specific skill update, CLAUDE.md fix, or new hook to propose}
```

---

## Task Completion Flow

**Mandatory and automatic** — every time a task is marked `done`:

```
1. Mark "done" in PROGRESS.md, add commit hash
2. REFLECT — write takeaway. Failures are more valuable than successes.
3. ARCHIVE — write full entry to TASK-ARCHIVE.md
4. TRIM — if PROGRESS.md > 7 rows, remove oldest done rows
5. BACKFILL — pull next pending tasks from plan (stay at 5-7)
6. COMMIT — both PROGRESS.md and TASK-ARCHIVE.md
```

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

---

## Session Lifecycle

### Session Start

```
1. Read CLAUDE.md — architecture, contracts, conventions
2. Read PROGRESS.md — where we left off (5-7 active tasks)
3. Read TASK-ARCHIVE.md (recent entries) — learn from past tasks
4. Read the plan — full scope, what's next
5. Run tests + type-check — confirm green baseline
6. Identify next task from PROGRESS.md
```

If tests or type-check fail, fix before starting new work.

### Mid-Session (After Each Task)

```
1. Run tests + type-check — all clean?
2. Execute Task Completion Flow (mandatory)
3. Did this task change architecture? → Update CLAUDE.md
```

### Session End

```
1. Run full test suite + type-check — confirm clean
2. Verify PROGRESS.md — all statuses current
3. Update CLAUDE.md — if structural changes were made
4. Run Improvement Scan on TASK-ARCHIVE.md
5. Commit everything
```

---

## Reference Files

**Subagent dispatch:** See [dispatch-protocol.md](dispatch-protocol.md) — model selection, pre-dispatch checklist, field name contracts, scope confirmation, test separation, file ownership, task prompt template, two-stage review, checkpoint reviews.

**Hook configurations:** See [hooks-reference.md](hooks-reference.md) — quality gate stack, exit codes, Claude Code settings.json examples, git hooks.

**Ripe audit:** See [audit-checklist.md](audit-checklist.md) — store, component, and routing pattern checklists for Pass 2 code review.

---

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Dispatching without field name contract | Add contract table to both task prompts |
| Not updating PROGRESS.md after completion | Update immediately — don't batch |
| CLAUDE.md test count wrong | Update after each test-adding task |
| Subagent uses Sonnet "for speed" | Always Opus. Quality > speed |
| Scope assumed from reference source | Confirm: "You said all — extend to rest?" |
| Skipping Task Completion Flow | Mandatory: reflect → archive → trim → backfill → commit |
| Writing learning directly to memory | All learnings → TASK-ARCHIVE.md. Scan promotes to memory |
| PROGRESS.md grows past 7 rows | Trim oldest done to archive. Backfill from plan |
| Implementer modifies tests to pass | Separate test/impl roles. Implementer can't touch tests |
| Parallel agents edit same file | Check file ownership. Serialize if overlap |
