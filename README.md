# ripe-skills

Claude Code skills for the Ripe Method for building robust, & highly maintaiinable web applications — install them once and Claude knows how to scaffold React + Redux Toolkit projects the right way.

## Install

```sh
npx ripe-skills
```

That's it. All skills are copied into `~/.claude/skills/`. Restart Claude Code to activate them.

## Commands

```sh
npx ripe-skills                    # Install all skills
npx ripe-skills add <skill-name>   # Install a single skill
npx ripe-skills list               # List available skills and install status
```

## Skills

| Skill | Description |
|---|---|
| `ripe-init` | Bootstraps a new project with the Ripe Method folder structure and base config |
| `building-ripe-store` | Guides Claude through building Redux Toolkit slices, selectors, and the store setup |
| `building-ripe-components` | Guides Claude through building Ripe-style React components with correct separation of concerns |
| `building-ripe-routing` | Guides Claude through setting up routing following Ripe Method conventions |

## Updating

Re-run the install command. Skills are overwritten in place.

```sh
npx ripe-skills
```

## What is the Ripe Method?

The Ripe Method is a front-end architecture for React + Redux Toolkit that enforces consistent patterns for state management with listener middleware, component structure, and routing across a project.

Learn more: [the-ripe-architecture](https://github.com/vdz/the-ripe-architecture)
