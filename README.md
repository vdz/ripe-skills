# ripe-skills

Claude Code skills for **The Ripe Method** — a front-end architecture for building robust, maintainable web applications with React + Redux Toolkit.

Install once and Claude knows how to scaffold projects, build store branches, create components, set up routing, and maintain project context across sessions.

## Install

```sh
npx ripe-skills
```

All skills are copied into `~/.claude/skills/`. Restart Claude Code to activate them.

## Commands

```sh
npx ripe-skills                    # Install all skills
npx ripe-skills add <skill-name>   # Install a single skill
npx ripe-skills list               # List available skills and install status
```

## Skills

| Skill | What It Does | When Claude Uses It |
|---|---|---|
| `ripe-init` | Scaffolds a new Ripe project (Vite, TS, Redux, routing, CLAUDE.md) | Starting a new project |
| `building-ripe-store` | Creates store branches: actions, reducers, listeners, API functions | Adding state management |
| `building-ripe-components` | Creates components: semantic TSX, two-level aliases, styled-components | Building UI |
| `building-ripe-routing` | Sets up React Router with `setLocation` bridge and preemptive hydration | Adding routes and navigation |
| `maintaining-ripe-projects` | Session lifecycle, PROGRESS.md, TASK-ARCHIVE.md, subagent dispatch, hooks | Starting/resuming sessions, dispatching agents, auditing code |

### Skill Architecture

Skills follow [Anthropic's best practices](https://docs.anthropic.com/en/docs/agents-and-tools/agent-skills/best-practices) for progressive disclosure. Each SKILL.md stays under 500 lines. Reference material lives in separate files loaded only when needed:

```
maintaining-ripe-projects/
  SKILL.md                 195 lines  Core workflows
  dispatch-protocol.md                Subagent dispatch rules
  hooks-reference.md                  Hook configurations
  audit-checklist.md                  Ripe audit checklist

building-ripe-components/
  SKILL.md                 238 lines  Component patterns
  patterns.md                         Before/after examples
  styled.md                           Naming conventions

building-ripe-store/
  SKILL.md                 405 lines  Store patterns
  listeners.md                        Listener patterns
  state-shape.md                      State shape design

building-ripe-routing/
  SKILL.md                 263 lines  Routing patterns

ripe-init/
  SKILL.md                  99 lines  Scaffolding checklist
  claude-md-template.md               CLAUDE.md scaffold
  config-templates.md                 Config file templates
  store-templates.md                  Store file templates
  app-templates.md                    App + routing templates
```

## Key Concepts

**The Ripe Method** enforces strict separation of concerns:

- **Components** are passive — read from store, dispatch actions, no business logic
- **Reducers** do simple assignment — no `if` statements, no API calls
- **Listeners** orchestrate everything — react to actions, call decision functions, make API calls
- **Decision functions** are pure — no Redux, independently testable

**The Agentic Layer** (`maintaining-ripe-projects`) adds:

- **PROGRESS.md** — rolling 5-7 task board with automatic archiving
- **TASK-ARCHIVE.md** — project-permanent learning corpus with per-task takeaways
- **Task Completion Flow** — mandatory reflect-archive-trim-backfill cycle
- **Improvement Scan** — session-end triage routing learnings to skills, CLAUDE.md, hooks, or memory

## Updating

Re-run the install command. Skills are overwritten in place.

```sh
npx ripe-skills
```

## What is the Ripe Method?

The Ripe Method is a front-end architecture for React + Redux Toolkit that enforces consistent patterns for state management with listener middleware, component structure, and routing.

Learn more: [the-ripe-architecture](https://github.com/vdz/the-ripe-architecture)

## License

MIT
