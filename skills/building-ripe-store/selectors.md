# Selectors Reference

## When to read this
- Writing or naming a selector for a branch
- Deciding between an inline `useAppSelector` arrow, a plain function selector, and `createSelector`
- Debugging "why does this component re-render on dispatches that touched an unrelated branch?"
- Wondering whether React 19 / the React Compiler makes `createSelector` unnecessary

## Contents
- When you need a named selector (and when you don't)
- Plain function vs memoised — the mechanical choice
- The "do I need to memoise?" test
- React 19 / React Compiler
- Parametric selectors

For the upstream question — whether a value belongs in state at all or should be derived — see [state-shape.md → What Belongs in State vs Selectors](state-shape.md#what-belongs-in-state-vs-selectors). For testing derived selectors, see the `building-ripe-tests` skill.

## When You Need a Named Selector (and When You Don't)

You don't need a named selector for every read. Components can pass an inline function to `useAppSelector` for direct prop reads:

```typescript
// ✅ Inline — direct prop read; no need to name it
const status = useAppSelector((s) => s.demos.status);
const shorthand = useAppSelector((s) => s.current.shorthand);
```

Named selectors in `<branch>.selectors.ts` earn their place when they're:
- **Branch-level useful** — `selectAllDemos`, `selectVisibleDemos`, `selectItems` — anything multiple components or listeners read.
- **Derived / computed** — anything that calls `.map / .filter / .slice / .sort / .reduce` returning a non-primitive, or builds a fresh object/array.
- **Documented** — names like `selectIsLoaded` carry semantic meaning that's worth lifting out of the inline arrow.

If a read is used in exactly one place and is just a slice read, inline is fine. Don't pre-emptively name everything.

## Plain Function vs Memoised — the Mechanical Choice

When you DO write a named selector, the choice between plain function and `createSelector` is mechanical.

**Plain function selectors** — for direct slice reads, lookups by id, and primitive returns. These return either a reference that already lives in state (passes `===` against itself until the reducer reassigns it) or a primitive computed from state. `useSelector`'s strict-equality check won't see a phantom change.

```typescript
// Direct slice read — same array reference until reducer reassigns
export const selectDemos = (s: RootState) => s.demos.items;

// Lookup by id — returns an existing object reference
export const selectDemoById = (s: RootState, id: string) =>
	s.demos.byId[id] ?? null;

// Primitive — re-renders only when the number itself changes
export const selectVisibleCount = (s: RootState) =>
	s.demos.items.filter((id) => !s.demos.byId[id].hidden).length;
```

**Memoised selectors** — for derived arrays, objects, and computed structures. The moment a selector calls `.map / .filter / .slice / .sort / .reduce` returning a non-primitive, or builds a fresh `{ }` or `[ ]` literal, it returns a new reference on every call. Without memoisation, every `useSelector` consumer re-renders on every store update — including dispatches that touched a totally unrelated branch.

```typescript
import { createSelector } from '@reduxjs/toolkit';

// Cheap input selectors (not exported)
const selectItems  = (s: RootState) => s.demos.items;
const selectById   = (s: RootState) => s.demos.byId;
const selectFilter = (s: RootState) => s.demos.filter;

// Derived — memoised
export const selectAllDemos = createSelector(
	[selectItems, selectById],
	(items, byId) => items.map((id) => byId[id]),
);

export const selectVisibleDemos = createSelector(
	[selectAllDemos, selectFilter],
	(demos, filter) => demos.filter((d) => matchesFilter(d, filter)),
);
```

## The "Do I Need to Memoise?" Test

Answer **yes** if any are true:
- The body calls `.map / .filter / .slice / .sort / .concat / .flat / .reduce` returning a non-primitive
- The body returns a `{ ... }` or `[ ... ]` literal built on the fly
- The body spreads (`{ ...x }` or `[ ...x ]`) to produce its return value

Answer **no** (plain function selector OR inline `useAppSelector` arrow) for:
- Direct slice read: `(s) => s.x.y`
- Lookup by id: `(s, id) => s.x.byId[id]`
- Primitive return: `(s) => s.items.length` or `(s) => s.x.status === 'loaded'`
- Conditional choice between existing refs: `(s) => s.demos.byId[s.current.shorthand] ?? s.demos.items[0]`

## React 19 / React Compiler — Does It Replace `createSelector`?

No. The React Compiler memoises inside the component body; `useSelector`'s equality check happens BEFORE the component re-renders, at the store-subscription layer. The two operate on different sides of the equality check — `createSelector` is still essential under React 19. (And avoid `useMemo` / `useCallback` in components under React 19 — let the compiler handle component-internal memoisation.)

## Parametric Selectors Are Safe by Default

The historical cache-thrash bug (sibling components calling `selectX(state, idA)` and `selectX(state, idB)` evicting each other on every render) is fixed in reselect 5 (bundled with RTK 2.x): `argsMemoize` defaults to `weakMapMemoize`. No special setup needed:

```typescript
export const selectDemoTags = createSelector(
	[(s: RootState, id: string) => s.demos.byId[id],
	 (s: RootState, id: string) => s.demos.tagsByDemo[id]],
	(demo, tags) => tags.map((t) => `#${t}`),
);
// Each id keeps its own slot in the cache. Safe.
```
