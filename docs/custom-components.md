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

`GET /api/a/:id/components/:cid/compiled` returns the code transpiled to
classic-runtime JS (`React.createElement` calls, no `jsx-runtime` import),
cached by content hash, with a hard timeout on the async path. Source stays
canonical on the artifact; compiled output is derived, never stored.

## The sandbox (why bad code can't hurt anything)

The viewer renders the component inside
`<iframe sandbox="allow-scripts" srcdoc=…>` — **never `allow-same-origin`** —
which gives the frame an *opaque origin*. The browser enforces:

- no access to the parent DOM, the viewer store, or cookies/storage;
- desk API requests fail CORS (no credentialed same-origin requests exist);
- the srcdoc CSP (`default-src 'none'`; scripts only from the desk origin
  plus `'unsafe-eval'`; inline styles; `data:` images) blocks **all network**.

Inside the frame runs only the **harness** (`viewer/src/harness/main.tsx`,
bundled self-contained as `/custom-harness.js` by the viewer's
`build:harness` script) and the generated component. The harness instantiates
the compiled code with `new Function('React', code + ';return Component')`
under its own error boundary — a render crash displays inside the frame and
never touches the artifact view.

## The message protocol

Defined in `viewer/src/lib/custom-frame.ts` (`HarnessMessage` /
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

## Verified end to end

Against a real running server: natural-TSX timer accepted at create; a
syntax-error component bounced 400 with the transpiler message; the compiled
endpoint served classic-runtime JS; and that JS, instantiated exactly the way
the harness does it, rendered with `theme` flowing into the output. The
remaining visual confirmation (the frame booting inside a real browser) rides
the joint feel-pass, like item 12's capture.
