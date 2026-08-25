# Testing a New Branch

## When to read this
- Reached Step 7 of [creating-a-branch.md](creating-a-branch.md) — deciding which test files the new branch needs
- Checking whether a branch's test coverage is complete before calling it done
- Looking for the right reference for writing the tests themselves

This file covers only the branch-creation angle — *which* tests a new branch ships with and what they must cover. *How* to write each kind of test (idioms, `makeTestHarness`, RTL patterns) is owned by the `building-ripe-tests` skill; nothing there is restated here.

## What a New Branch Ships With

Tests live in `store/<feature>/__tests__/` — never alongside source files. Imports use `../` to reach the parent.

| File | Must cover | How to write it |
|---|---|---|
| `<feature>.reducer.test.ts` | Default state + each action's state transition | [building-ripe-tests → reducer-tests.md](../building-ripe-tests/reducer-tests.md) |
| `<feature>.listener.test.ts` | At least one test per listener entry (hydration, error handling) | [building-ripe-tests → listener-tests.md](../building-ripe-tests/listener-tests.md) |
| `<feature>.selectors.test.ts` | Each derived (`createSelector`) selector — only if the branch has any | [building-ripe-tests → Selector Tests](../building-ripe-tests/SKILL.md#selector-tests) |

The reducer test is the minimum for Step 7 — reducers are pure functions, so testing them is easy and high-value: test state transitions one action at a time, starting from the default state.

## Branch Definition of Done

- [ ] Every action with a reducer case has a transition test
- [ ] Default state is asserted (via `@@INIT` — see reducer-tests.md)
- [ ] Every listener entry has at least one test, including its failure path
- [ ] No hand-rolled stores — listener and selector tests go through `makeTestHarness` (scaffolded by [ripe-init's store templates](../ripe-init/store-templates.md))

For the full test-quality rules (what to assert, what not to, file naming when a test file grows), see the `building-ripe-tests` skill's Cardinal Rules.
