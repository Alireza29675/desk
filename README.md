<div align="center">

# Desk

**A visual communication channel between AI agents and the human at the keyboard.**

Agents draft, draw, present. You watch it form live — and reply by pointing at
the part that's wrong.

[Website](https://alireza29675.github.io/desk/) · [Quickstart](#quickstart) ·
[How it works](docs/architecture.md) · [MCP](docs/mcp.md)

</div>

> [!WARNING]
> **🚧 WIP experiment.** Built largely autonomously with Claude Code. Expect rough
> edges and breaking changes — explore it, don't depend on it yet.

<!-- Real session capture: rendered artifacts + an anchored comment and the agent's reply -->
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://alireza29675.github.io/desk/captures/readme-hero-dark.png">
  <img alt="A desk session: rendered artifacts in the workspace with an anchored comment open" src="https://alireza29675.github.io/desk/captures/readme-hero-light.png">
</picture>

## Why

Most AI tools talk to you through a chat box. That's fine for sentences. It is the
wrong surface for anything visual — by the time an agent describes a diagram in
prose, the diagram itself would have been clearer.

Desk inverts the surface: agents create typed visual artifacts and stream them into
a viewer you're already watching. Your comments anchor to *the thing itself* — a
bullet, a diagram node, a table cell, never pixels — and flow back to the agent.

## Quickstart

```bash
git clone https://github.com/Alireza29675/desk
cd desk
bun install
bun run --filter '@desk/viewer' build
bun run dev
```

This serves the viewer on `http://127.0.0.1:7878`. Then connect your agent (the
`desk` bin isn't on npm yet, so run the CLI through bun):

```bash
bun packages/cli/src/index.ts mcp claude-desktop   # prints config to paste — also: cursor · generic
```

## What you get

- **Typed artifacts** — enriched documents and presentations, built from 15
  live-rendered components: diagrams (D2), charts, tables, math, mindmaps,
  timelines, code, images, …
- **Semantic comments** — press <kbd>C</kbd>, then point, drag a region, or select
  text; one comment can anchor to several selections. Anchors survive re-renders.
- **The round-trip** — any MCP client reads comments back; with the
  [comment channel](packages/channel/README.md), they land live in your Claude
  Code session, screenshots included.
- **Time travel** — every commit is a snapshot; scrub any artifact back through
  its history.
- **Local-first** — one Bun process, one port, one SQLite file. 15 MCP tools.

## Going deeper

[Architecture](docs/architecture.md) · [MCP surface](docs/mcp.md) · [Annotations](docs/annotations.md) · [Custom components](docs/custom-components.md) · [Plugin SDK](packages/plugin-sdk/README.md) · [Comment channel](packages/channel/README.md)

MIT © [Alireza Sheikholmolouki](https://github.com/Alireza29675)
