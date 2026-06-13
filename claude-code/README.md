# Desk — Claude Code plugin

Wires [desk](https://github.com/Alireza29675/desk) into Claude Code in one install. Desk gives your
agent a **live local viewer**: it renders typed artifacts — diagrams, charts, tables, math, mindmaps,
timelines, callouts, code — into a browser tab you watch while the agent works, and it carries the
comments you leave back into the agent's session.

This plugin registers desk's two MCP surfaces and keeps the viewer running for you.

## What it sets up

| Surface | What it gives you | Loads |
| --- | --- | --- |
| **`desk` tools** | the agent renders and revises artifacts in the viewer (`http://127.0.0.1:7878`), and reads the comments you leave on them | automatically — works on a normal `claude` launch |
| **`desk-channel`** | your comments arrive in the session automatically, the moment you leave them | with the `desk-code` launcher (see below) |

The full round-trip works on a plain `claude` launch: the agent renders artifacts, you comment on them
in the viewer, and when you ask it to "check the comments" the agent pulls them (`get_artifact` returns
each artifact's comments) and revises. A bundled `desk-comments` skill makes that pull reliable. The
`desk-code` launcher adds **live push** — comments arriving on their own, no nudge — via Claude Code's
research-preview channel.

A `SessionStart` hook runs `desk start`, so the viewer comes up in the background when you launch
Claude Code and is reused if it's already running. Set `DESK_NO_AUTOSTART=1` to turn that off; you can
always start it yourself with `desk start` and stop it with `desk stop`.

## Requirements

- The `desk` CLI on your PATH (the [install script](https://github.com/Alireza29675/desk#readme)
  installs it, plus [Bun](https://bun.sh), which desk runs on).
- Claude Code **v2.1.80+** for the live-push comment loop (`desk-code`). The tools and the pull loop
  work on earlier versions.

## Install

```
/plugin marketplace add Alireza29675/desk
/plugin install desk@desk
```

Run `/mcp` afterward and you'll see `desk` with its tools. The agent can now render artifacts.

## The comment loop

You get the human↔agent loop on a plain `claude` launch, **pull style**: you comment in the viewer,
then ask the agent to check them — it reads each artifact's comments and revises. No flag needed.

`desk-code` upgrades that to **live push**: comments arrive in the session the moment you leave them,
unprompted. This uses Claude Code's **channels** feature, which is in research preview — a channel from
a marketplace other than Anthropic's official one needs a launch flag, so the install script gives you
a one-word launcher that supplies it:

```
desk-code        # = claude --dangerously-load-development-channels plugin:desk@desk
```

Launch with `desk-code` instead of `claude` when you want comments to push live. (No org policy is
bypassed — the flag only opts this one plugin past the research-preview allowlist on your own machine.)

## Local-first

Everything runs on your machine: one Bun process, a SQLite file under `~/.desk`, no cloud.
