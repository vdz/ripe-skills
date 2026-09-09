# Component Tests Reference

## When to read this
- Writing the first test for a component
- Asserting a component dispatches the right action on user interaction
- Asserting a component reflects state changes
- Testing form inputs, selects, or any other interactive element

## Contents
- Setup (jsdom + Provider + harness)
- The three idioms
- Picking the right input event
- Queries — what to use when
- What NOT to do

## Setup

Component tests need a DOM and a Provider. Annotate the file and wrap with the harness store:

```typescript
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { makeTestHarness, type TestHarness } from '@/store/__tests__/makeTestHarness';
import { Toast } from '../Toast';

function renderToast(harness: TestHarness) {
	return render(
		<Provider store={harness.store}>
			<Toast />
		</Provider>,
	);
}

describe('Toast', () => {
	afterEach(cleanup);
	// ...
});
```

`cleanup` between tests is mandatory when the same component is rendered multiple times — React Testing Library accumulates DOM otherwise.

If the component is route-aware (`useParams`, `useNavigate`), wrap in a `MemoryRouter` too:

```typescript
import { MemoryRouter } from 'react-router-dom';

render(
	<Provider store={harness.store}>
		<MemoryRouter initialEntries={['/demos/abc']}>
			<DemoDetail />
		</MemoryRouter>
	</Provider>,
);
```

## The Three Idioms

### 1. Renders empty when state is empty

```typescript
it('renders nothing when no toasts in state', () => {
	const harness = makeTestHarness();
	const { container } = renderToast(harness);
	expect(container).toBeEmptyDOMElement();
});
```

### 2. Reflects state populated via dispatch

Set up state by dispatching real actions through the harness — never construct state inline.

```typescript
it('shows the toast message after pushToast dispatched', () => {
	const harness = makeTestHarness();
	harness.store.dispatch(pushToast({
		toast: { id: 't1', kind: 'success', message: 'Saved' },
	}));

	renderToast(harness);

	expect(screen.getByText('Saved')).toBeInTheDocument();
});
```

State setup via real actions exercises the reducer too, so test failures point at the right layer (component vs reducer).

### 3. User action dispatches the expected action

The most important shape. Assert what the component dispatches, not what the listener does next.

```typescript
it('dispatches dismissToast when the user clicks Dismiss', async () => {
	const harness = makeTestHarness();
	harness.store.dispatch(pushToast({
		toast: { id: 't1', kind: 'info', message: 'Hi' },
	}));

	renderToast(harness);

	const user = userEvent.setup();
	await user.click(screen.getByRole('button', { name: 'Dismiss' }));

	const dismiss = harness.dispatched.find((a) => a.type === 'ui/dismissToast');
	expect(dismiss).toMatchObject({ payload: { id: 't1' } });
});
```

The listener that handles `ui/dismissToast` is the listener test's problem. Component tests stop at "the right action was dispatched with the right payload."

## Picking the Right Input Event

| Element / interaction | Use |
|---|---|
| Button click | `userEvent.click(...)` |
| Typing into input | `userEvent.type(input, 'value')` |
| `<select>` change | `fireEvent.change(select, { target: { value: 'x' } })` |
| Keyboard shortcut | `userEvent.keyboard('{Escape}')` |
| File drop | `fireEvent.drop(dropZone, { dataTransfer: { files: [...] } })` |

**The `<select>` exception:** in jsdom, `userEvent.selectOptions` is finicky. `fireEvent.change` with `{ target: { value } }` works cleanly:

```typescript
import { fireEvent } from '@testing-library/react';

it('dispatches setSort when the user picks an option', () => {
	const harness = makeTestHarness();
	renderCatalogue(harness);

	fireEvent.change(screen.getByRole('combobox', { name: 'Sort' }), {
		target: { value: 'name-asc' },
	});

	const setSort = harness.dispatched.find((a) => a.type === 'demos/setSort');
	expect(setSort).toMatchObject({ payload: { sort: 'name-asc' } });
});
```

This is faster than `userEvent.selectOptions` and matches the harness's existing `fireEvent.click` patterns. No need for the `userEvent.setup()` ceremony unless the test also has other interactions.

## Turning a Journey Knob for One Test

A component that reads journey configuration (`resolveJourneyConfig()` from `@/config` — a timeout, the skip flag) is tested at the shipped values by default, with single tests overriding the one knob they exercise. Mock the config module once per file, wrapping the real resolver, and turn knobs through a shared helper:

```typescript
import { resolveJourneyConfig } from '@/config';
import { withJourneyConfig } from '@/components/__tests__/journeyConfig.test-utils';

vi.mock('@/config', async (importOriginal) => {
	const actual = await importOriginal<{ resolveJourneyConfig: typeof resolveJourneyConfig }>();
	return { ...actual, resolveJourneyConfig: vi.fn(actual.resolveJourneyConfig) };
});

it('offers the skip only when the journey allows it', () => {
	withJourneyConfig({ allowTestSkip: true });
	renderCheck(makeTestHarness());
	expect(screen.getByRole('button', { name: 'Skip touchscreen test' })).toBeInTheDocument();
});
```

```typescript
// src/components/__tests__/journeyConfig.test-utils.ts
const shipped = vi.mocked(resolveJourneyConfig).getMockImplementation();

export function withJourneyConfig(overrides: Partial<JourneyConfig>): void {
	if (!shipped) {
		throw new Error('mock @/config with resolveJourneyConfig: vi.fn(actual.resolveJourneyConfig) first');
	}
	vi.mocked(resolveJourneyConfig).mockImplementation(() => ({ ...shipped(), ...overrides }));
}
```

The helper captures the shipped implementation **at load**: with `restoreMocks` on, a restored `vi.fn(impl)` still calls `impl` but `getMockImplementation()` returns `undefined` afterwards, so reading it lazily inside a test would find nothing. Nothing needs undoing per test — the suite restores every mock before the next one.

## Queries — What to Use When

Order of preference:

1. **`getByRole`** — accessible queries; closest to how a screen reader sees the component.
   ```typescript
   screen.getByRole('button', { name: 'Save' });
   screen.getByRole('textbox', { name: 'Demo name' });
   screen.getByRole('combobox', { name: 'Sort' });
   ```

2. **`getByText`** — for visible content where role is ambiguous.
   ```typescript
   screen.getByText('Saved');
   screen.getByText(/upload complete/i);
   ```

3. **`getByLabelText`** — for form fields associated with a `<label>`.
   ```typescript
   screen.getByLabelText('Demo name');
   ```

4. **`getByTestId`** — last resort, only for **variant markers** that have no semantic equivalent (e.g., a toast kind that's purely visual).
   ```typescript
   screen.getByTestId('toast-success');
   ```

Never use `getByTestId` to find elements that could be found by role / text / label. The audit may not flag this (it's hard to detect), but it's a tell of testing-implementation rather than behaviour.

## What NOT to Do

### Don't assert on internal state or hook return values

```typescript
// ❌ Wrong — internal component state
const { result } = renderHook(() => useSomething());
expect(result.current.draftValue).toBe('x');

// ✅ Right — the visible effect of that state
expect(screen.getByDisplayValue('x')).toBeInTheDocument();
```

### Don't assert on styled-component class names

```typescript
// ❌ Wrong — coupled to implementation
expect(button.className).toMatch(/styled-class-hash-abc123/);

// ❌ Also wrong — there is no className variant API to assert on
expect(button).toHaveClass('primary');

// ✅ Right — assert behaviour, visible attributes, or the data-* variant the component declares
expect(button).toBeDisabled();
expect(button).toHaveAccessibleName('Save');
expect(screen.getByTestId('flow-host')).toHaveAttribute('data-status', 'active');
expect(skip).toHaveAttribute('data-variant', 'link');
```

Variants are `data-*` attributes (see [building-ripe-components → styled.md](../building-ripe-components/styled.md#variants-are-data--attributes)), so a variant assertion is an attribute assertion. The audit's `TEST-L-IMPLEMENTATION-LEAK` flags imports beyond the component's public API; class-name assertions are the JSX equivalent.

### Don't assert on the listener's downstream effect

```typescript
// ❌ Wrong — that's the listener test's job
await user.click(screen.getByRole('button', { name: 'Submit' }));
await vi.waitFor(() => expect(harness.store.getState().orders.byId['x']).toBeDefined());

// ✅ Right — the component's contract is "did it dispatch?"
await user.click(screen.getByRole('button', { name: 'Submit' }));
expect(harness.dispatched.find((a) => a.type === 'orders/submitOrder')).toBeDefined();
```

The listener test (`__tests__/orders.listener.test.ts`) covers what happens after `submitOrder` fires. The component test ends at the dispatch.

### Don't render without `<Provider>` and the harness store

```typescript
// ❌ Wrong — bypasses the store; useAppSelector throws
render(<Toast />);

// ❌ Wrong — inline store
render(
	<Provider store={configureStore({ reducer: { ui: uiReducer } })}>
		<Toast />
	</Provider>,
);

// ✅ Right — harness store
const harness = makeTestHarness();
render(<Provider store={harness.store}><Toast /></Provider>);
```

The audit's `TEST-M-HAND-ROLLED-STORE` flags the second pattern.

## File Location

```
src/components/<Component>/__tests__/<Component>.test.tsx
```

Inside the component's folder, in `__tests__/`. Imports use `../<file>`:

```typescript
import { Toast } from '../Toast';
import { Toast as ToastInternal } from '../Toast/Toast';   // if needed
```

## Worked Examples in the Wild

Real files in the MCE trade-in app (`src/clients/mce/tradein`):
- `src/components/diagnostics/Touchscreen/__tests__/Touchscreen.test.tsx` — a hardware check driven through
  the store: the check's listener is registered on the harness, the viewport is fixed, `fireEvent` sweeps
  the grid cell by cell, and the assertions read the check record (`selectCheck`) and the rendered coverage.
  Also the `withJourneyConfig` knob for the skip flag.

Real files in `mce-blueprint`:
- `src/components/Toolbar/__tests__/Toolbar.test.tsx` — canonical shape: a local
  `renderToolbar(harness)` helper wrapping `<Provider store={harness.store}>`, then click → assert
  the resulting store state. The Preview toggle block walks all three states (closed, opened, closed
  again), pairing the user-visible `aria-pressed` attribute with the store value behind it — which is
  the useful habit: assert what the user sees *and* what the store holds, not one or the other.
- `src/components/SettingsDrawer/__tests__/SettingsDrawer.test.tsx` — driving a component by
  *dispatching into the store* (`selectionSet`) instead of passing props, then asserting the
  edit round-trips back out as `screenUpdated`. Also the fallback case when an id no longer resolves.
