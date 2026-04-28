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

## Architecture: Ripe Method
This project follows **The Ripe Method** — a strict separation of concerns:

- **Components** are passive and reactive — they read from the store and dispatch actions. No business logic, no API calls, no `useEffect` for data loading.
- **Reducers** do simple assignment — no `if` statements, no logic, no API calls.
- **Listeners** orchestrate everything — they react to actions, call decision functions, make API calls, and dispatch results.
- **Decision functions** live in `modules/` — pure functions, no Redux, independently testable.

## TSX Return Statement Rules (CRITICAL)
1. Semantic names only — no implementation names
2. Two-level alias pattern
3. No ternaries or inline cn() in JSX
4. Short inline dispatch lambdas ARE OK
5. Visual separators are CSS, not components
6. Tooltips use native title attribute

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
├── modules/           # Pure business logic (no Redux)
├── store/
│   ├── store.ts       # configureStore + typed hooks
│   ├── listener.ts    # Listener middleware + registration
│   ├── types.ts       # Shared types (Listener, LoadingState)
│   ├── app/           # App state branch
│   └── router/        # React Router ↔ Redux bridge
├── components/
│   └── App/           # Root component with setLocation bridge
├── routes/
│   ├── router.ts      # createHashRouter setup
│   ├── routes.tsx      # Route tree
│   └── types.ts       # AppRouteObject
└── main.tsx           # Entry point
```

## Skills to Follow
- `building-ripe-store` — slices, actions, reducers, listeners, API functions
- `building-ripe-components` — component anatomy, semantic TSX, two-level aliases
- `building-ripe-routing` — React Router + setLocation bridge

## Build & Dev
```bash
npm install
npm run dev           # dev server
npx vitest run        # run tests
npx tsc --noEmit      # type check
```

## Backend Contracts (DO NOT CHANGE)
{List API endpoints, signing, logging format. Remove this section if no backend yet.}

## Testing
- **Tests go in `__tests__/` subdirectories** — never alongside source
- **Framework:** Vitest with jsdom
- **Total:** 0 tests
```
