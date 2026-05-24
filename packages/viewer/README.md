# @desk/viewer

The operator's window into Desk. A Vite + React app that holds the same plugin registry as the server, renders every artifact type via component-specific renderers, and stays in lock-step with the server through the realtime WebSocket channel.

## Design

The two non-negotiable principles from the spec drive everything here:

1. **Semantic anchoring.** Every renderer exposes a `useAnchor(componentId, elementPath)` hook that produces the DOM ref the comment system uses. The comment layer never reads pixel positions itself — it asks the renderer for the anchor, then positions a marker relative to that. Swap a renderer's internal layout and comments still land in the right place.
2. **HCI is the headline investment.** Sub-100ms feedback on every common action. Animations are functional (state, position, focus) — never decorative. Keyboard-first command palette opens on ⌘K and is the fastest path to everything.

## Tokens and theme

`src/styles/tokens.css` defines the dual-token system (light + dark from day 1). Every component reads tokens, never raw colors. Coral (`#FF5A4D`) is the only accent.

## Structure

| Path | Role |
| --- | --- |
| `src/main.tsx` | Bootstraps React, the plugin registry, and the realtime client. |
| `src/app.tsx` | Layout shell: sidebar + workspace + comment rail. |
| `src/styles/` | Tokens, globals, typography. |
| `src/state/` | Zustand stores for artifact + comment + UI state. |
| `src/realtime/` | WebSocket client with reconnect + subscription accounting. |
| `src/renderers/` | One file per component type — the visual projection of the typed data. |
| `src/views/` | Artifact-level views (document, presentation). |
| `src/components/` | Generic UI primitives: button, kbd, command palette, dialog, etc. |
