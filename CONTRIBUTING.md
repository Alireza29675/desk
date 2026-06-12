# Contributing to Desk

Thanks for being here. Desk is small, opinionated, and grown carefully. Contributions are welcome — read this before you start so we land changes the same way.

## Ground rules

1. **The two north stars are not negotiable.** *Semantic anchoring* (no pixel-coord primitives anywhere) and *HCI is the headline investment* (UX wins trade-offs against feature breadth). A PR that erodes either gets pushed back even if everything else is great.
2. **Plugins extend; the core stays small.** New artifact / component / relation types belong in their own packages (or in `packages/plugins-builtin/` if they're broadly useful). Don't add type-specific branches to the core service or viewer. One sanctioned exception: security gates live in the core — `DeskService` branches on `custom-react` for the sandbox transpile/validation gate, because that boundary can't be delegated to a plugin.
3. **No mid-stream redesigns inside a PR.** If you find a change going wider than its title, split it. Reviewers should never have to choose between accepting a redesign and rejecting a useful fix.

## Setup

Prereq: [Bun](https://bun.sh) >= 1.1 — it's the package manager and runtime here. Tests run via `bun run test` (Vitest in most packages, `bun test` in server and channel).

```bash
git clone https://github.com/Alireza29675/desk.git   # or your fork
cd desk
bun install
bun run typecheck
bun run build        # builds every package that defines a build — the server serves the viewer from its built dist
bun run dev          # boots the CLI -> server on http://localhost:7878, serves the built viewer
```

### Working on the viewer

`bun run dev` serves the prebuilt viewer — fine for trying things, slow for iterating. For hot reload, run two processes:

```bash
bun run --filter '@desk/server' dev    # server on http://127.0.0.1:7878
bun run --filter '@desk/viewer' dev    # Vite on http://localhost:5179, proxies /api and /ws to 7878
```

The viewer's `dev` and `build` first bundle the sandboxed custom-component harness into `public/custom-harness.js` (generated, gitignored). Vite doesn't watch that bundle, so to pick up changes under `packages/viewer/src/harness/`, re-run `bun run build:harness` (or restart `bun run dev`).

## Project shape

- `packages/types` — the type vocabulary. Edit cautiously; this is the API surface for plugins.
- `packages/plugin-sdk` — plugin contracts + registry. Edit cautiously for the same reason.
- `packages/anchor-geometry` — pure anchor-projection math shared by the viewer's capture crop and the channel's screenshot crop. No DOM, no dependencies.
- `packages/server` — the domain core (`DeskService`), storage, MCP, WS, HTTP. All transport adapters call into `DeskService`; no domain logic outside it.
- `packages/plugins-builtin` — the v1 vocabulary. Reference implementations for new plugins.
- `packages/viewer` — the React app. Renderers are looked up by component type; never branch on type in shared code.
- `packages/cli` — the `desk` binary. Should stay tiny.
- `packages/channel` — the `desk-channel` bridge. Forwards operator comments (and attachments) into a live Claude Code session and posts the agent's replies back.

Deeper dives live in `docs/` — start with `docs/architecture.md`.

## Commits

Angular convention — `type(scope): description`. Examples:

```
feat(server): support relation removal
fix(viewer): preserve scroll position on hot-reload
refactor(plugin-sdk): split registry into validation and serialization
```

Subject only. No body, no footers, no co-author trailers.

## PR checklist

- [ ] `bun run typecheck` passes.
- [ ] `bun run test` passes. Some tests are deliberate drift guards (layout pinning, motion budget) — if one fails, the guard is telling you the change broke a documented invariant.
- [ ] `bun run lint` passes (Biome handles lint + format; `bun run format` auto-fixes formatting only — lint-rule diagnostics need `bunx biome check --write .` or manual fixes).
- [ ] If you touched a renderer, the artifact still renders both light and dark.
- [ ] If you added a tool or HTTP route, it goes through `DeskService` — not direct repository calls.
- [ ] If you added a public type, you also updated the package's README.
- [ ] If you changed behavior, you updated the relevant README. Documentation is part of the feature.

## What I'm unlikely to merge

- Pixel-coord primitives in any form (anchor shapes, comment payloads, plugin interfaces).
- Mermaid renderers (spec'd out — D2 + Graphviz cover the design space).
- Drawing-tool features (Desk is a viewer for agent-produced artifacts, not a human-first creation app).
- Multi-tenant / SaaS scaffolding (Desk runs locally by design — one operator, one machine, one SQLite file).
