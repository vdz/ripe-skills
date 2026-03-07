# Store File Templates

All files in `src/store/`. No substitutions needed — these are not project-name dependent.

---

## src/store/types.ts

Global types shared across all store branches.

```typescript
export enum LoadingState {
  IDLE = 'idle',
  LOADING = 'loading',
  LOADED = 'loaded',
  ERROR = 'error',
}
```

---

## src/store/listener.ts

Creates the listener middleware. No type imports — keeps this file dependency-free.

```typescript
import { createListenerMiddleware } from '@reduxjs/toolkit';

export const listenerMiddleware = createListenerMiddleware();
```

---

## src/store/store.ts

Configures the store. Imports all branch reducers directly. Exports typed `RootState` and `AppDispatch`.

```typescript
import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { listenerMiddleware } from './listener';
import { reducer as appReducer } from './app/app.reducer';
import { reducer as routerReducer } from './router/router.reducer';

export const rootReducer = combineReducers({
  app: appReducer,
  router: routerReducer,
});

export const store = configureStore({
  reducer: rootReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().prepend(listenerMiddleware.middleware),
});

export type RootState = ReturnType<typeof rootReducer>;
export type AppDispatch = typeof store.dispatch;
```

---

## src/store/index.ts

Re-exports everything from `store.ts` and provides typed hooks for use in components.

```typescript
import { useDispatch, useSelector } from 'react-redux';
import type { RootState, AppDispatch } from './store';

export { store, rootReducer } from './store';
export type { RootState, AppDispatch } from './store';

export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector = <T>(selector: (state: RootState) => T): T =>
  useSelector(selector);
```

---

## src/store/app/types.ts

```typescript
import type { LoadingState } from '@/store/types';

export interface AppState {
  loaded: boolean;
  online: boolean;
  status: LoadingState;
}
```

---

## src/store/app/app.actions.ts

```typescript
import { createAction } from '@reduxjs/toolkit';

export const appLoaded = createAction('app/loaded');
export const setOnlineStatus = createAction<boolean>('app/setOnlineStatus');
```

---

## src/store/app/app.reducer.ts

```typescript
import { createReducer } from '@reduxjs/toolkit';
import { LoadingState } from '@/store/types';
import type { AppState } from './types';
import { appLoaded, setOnlineStatus } from './app.actions';

const defaultState: AppState = {
  loaded: false,
  online: true,
  status: LoadingState.IDLE,
};

export const reducer = createReducer(defaultState, (builder) => {
  builder
    .addCase(appLoaded, (state) => {
      state.loaded = true;
      state.status = LoadingState.LOADED;
    })
    .addCase(setOnlineStatus, (state, action) => {
      state.online = action.payload;
    });
});
```

---

## src/store/router/types.ts

```typescript
export interface RouterState {
  location: string;
}

export interface SetLocationPayload {
  location: string;
}
```

---

## src/store/router/router.actions.ts

```typescript
import { createAction } from '@reduxjs/toolkit';
import type { SetLocationPayload } from './types';

export const setLocation = createAction<SetLocationPayload>('router/setLocation');
```

---

## src/store/router/router.reducer.ts

```typescript
import { createReducer } from '@reduxjs/toolkit';
import type { RouterState } from './types';
import { setLocation } from './router.actions';

const defaultState: RouterState = {
  location: '/',
};

export const reducer = createReducer(defaultState, (builder) => {
  builder.addCase(setLocation, (state, action) => {
    state.location = action.payload.location;
  });
});
```
