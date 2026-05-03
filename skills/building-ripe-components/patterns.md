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

### Using useState for app data
```typescript
// ❌ Wrong
const [products, setProducts] = useState([]);
useEffect(() => { fetchProducts().then(setProducts) }, []);

// ✅ Correct
const productIds = useAppSelector((state) => state.products.items);
useEffect(() => { dispatch(fetchProducts()); }, []);
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
