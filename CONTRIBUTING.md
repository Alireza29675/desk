# Contributing to Desk

Thanks for being here. Desk is small, opinionated, and grown carefully. Contributions are welcome — read this before you start so we land changes the same way.

## Ground rules

1. **The two north stars are not negotiable.** *Semantic anchoring* (no pixel-coord primitives anywhere) and *HCI is the headline investment* (UX wins trade-offs against feature breadth). A PR that erodes either gets pushed back even if everything else is great.
2. **Plugins extend; the core stays small.** New artifact / component / relation types belong in their own packages (or in `packages/plugins-builtin/` if they're broadly useful). Don't add type-specific branches to the core service or viewer.
3. **No mid-stream redesigns inside a PR.** If you find a change going wider than its title, split it. Reviewers should never have to choose between accepting a redesign and rejecting a useful fix.

## Setup

```bash
git clone git@github.com:Alireza29675/desk.git
cd desk
bun install
bun run typecheck
bun run dev          # boots the CLI, which boots the server + opens the viewer
```

## Project shape

- `packages/types` — the type vocabulary. Edit cautiously; this is the API surface for plugins.
- `packages/plugin-sdk` — plugin contracts + registry. Edit cautiously for the same reason.
- `packages/server` — the domain core (`DeskService`), storage, MCP, WS, HTTP. All transport adapters call into `DeskService`; no domain logic outside it.
- `packages/plugins-builtin` — the v1 vocabulary. Reference implementations for new plugins.
- `packages/viewer` — the React app. Renderers are looked up by component type; never branch on type in shared code.
- `packages/cli` — the `desk` binary. Should stay tiny.

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
- [ ] If you touched a renderer, the artifact still renders both light and dark.
- [ ] If you added a tool or HTTP route, it goes through `DeskService` — not direct repository calls.
- [ ] If you added a public type, you also updated the package's README.
- [ ] If you changed behavior, you updated the relevant README. Documentation is part of the feature.

## What I'm unlikely to merge

- Pixel-coord primitives in any form (anchor shapes, comment payloads, plugin interfaces).
- Mermaid renderers (spec'd out — D2 + Graphviz cover the design space).
- Drawing-tool features (Desk is a viewer for agent-produced artifacts, not a human-first creation app).
- Multi-tenant / SaaS scaffolding (Desk is local-first by design; non-goals are explicit in the spec).
