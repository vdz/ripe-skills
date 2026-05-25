# Component Patterns Reference

## Contents
- Early exit patterns
- Conditional rendering
- List rendering
- Event handlers
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

## Common Mistakes

### No `useState` — Reflect Everything in the Store

The Ripe rule is unambiguous: **avoid `useState` entirely**. Every piece of state — including state that feels "transient" or "ephemeral" (whether a field is being edited, the in-progress draft value, whether a popover is open) — belongs in the Redux store.

Why: state that lives in a component can't be read by other features, can't survive a re-mount, can't be inspected in devtools, drifts out of sync with the global truth, and almost always grows into "wait, we need that elsewhere" 3 months later.

The standard cases that LOOK like local state:

| What it feels like | Where it belongs |
|---|---|
| "Is this field being edited?" | `current.editing: { field, draft } \| null` |
| "What has the user typed since clicking into the field?" | Same — `current.editing.draft` |
| "Is this popover / modal open?" | `ui.popovers.<id>` or `ui.modal` |
| "What's the active tab?" | `ui.activeTab` |
| "Has this row been expanded?" | `ui.expandedRows[id]` |
| "Has the user dismissed this banner?" | `ui.dismissedBanners[id]` |

In every case the answer is: dispatch an action, write to the store, render from a selector. Components are passive projections.

```typescript
// ❌ Wrong — local state for anything app-visible
function InlineField({ value, onCommit }) {
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState(value);
	/* ... */
}

// ✅ Correct — store-driven; component is a pure projection
function InlineField({ field, value }) {
	const dispatch = useAppDispatch();
	const editing = useAppSelector(selectEditing);
	const isEditing = editing?.field === field;

	if (!isEditing) {
		return <Display onClick={() => dispatch(beginEdit({ field, initialValue: value }))}>{value}</Display>;
	}
	return <EditInput value={editing.draft}
	                  onChange={(e) => dispatch(setEditDraft({ draft: e.target.value }))}
	                  onBlur={() => dispatch(commitEdit())} />;
}
```

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
