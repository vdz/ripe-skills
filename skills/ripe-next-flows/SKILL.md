---
name: ripe-next-flows
description: Builds sequential user journeys (wizards, multi-step forms, diagnostics) in a Ripe Next.js project. Use when porting a building-ripe-flows feature to Next or creating a new flow. Runs the flow engine as a client island and persists steps through Server Actions.
---

# Ripe Next Flows

The flow engine from `building-ripe-flows` still applies: steps, a brain that decides transitions, and feature logic in pure functions. Only the hosting changes.

## Rules

- The route (`app/<flow>/page.tsx`) is a Server Component. It loads the starting state through `lib/db` and renders one `'use client'` `<FlowHost initial={...} />`.
- The brain is pure TS in `lib/utils/flows/<flow>.ts`, unit-tested with Vitest. It doesn't import React or Next.
- Flow state lives in a per-request store or `useReducer` inside `FlowHost` (see ripe-next-client-state).
- Steps that must survive a reload are saved with a Server Action. The current step id goes in the URL (`?step=`).
- The final submission is a Server Action that returns a typed result union.
