# API Functions Reference

## When to read this
- Adding a network call, a platform call (camera, clipboard, storage, a native bridge, a permission prompt) or a background read
- Deciding whether something belongs in `lib/modules/` or in `store/<branch>/api/`
- Wrapping a piece of hardware that several checks share
- Reading the environment (`config.ts`) — and where journey parameters live instead

## Contents
- The rule: every side effect is an api function, called only by a listener
- The grep
- Thin fronts over `lib/modules/`
- Hardware modules: keyed by id, with a generation counter
- Honest results, not exceptions
- `config.ts` — the one reader of `import.meta.env`

## The Rule

**Every call that touches the outside world is a function in `store/<branch>/api/`, and the only caller is that branch's listener.** Storage reads and writes, the auth handshake, the device query, messaging, a permission request, a background check, `getUserMedia`, the clipboard — one file per verb, or one file per device.

Components never import from an `api/` folder. A component dispatches an action and selects the outcome; the listener owns *when* the call happens, *what* happens while it is in flight, and *what* the outcome means. This holds for one-liners too: a `navigator.clipboard.writeText(code)` inside an `onClick` is a component owning a side effect, and the moment it needs a "Copied ✓" that reverts after a second and a half, the component also owns a timer it cannot cancel from a test. See [listeners.md → Pattern 9: The Confirm Window](listeners.md#pattern-9-the-confirm-window).

```
store/tradein/api/
├── clipboard.ts      writeToClipboard(text): Promise<boolean>
├── device.ts         readDeviceFacts(): Promise<DeviceFacts>
├── getPrice.ts       getPrice(request): Promise<PriceResult>
└── messaging.ts      sendAssessmentCode(code): Promise<SendResult>

store/diagnostics/api/
├── camera.ts         openCamera(id, constraints) · closeCamera(id) · cameraStream(id) · grabFrame(id)
├── hid.ts            listenForKeyPresses(id, onKey) · stopListeningForKeyPresses(id)
├── objectDetector.ts detectObjects(id, frame) · resetDetection(id)
├── permissions.ts    requestCameraPermission(): Promise<PermissionOutcome>
└── backgroundChecks.ts readBatteryHealth() · …
```

An api function **formats its result to the shape the reducer stores** (see [creating-a-branch.md → Step 5](creating-a-branch.md#step-5-apiverbfeaturets)). The reducer never sees a raw response.

## The Grep

Because the rule is positional, it is checkable. Every one of these has hits only under `store/*/api/` (and `lib/modules/`, when fronted — below):

```
rg -n 'fetch\(|getUserMedia|enumerateDevices|localStorage|sessionStorage|postMessage|navigator\.clipboard|window\.mce' src --glob '!src/store/*/api/**' --glob '!src/lib/modules/**' --glob '!**/__tests__/**'
```

Zero hits is the definition of done. The `ripe-audit` organisation checklist runs it.

## Thin Fronts Over `lib/modules/`

Deep implementations live in `lib/modules/` — the webview bridge with its handshake, the persistence codec, the DEV-only mock-journey flags. A branch that uses a module's side-effecting surface does not import the module from its listener. It gets a thin `api/<name>.ts` that re-exports exactly what it calls:

```typescript
// store/session/api/webview.ts — the front
export { installWebviewHandler, resolveBootMode, readTransportParams } from "@/lib/modules/webview";
```

Now the listener imports from its own `api/`, the grep rule holds, and the module can be swapped or mocked at one seam per branch. A pure codec in `lib/modules/` (the snapshot builder: state in, snapshot out, no I/O) is imported directly like any helper — the front is for the side-effecting surface only.

## Hardware Modules: Keyed by Id, With a Generation Counter

When a piece of hardware serves several checks in turn (one camera, two camera checks and a damage scan), the api module holds the handle **keyed by the check id**, so a check can never close another check's stream. And because acquisition is asynchronous while the customer can leave mid-way, every open and every close bumps a per-id **generation**; a handle that arrives after its generation has moved on is released on the spot rather than stored:

```typescript
// store/diagnostics/api/camera.ts (excerpt)
const streams = new Map<string, MediaStream>();
const generations = new Map<string, number>();

/** Resolves true once the stream is held; false when the host has no camera,
 *  refuses it, or the check was closed (or reopened) while the camera was still answering. */
export async function openCamera(id: string, constraints: MediaStreamConstraints): Promise<boolean> {
	const generation = bumpGeneration(id);
	const mediaDevices = navigator.mediaDevices;
	if (!mediaDevices) return false;

	const stream = await getSpecificCameraStream(mediaDevices, constraints);
	if (generations.get(id) !== generation) {
		stopStream(stream); // superseded or closed mid-acquisition: release the late stream
		return false;
	}
	if (!stream) return false;
	streams.set(id, stream);
	return true;
}

/** Idempotent, and safe for a check that holds nothing. */
export function closeCamera(id: string): void {
	bumpGeneration(id);
	const stream = streams.get(id);
	if (stream) stopStream(stream);
	streams.delete(id);
}

/** The open stream for a check, for the preview to attach, or null. */
export function cameraStream(id: string): MediaStream | null {
	return streams.get(id) ?? null;
}

function bumpGeneration(id: string): number {
	const next = (generations.get(id) ?? 0) + 1;
	generations.set(id, next);
	return next;
}
```

Three properties follow, and the listeners lean on all of them:

- **Close is idempotent**, so both the check's own listener (happy path, before it concludes) and a backstop listener (cancel, skip, restart) may call it — see [listeners.md → Pattern 13](listeners.md#pattern-13-the-release-backstop).
- **A stale run never releases shared hardware.** A listener run that has lost its liveness check returns *without* calling `closeCamera` — the live run, or the backstop, owns the close. Otherwise a late `checkStarted` from the previous attempt would shut the camera the current attempt just opened.
- **The component's part is a DOM-attach atom**: `cameraStream(id)` handed to a `<video>` in a `useRef` + `useEffect`. That is the one ref and the one effect a check screen keeps — see `building-ripe-components` → the DOM-attach atom.

The same shape serves a key-press emitter (`hid.ts`), a captured frame held between capture and analysis (`damageVision.ts`), a detector's per-check memory (`objectDetector.ts`).

## Honest Results, Not Exceptions

An api function whose caller has to *render a state* resolves a discriminated result rather than rejecting. An exception would leave the screen stuck on "sending":

```typescript
// store/tradein/api/messaging.ts (excerpt)
export type SendFailureReason = "missingRecipient" | "missingTemplate" | "serviceError";
export type SendResult = { ok: true } | { ok: false; reason: SendFailureReason };

export async function sendAssessmentCode(code: string): Promise<SendResult> { /* … */ }
```

The listener switches on `result.ok` and dispatches the matching action; the reducer stores a status; the button renders it. When the outside world is not ready (the recipient's phone number has no source yet), the api says so with a reason instead of pretending success, and this file is the only one that changes when it is.

`try`/`catch` + a failure action is still right for the classic fetch that either returns data or fails — see [listeners.md → Error Handling](listeners.md#error-handling).

## `config.ts` — the One Reader of `import.meta.env`

`src/config.ts` is the app's **environment**: how it meets the platform shell, and whether this is a development build. Nothing about the journey lives here.

```typescript
// src/config.ts (excerpt)
/** What the platform shell is handed to boot this app. */
export interface AppConfig {
	/** The platform application identity handed to the shell. */
	appName: string;
	/** MCE platform services the EnvironmentInitializer loads. */
	services: string[];
	/** Auth connection handed to the shell as `defaultAuthConnection`. */
	authConnection: string;
}

/** Whether this is a development build. The only `import.meta.env` read in the app. */
export const isDevBuild: boolean = import.meta.env.DEV;

/** The shell's boot values — the epic's own. */
export const config: AppConfig = { appName: "MceTradeIn", services: ["Host", "Auth", /* … */], authConnection: "mce-external" };
```

- Bare typed constants, not an object of getters, so a constant is tree-shaken and a grep for `import.meta.env` has exactly one hit.
- Journey parameters — a check's window, the shared timeout, the skip flag, a voucher's validity — are **not** configuration. Each branch's `initialState` declares them (see [state-shape.md → Default State Requirements](state-shape.md#default-state-requirements)). A listener reads `selectSharedTimeoutMs(api.getState())`; a screen selects `selectTouchscreenParams(state, step)`. There is no per-check resolver function and no journey record here for one to resolve; `config.ts` imports nothing from `store/`.
- Changing a value is a release. A client that needs different values hands them in as a partial state through the same `makeStore(preloadedState)` a saved session resumes through — a client file, or later a fetched configuration domain — merged in `main.tsx` after `restoreFrom` and clamped into `LIMITS` (`store/limits.ts`) at that one boundary. Do not add a resolver layer in front of the reducers to get there.
