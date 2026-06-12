# Custom components: the `custom-react` runtime

The AI can generate an arbitrary interactive React component into an artifact —
a chart, a timer, a calculator. This document is the full runtime contract:
how the code is authored, validated, compiled, sandboxed, and supervised.
It spans plugins-builtin → server → viewer, so it lives here rather than in
any one package.

## The authoring contract (what the AI writes)

A `custom-react` component's `data`:

| Field | Type | Meaning |
|---|---|---|
| `code` | string (TSX, ≤ 64 KB) | Must define `Component` — `function Component(props) { … }`, `const Component = (props) => …`, or a class |
| `props` | object, optional | Extra props handed to the component |
| `height` | 80–1200, optional | Fixed frame height; omit for content-driven auto-resize |
| `caption` | string, optional | Figure caption |

The component receives `theme` (`'light' | 'dark'`) plus everything in
`props` as its React props, and re-renders live when the operator switches
theme. It must be **self-contained**: React is provided as a global; there are
no imports and no network (by design — that's what makes the sandbox airtight).
State, events, timers, SVG, and canvas all work — it's real React.

## Write-time validation (the authoring loop)

On every create/patch, the server (`packages/server/src/core/custom-react.ts`)
transpiles the TSX with `Bun.Transpiler`. A syntax error rejects the request
with the transpiler's own message — the model gets an immediate fix-it signal
and broken code never lands in the store. Also enforced: the 64 KB byte cap
(the parse-work bound — transpilers never execute user code, so input size is
the cost driver) and the defines-`Component` contract.

This lives server-side (not in the plugin schema) because plugin schemas are
isomorphic — the viewer imports them too, and `Bun.Transpiler` only exists on
the server. The `validateServerSide` hook in `core/service.ts` is the seam for
any future component type needing write-time checks beyond its Zod shape.

## Compilation (what actually runs)

`GET /api/a/:id/components/:componentId/compiled` returns the code transpiled to
classic-runtime JS (`React.createElement` calls, no `jsx-runtime` import),
cached by content hash, with a hard timeout on the async path. Source stays
canonical on the artifact; compiled output is derived, never stored.

## The sandbox (why bad code can't hurt anything)

The viewer renders the component inside
`<iframe sandbox="allow-scripts" srcdoc=…>` — **never `allow-same-origin`** —
which gives the frame an *opaque origin*. The browser enforces:

- no access to the parent DOM or the viewer store;
- the opaque origin strips all ambient authority — requests carry no cookies
  and the frame gets no storage. Note this alone does *not* wall off the desk
  API: the server's `cors({ origin: '*' })` permits uncredentialed reads from
  any origin, so the network block below is what closes that door;
- the srcdoc CSP (`default-src 'none'` with no `connect-src`; scripts only
  from the desk origin plus `'unsafe-eval'`; inline styles; `data:` images)
  blocks **all network** — desk API included.

Inside the frame runs only the **harness**
(`packages/viewer/src/harness/main.tsx`, bundled self-contained as
`/custom-harness.js` by the viewer's `build:harness` script) and the
generated component. `build:harness` runs automatically before the viewer's
`dev` and `build` scripts, but the bundle is a static file in `public/`, so
edits to `src/harness/main.tsx` are **not** hot-reloaded — re-run
`bun run build:harness` (or restart `bun run dev`) to pick them up. The harness instantiates
the compiled code with `new Function('React', code + ';return Component')`
under its own error boundary — a render crash displays inside the frame and
never touches the artifact view.

## The message protocol

Defined in `packages/viewer/src/lib/custom-frame.ts` (`HarnessMessage` /
`ParentMessage`). The frame is untrusted, so the parent validates every
inbound message by **source identity** (`event.source` must be the frame's
own `contentWindow`) and **shape** (the strict union); anything else is
ignored.

| Direction | Message | Meaning |
|---|---|---|
| frame → parent | `ready` | Harness booted; send my mount payload |
| frame → parent | `heartbeat` | Liveness, every 1s |
| frame → parent | `resize { height }` | Content height changed (clamped 80–1200) |
| parent → frame | `mount { code, props, theme }` | Compiled JS + props; also re-sent in place when the artifact's code/props change |
| parent → frame | `theme { theme }` | Live theme switch |

## Supervision (the honest limit, handled)

Containment of *data* is absolute (browser-enforced). Containment of *CPU* is
not: an opaque-origin srcdoc frame may share the tab's event loop, so a hot
infinite loop can freeze the tab in some browsers. The supervisor
(`FrameSupervisor`) covers the recoverable cases:

- **boot deadline** — no FIRST heartbeat within 3s of mount (a synchronous
  loop at mount never starts heartbeating, so stalled-detection alone would
  miss it) → frame torn down, "unresponsive — Reload" shown;
- **stalled** — heartbeats stop for 3s → same teardown.

Worst case anywhere is a tab reload with zero data loss: code and artifact
live server-side, and nothing the frame can do mutates the store.

## Testing

- `packages/server/src/core/custom-react.test.ts` — write-time validation
  (accept/reject on create *and* patch, the defines-`Component` contract)
  and the compiled endpoint (classic-runtime output, cache path, error
  statuses).
- `packages/viewer/src/lib/custom-frame.test.ts` — the message-protocol
  guard (source identity, then shape), the srcdoc CSP, and the
  `FrameSupervisor` (boot deadline and stall detection).
