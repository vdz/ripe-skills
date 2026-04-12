# Ripe Audit Checklist

> **Preferred method:** Dispatch `superpowers:code-reviewer` agent with this checklist + the relevant Ripe skills (`building-ripe-components`, `building-ripe-store`, `building-ripe-routing`) as context. The checklist below is the quick-scan summary; the skills are the authoritative spec.

Use during Pass 2 of the two-stage review cycle. See [dispatch-protocol.md](dispatch-protocol.md) for the full review process.

## Store (`building-ripe-store`)

- [ ] Each feature has its own `store/{feature}/` folder
- [ ] Types, actions, reducer, listener are separate files
- [ ] Reducer has NO if statements, no API calls — assignment only
- [ ] Actions are verb-first, descriptive names
- [ ] Payloads arrive pre-formatted (match state shape)
- [ ] Collections use dual structure (`items[]` + `byId{}`)
- [ ] Listeners handle all business logic and error cases
- [ ] Listeners registered in central `listener.ts`
- [ ] Tests in `__tests__/` subdirectory

## Components (`building-ripe-components`)

- [ ] Component is a folder with `.tsx`, `.styled.tsx`, `types.ts`, `index.ts`
- [ ] Function declaration syntax (not arrow or React.FC)
- [ ] Anatomy follows SETUP → EARLY EXIT → RETURN → HELPERS
- [ ] Return uses ONLY semantic styled components — no raw HTML
- [ ] Two-level alias pattern: shared mid-level → local short aliases
- [ ] No ternaries or inline `cn()` in return
- [ ] Per-field semantic wrappers in `.styled.tsx`
- [ ] Styled components use classes, not prop interpolation
- [ ] No `useEffect` for data loading
- [ ] Composition over configuration — children in JSX, each self-gates

## Routing (`building-ripe-routing`)

- [ ] `setLocation` bridge in App.tsx via single `useEffect`
- [ ] Feature listeners react to `setLocation` for preemptive hydration
- [ ] Components use `useNavigate` for user-initiated navigation only
- [ ] Route tree uses `AppRouteObject` with `name` property
