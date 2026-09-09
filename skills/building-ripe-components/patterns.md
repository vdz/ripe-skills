# Component Patterns Reference

## When to read this
- Writing a component's render logic — loading guards, early exits, conditional blocks
- Rendering a collection from the store (`items` / `byId`)
- Wiring event handlers that dispatch
- A screen needs a ref to a DOM node (a `<video>`, a canvas)
- Reviewing a component for common Ripe mistakes (`useState`, fetching on mount, logic in components)

## Contents
- Early exit patterns
- Conditional rendering
- List rendering
- Event handlers
- The DOM-attach atom — the one ref + effect
- Common mistakes

## Early Exit Patterns

### Loading state
```typescript
export function UserProfile({ userId }: UserProfileProps) {
	const status = useAppSelector((state) => state.user.status);
	const user = useAppSelector((state) => state.user.byId[userId]);

	if (status === 'loading') return <ProfileSkeleton />;
	if (!user) return null;

	return (
		<ProfileWrapper>
			<UserName>{user.name}</UserName>
			<UserEmail>{user.email}</UserEmail>
		</ProfileWrapper>
	);
}
```

### Multiple guards
```typescript
export function OrderDetail({ orderId }: OrderDetailProps) {
	const order = useAppSelector((state) => state.orders.byId[orderId]);
	const isAdmin = useAppSelector((state) => state.user.profile?.role === 'admin');

	if (!order) return null;
	if (!isAdmin) return <AccessDenied />;

	return (
		<OrderDetailWrapper>
			<OrderId>#{order.id}</OrderId>
			<OrderStatus status={order.status}>{order.status}</OrderStatus>
		</OrderDetailWrapper>
	);
}
```

## Conditional Rendering

```typescript
return (
	<CartWrapper>
		<CartTitle>{t('cart')}</CartTitle>
		{items.length === 0 && <EmptyCartMessage>{t('empty-cart')}</EmptyCartMessage>}
		{items.map((id) => (
			<CartItem key={id} itemId={id} />
		))}
		{items.length > 0 && <CheckoutButton onClick={handleCheckout}>{t('checkout')}</CheckoutButton>}
	</CartWrapper>
);
```

Note: `CartItem` is a separate component — keep the return readable by extracting complex children.

## List Rendering

Each item in a list gets its own component:

```typescript
// ✅ Delegate to child component
return (
	<ProductListWrapper>
		{productIds.map((id) => (
			<ProductCard key={id} productId={id} />
		))}
	</ProductListWrapper>
);

// ❌ Inline list item
return (
	<div>
		{products.map((p) => (
			<div key={p.id}>
				<h3>{p.name}</h3>
				<span>{p.price}</span>
			</div>
		))}
	</div>
);
```

## Event Handlers

Simple dispatches inline or as concise helpers:

```typescript
export function ProductCard({ productId }: ProductCardProps) {
	const dispatch = useAppDispatch();

	return (
		<ProductCardWrapper>
			<ProductName>{/* ... */}</ProductName>
			<AddToCartButton onClick={() => dispatch(addToCart(productId))}>
				{t('add-to-cart')}
			</AddToCartButton>
			<RemoveButton onClick={handleRemove}>
				{t('remove')}
			</RemoveButton>
		</ProductCardWrapper>
	);

	function handleRemove() {
		dispatch(removeFromWishlist(productId));
		dispatch(showToast({ message: t('removed') }));
	}
}
```

Use helpers (below return) when the dispatch needs more than one line.

## The DOM-Attach Atom — the One Ref + Effect

Some work only the DOM can do: hand a `MediaStream` to a `<video>`, size a canvas to its box. That is the one place a screen keeps a `useRef` and a `useEffect`, and it is isolated in a tiny atom that holds no `useState` and makes no decision — the listener opened the hardware through `store/<branch>/api/`; the atom attaches what is already open while a prop says it is streaming, and lets go when it is not:

```typescript
// components/diagnostics/CameraPreview/CameraPreview.tsx
export function CameraPreview({ step, streaming }: CameraPreviewProps) {
	// ═══ SETUP ═══
	const videoRef = useRef<HTMLVideoElement>(null);

	useEffect(() => {
		const video = videoRef.current;
		if (!video) return;
		video.srcObject = streaming ? cameraStream(step) : null;
		if (streaming) playQuietly(video);
	}, [step, streaming]);

	// ═══ RETURN ═══
	return <PreviewVideo ref={videoRef} playsInline muted aria-label="Camera preview" />;
}
```

`cameraStream(step)` is a read of the hardware module keyed by check id (see [building-ripe-store → api.md](../building-ripe-store/api.md)); opening and closing the camera is the check listener's job. If the atom starts to open, sample, time or decide, the logic has leaked back into a component.

## Common Mistakes

### No `useState` — Reflect Everything in the Store

The Ripe rule is unambiguous: **nothing a component shows is component state.** Every piece of state — including state that feels "transient" or "ephemeral" (whether a field is being edited, the in-progress draft value, whether a popover is open, how far a hardware check has got) — belongs in the Redux store.

Why: state that lives in a component can't be read by other features (the progress bar cannot hide while a check runs if the check's phase is local), can't survive a re-mount, can't be inspected in devtools, drifts out of sync with the global truth, and almost always grows into "wait, we need that elsewhere" 3 months later.

The standard cases that LOOK like local state:

| What it feels like | Where it belongs |
|---|---|
| "Is this field being edited?" | `current.editing: { field, draft } \| null` |
| "What has the user typed since clicking into the field?" | Same — `current.editing.draft` |
| "Is this popover / disclosure open?" | `ui.openPanel` (one open at most, closed on every step change) |
| "What's the active tab?" | `ui.activeTab` |
| "Which theme is on?" | `ui.theme`, rendered as `theme-<name>` on the App root |
| "Is the check in its explainer or running?" | the check's `phase` in its branch, reset on step entry |
| "How many taps / which cells so far?" | the check's `progress` record, written by its listener |
| "How long is left?" | the check's `clock`, ticked by the one clock listener |
| "What has the customer answered on this step?" | `useFlowStep(flowId, step).data`, written through `setData` |

In every case the answer is: dispatch an action, write to the store, render from a selector. Components are passive projections. A comment at the site (`REVISIT`, `UI-only`, "hardware loop", "presentation only") does not exempt a `useState`; the hardware loop runs in a listener over `store/<branch>/api/` and writes a record, and the component selects it.

```typescript
// ❌ Wrong — local state for anything app-visible
function InlineField({ value, onCommit }) {
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState(value);
	/* ... */
}

// ✅ Correct — store-driven; component is a pure projection
function InlineField({ field, value }: InlineFieldProps) {
	const dispatch = useAppDispatch();
	const editing = useAppSelector(selectEditing);
	const isEditing = editing?.field === field;

	if (!isEditing) {
		return <Display onClick={() => dispatch(beginEdit({ field, initialValue: value }))}>{value}</Display>;
	}
	return (
		<EditInput
			value={editing.draft}
			onChange={(event) => dispatch(setEditDraft({ draft: event.target.value }))}
			onBlur={() => dispatch(commitEdit())}
		/>
	);
}

// ✅ A step's own answer lives in the flow's step data, not in the component
function ConditionStep({ flowId, step }: StepViewProps) {
	const { isActive, data, setData } = useFlowStep(flowId, step);
	if (!isActive) return null;
	return (
		<ConditionAnswers data-testid="condition-answers">
			<ConditionAnswer data-selected={data?.condition === "good"} onClick={() => setData({ condition: "good" })}>
				{text.condition.good}
			</ConditionAnswer>
		</ConditionAnswers>
	);
}
```

The only ref + effect a screen keeps is the DOM-attach atom above — and that atom has no `useState` either.

### Loading data — listeners hydrate; components don't fetch

```typescript
// ❌ Wrong
const [products, setProducts] = useState([]);
useEffect(() => { fetchProducts().then(setProducts) }, []);

// ✅ Correct
const productIds = useAppSelector((state) => state.products.items);
// Hydration lives in a listener that reacts to setLocation/auth/init —
// the component just reads the result. See building-ripe-store/listeners.md.
```

### Logic inside component
```typescript
// ❌ Wrong
function handleSubmit() {
	const isValid = validateForm(formData);
	if (!isValid) { setErrors(...); return; }
	api.submitOrder(formData).then(() => router.push('/success'));
}

// ✅ Correct — dispatch and let listener handle everything
function handleSubmit() {
	dispatch(submitOrder());
}
```

### React.FC pattern
```typescript
// ❌ Wrong
const ProductCard: React.FC<ProductCardProps> = ({ productId }) => { ... };

// ✅ Correct
function ProductCard({ productId }: ProductCardProps) { ... }
```

### Imperative code
```typescript
// ❌ Wrong
const activeItems = [];
for (let i = 0; i < items.length; i++) {
	if (items[i].active) activeItems.push(items[i]);
}

// ✅ Correct
const activeItems = items.filter((item) => item.active);
```

### Object argument vs positional
```typescript
// ❌ Wrong
dispatch(fetchUsers(1, 20, undefined, 'admin'));

// ✅ Correct
dispatch(fetchUsers({ page: 1, limit: 20, role: 'admin' }));
```
