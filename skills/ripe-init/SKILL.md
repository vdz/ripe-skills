---
name: ripe-init
description: Initializes a Ripe architecture project in the current working directory. Use when starting a new Ripe Method project. Scaffolds package.json, Vite, TypeScript, Redux store, routing, and the App component — ready to run after npm install.
---

# Ripe Init

## Before You Start

Ask the user for:
1. **Project name** — kebab-case (e.g. `my-app`). Used in `package.json` only — all files are written into the current working directory.

Then read `config-templates.md`, `store-templates.md`, and `app-templates.md` before creating any files.

---

## Substitutions

Replace these placeholders in all templates before writing:

| Placeholder | Replace with |
|-------------|-------------|
| `PROJECT_NAME` | The kebab-case project name provided by the user |

---

## File Creation Checklist

Work through these in order. Mark each as done before moving to the next.

### Configuration
- [ ] `package.json` — see config-templates.md
- [ ] `tsconfig.json` — see config-templates.md
- [ ] `tsconfig.node.json` — see config-templates.md
- [ ] `vite.config.ts` — see config-templates.md
- [ ] `index.html` — see config-templates.md
- [ ] `.gitignore` — see config-templates.md

### Entry Point
- [ ] `src/main.tsx` — see app-templates.md

### Components
- [ ] `src/components/App/App.tsx` — see app-templates.md
- [ ] `src/components/App/App.styled.tsx` — see app-templates.md
- [ ] `src/components/App/index.ts` — see app-templates.md

### Store — Root
- [ ] `src/store/types.ts` — see store-templates.md
- [ ] `src/store/listener.ts` — see store-templates.md
- [ ] `src/store/store.ts` — see store-templates.md
- [ ] `src/store/index.ts` — see store-templates.md

### Store — app branch
- [ ] `src/store/app/types.ts` — see store-templates.md
- [ ] `src/store/app/app.actions.ts` — see store-templates.md
- [ ] `src/store/app/app.reducer.ts` — see store-templates.md

### Store — router branch
- [ ] `src/store/router/types.ts` — see store-templates.md
- [ ] `src/store/router/router.actions.ts` — see store-templates.md
- [ ] `src/store/router/router.reducer.ts` — see store-templates.md

### Routes
- [ ] `src/routes/types.ts` — see app-templates.md
- [ ] `src/routes/routes.tsx` — see app-templates.md
- [ ] `src/routes/router.ts` — see app-templates.md

### Modules
- [ ] `src/modules/.gitkeep` — empty file, just create it

---

## After Creating All Files

Tell the user:

```
✅ Scaffold complete. To start:

  npm install
  npm run dev
```

## Next Steps

To add a feature branch + component, use these skills in order:
- `building-ripe-store` — scaffold a new store branch
- `building-ripe-components` — scaffold the matching component

To configure routing for new pages:
- `building-ripe-routing` — add routes and preemptive hydration
