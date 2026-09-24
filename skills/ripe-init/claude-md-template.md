# CLAUDE.md Template

Generate this file at the project root. Replace `PROJECT_NAME` and fill in project-specific values.

```markdown
# PROJECT_NAME — Claude Context

## What This Is
{One paragraph: what the app does, who uses it, what it replaces (if anything).}

## Progress & Documents
- **Plan:** {path/to/plan.md or "TBD"}
- **Progress:** PROGRESS.md (in this directory)
- **Archive:** TASK-ARCHIVE.md (in this directory)
- **Branch:** {branch-name}

## Workflow
- **Outer loop:** {this project's spec/interview → implement → review process, if any}
- **Task authority:** {PROGRESS.md or the issue tracker — name the one that's authoritative}
- **Inner loop:** `building-ripe-store` → The Feature Loop

## Architecture: Ripe Method
This project follows **The Ripe Method** — a strict separation of concerns:

- **Components** are passive and reactive — they read from the store and dispatch actions. No business logic, no API calls, no `useEffect` for data loading.
- **Reducers** do simple assignment and mechanical data maintenance — an `if` may guard a data invariant (e.g. does this member exist before delete/update); never business decisions, never API calls.
- **Listeners** orchestrate everything and own all business decisions — they react to actions, call pure helpers, make API calls, and dispatch results.
- **Helpers** live in `lib/utils/` — genuinely pure, reusable functions called *from* listeners; no Redux, no decisions of their own. This keeps listeners thin and lets pure logic be unit-tested without a store. Deep implementations fronted by an `api/` function (a bridge, a codec) live in `lib/modules/`.
- **I/O** — every network or platform call is a function in `store/<branch>/api/`, called only from a listener. `config.ts` is the one reader of `import.meta.env`.

## TSX Return Statement Rules (CRITICAL)
1. Semantic names only — no implementation names
2. Two-level alias pattern
3. No ternaries or className assembly in JSX — variants are `data-*` attributes
4. Short inline dispatch lambdas ARE OK
5. Visual separators are CSS, not components
6. Tooltips use native title attribute
7. Every semantic element carries a `data-testid` — kebab-case, component-prefixed

## Import Conventions
```typescript
// Semantic primitives — from barrel
import { Answers, Answer, TextEntry } from "@/components/Primitives";

// Local aliases — from component's own styled file
import { Header, Title, Content, Actions } from "./ComponentName.styled";
```

## Key Files
```
src/
├── assets/
│   ├── locales/       # Typed copy — `text` (en.ts); components never hold literals
│   └── styles/        # tokens.css — design tokens as CSS variables, the layer order
├── config.ts          # Bare consts; the only reader of import.meta.env
├── lib/
│   ├── utils/         # Pure helpers called from listeners (no Redux)
│   └── modules/       # Deep implementations fronted by a store/<branch>/api/ function
├── store/
│   ├── store.ts       # reducer map + makeStore(router, preloadedState?)
│   ├── listener.ts    # registerListener + initAppListeners
│   ├── types.ts       # Shared types (Listener union, LoadingState)
│   ├── __tests__/     # makeTestHarness — the one test seam
│   ├── app/           # App state branch
│   └── router/        # React Router ↔ Redux bridge
├── components/        # Every React component; grouping folders allowed
│   ├── App/           # Root component with setLocation bridge
│   └── GlobalStyle/   # Reset + base layers; imports tokens.css
├── routes/
│   ├── router.ts      # createAppRouter() — made in main.tsx, handed to listeners
│   ├── routes.tsx      # Route tree
│   └── types.ts       # AppRouteObject
└── main.tsx           # Entry point — createAppRouter(), then makeStore(router) once
```

## Skills to Follow
- `building-ripe-store` — slices, actions, reducers, listeners, API functions
- `building-ripe-components` — component anatomy, semantic TSX, two-level aliases
- `building-ripe-routing` — React Router + setLocation bridge
- `building-ripe-tests` — reducer/listener/selector/component tests, the test harness
- `ripe-audit` — standards review before merge

## Build & Dev
```bash
npm install
npm run dev           # dev server
npx vitest run        # run tests
npx tsc --noEmit      # type check
npm run lint          # from the repo root when the app lives in a monorepo — CI lints from there
```

## Backend Contracts (DO NOT CHANGE)
{List API endpoints, signing, logging format. Remove this section if no backend yet.}

## Testing
- **Tests go in `__tests__/` subdirectories** — never alongside source
- **Harness:** `store/__tests__/makeTestHarness.ts`; test doubles are typed factories in `*.test-utils.ts`, never casts
- **Framework:** Vitest with jsdom
- **Total:** 0 tests
```
