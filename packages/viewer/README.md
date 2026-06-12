# @desk/viewer

The operator's window into Desk. A Vite + React app that renders every artifact type via a static renderer registry (`src/renderers/renderer-registry.tsx`) keyed by the same component-type strings the server validates against, and stays in lock-step with the server through the realtime WebSocket channel. Runtime plugin-driven renderer registration is tracked for post-v1 — for now, adding a renderer means adding a file and a registry entry.

## Design

The two non-negotiable principles from the spec drive everything here:

1. **Semantic anchoring.** Every rendered component is wrapped in `Commentable` (`src/components/Commentable.tsx`), which captures comment anchors as semantic or relative data — component id, character offsets, 0..1 fractions of the component's own box — never raw pixels. Pixels exist only transiently to draw overlays, so comments survive zoom, reflow, and renderer-internal layout changes. The shared crop math lives in the `@desk/anchor-geometry` package, which `src/lib/capture-anchor.ts` uses for comment-attachment screenshots.
2. **HCI is the headline investment.** Sub-100ms feedback on every common action. Animations are functional (state, position, focus) — never decorative. Keyboard-first command palette opens on ⌘K and is the fastest path to everything.

## Tokens and theme

`src/styles/tokens.css` defines the dual-token system (light + dark from day 1). Every component reads tokens, never raw colors. Coral (`#FF5A4D`) is the only accent.

Motion durations are tokens too: a 60–260ms scale (`--duration-instant` through `--duration-slow`) in the same file. Theme switches cross-fade via a transient `html.theme-switching` class, and artifact/slide changes replay the `content-enter` keyframes via keyed remounts. A drift-guard test (`src/styles/workspace-chrome.test.ts`, "motion stays inside the measured-smooth budget") scans `app.css` and `globals.css` for literal `Nms` values and fails any transition or animation over 260ms or declaring `!important`. Token-driven durations and `src/renderers/styles.css` sit outside the scan, so the budget holds there by convention — new animations must use the tokens and stay inside it.

## Workspace chrome

The ◫ topbar button and the "Hide panels" command-palette entry toggle the side panels via the `panelsHidden` store slot (persisted to localStorage). It sets a `data-panels` attribute on the app shell that the CSS keys off; at ≤920px the CSS ignores it, so the mobile drawers are unaffected.

## The desk piece

`src/lib/desk-piece.ts` is the WebGL hero on the empty state: a raymarched SDF desk in the brand coral with theme-aware uniforms. Its rAF loop runs only while the canvas is on-screen (IntersectionObserver), the tab is visible, and the user hasn't asked for reduced motion — otherwise it renders a single static frame, keeping the never-decorative motion promise. The dev-only `/?icon` page renders the same shader at 1024×1024; it produced the committed `public/icon.png` (the favicon).

## Structure

| Path | Role |
| --- | --- |
| `src/main.tsx` | Mounts the React app (fonts + global styles); also hosts the dev-only `/?icon` page that exports the WebGL desk piece as `public/icon.png`. |
| `src/App.tsx` | Layout shell: sidebar + workspace + comment rail. |
| `src/styles/` | Tokens, globals, typography. |
| `src/state/` | Zustand stores for artifact + comment + UI state. |
| `src/realtime/` | WebSocket client with reconnect + subscription accounting. |
| `src/renderers/` | One file per component type — the visual projection of the typed data. |
| `src/views/` | Artifact-level views (document, presentation). The presentation view goes fullscreen via the ⛶ button or `f`; the React state derives from `fullscreenchange` into a `data-fullscreen` attribute the CSS keys off, so the browser's native Esc exit keeps markup and layout together. |
| `src/components/` | UI building blocks and app chrome: Button, Kbd, CommandPalette, Commentable (anchor capture), CommentRail, Sidebar, Topbar, HistoryBar, ArtifactMeta, RelationsSection (typed-relation links), DeskPiece, ErrorBoundary. |
| `src/lib/` | Non-React logic: HTTP API client, the history-API router, anchor geometry + capture math, checklist patch drafts, artifact timestamp formatting, the custom-react iframe `FrameSupervisor`, and the WebGL desk piece. |
| `src/harness/` | Entry for the sandboxed custom-react runtime; `bun run build:harness` bundles it to `public/custom-harness.js` (runs automatically before `dev` and `build`). |

## Developing

```bash
bun install      # at the repo root
bun run dev      # at the repo root — boots the CLI, which starts the server on 127.0.0.1:7878
```

Then, in `packages/viewer`:

```bash
bun run dev        # http://localhost:5179, with /api and /ws proxied to the server
bun run test       # vitest
bun run typecheck  # tsc --noEmit
```

The Vite dev server proxies `/api` and `/ws` to the Desk server at `127.0.0.1:7878`, so start the server first or the app renders without data. `dev` and `build` run `build:harness` first automatically (the custom-react sandbox bundle).
