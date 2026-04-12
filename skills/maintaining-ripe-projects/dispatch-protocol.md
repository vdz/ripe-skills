# Subagent Dispatch Protocol

## Model Selection

**Always use Opus** for implementation subagents. Do not downgrade to Sonnet or Haiku for speed. Sonnet produces field name drift and pattern violations.

## Pre-Dispatch Checklist

```
1. Is CLAUDE.md current? Subagent reads it automatically.
2. Does the task prompt include EXACT field names?
3. Does the task prompt reference which Ripe skills to follow?
4. Is the scope unambiguous? If not, confirm with user first.
5. Contracts (API shapes, state interfaces) included verbatim?
6. Will this agent's files overlap another agent's? Serialize if yes.
```

## File Ownership Rule

Parallel subagents touching the same files **will** create merge conflicts. Each agent must own distinct files.

```
SAFE to parallelize:
  Agent A → store/flow/ (actions, reducer, listener, types)
  Agent B → modules/assessment/ (decisions, validation)

NOT safe — serialize instead:
  Agent A → store/flow/flow.listener.ts (adds listeners)
  Agent B → store/flow/flow.listener.ts (adds different listeners)
```

## Field Name Contracts

When dispatching separate subagents for business logic and UI, include this table in BOTH task prompts:

```markdown
## Field Name Contract

| Field | Key in State | Used By |
|-------|-------------|---------|
| Serial/IMEI | `serial` | validation, decisions, UI |
| Digital Tuner | `digitalTuner` | validation, decisions, UI |
```

Without an explicit contract, the logic agent uses `serial` while the UI agent invents `serialImei` — and nothing connects.

## Scope Confirmation

When the user gives a directive with a reference source, the directive IS the intent. The reference is input, not a boundary.

```
User: "All radio fields should have defaults — consult the old app"

WRONG: Old app has 2 explicit defaults → set only 2
RIGHT: "You said ALL. Old app shows 2. Should I default the remaining 17 too?"
```

Ask a 30-second confirmation question before dispatching.

## Test Separation Rule

When using subagent TDD:

1. **Testing subagent** writes failing tests (the spec)
2. **Implementer subagent** makes tests pass — **cannot modify the tests**
3. **Review subagent** checks quality against Ripe skills

If the implementer needs a test change, it must come back to the orchestrator.

## Task Prompt Template

```markdown
## Task: {Task Name}

**Context:** Read CLAUDE.md in {project path} for full architecture.
**Skills:** Follow `building-ripe-store` and `building-ripe-components`.

### What to Build
{Clear description of the deliverable}

### Field Name Contract
{Table of exact field names}

### Interfaces to Match
{Paste TypeScript interfaces the output must conform to}

### Acceptance Criteria
- [ ] Tests pass (vitest run)
- [ ] Type-check clean (tsc --noEmit)
- [ ] Follows Ripe component anatomy (SETUP → EARLY EXIT → RETURN → HELPERS)
- [ ] TSX return reads as content document
- [ ] No ternaries or inline cn() in return
- [ ] Commit with descriptive message
```

---

## Two-Stage Review Cycle

After a subagent completes a task, review in two passes:

### Pass 1: Spec Compliance

- All acceptance criteria met?
- Field names match the contract?
- Interfaces match the spec?
- All files in the right locations?

### Pass 2: Code Quality (Ripe Audit)

**Default:** Dispatch the `superpowers:code-reviewer` agent with this context:
1. The [audit-checklist.md](audit-checklist.md) content
2. The relevant Ripe skill content — load `building-ripe-components`, `building-ripe-store`, and/or `building-ripe-routing` depending on which layers the task touched

The audit checklist is a quick-scan summary; the skills are the authoritative spec for code patterns, styling, naming, and structure.

If Pass 1 or Pass 2 fails, dispatch a fix agent with specific issues — don't re-do the whole task.

### Checkpoint Reviews for Long Tasks

For tasks spanning multiple layers, insert explicit checkpoints:

```
"Complete the store branch and decision functions, then STOP.
 I'll review before you build the UI components."
```

Catches contract mismatches before they propagate into multiple files.
