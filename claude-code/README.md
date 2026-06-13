# Desk — Claude Code plugin

Wires [desk](https://github.com/Alireza29675/desk) into Claude Code in one install. Desk gives your
agent a **live local viewer**: it renders typed artifacts — diagrams, charts, tables, math, mindmaps,
timelines, callouts, code — into a browser tab you watch while the agent works, and it carries the
comments you leave back into the agent's session.

This plugin registers desk's two MCP surfaces and keeps the viewer running for you.

## What it sets up

| Surface | What it gives you | Loads |
| --- | --- | --- |
| **`desk` tools** | the agent creates and updates artifacts that render live in the viewer (`http://127.0.0.1:7878`) | automatically — works on a normal `claude` launch |
| **`desk-channel`** | the comments you leave in the viewer flow back into the session, and the agent can reply | needs the `desk-code` launcher (see below) |

A `SessionStart` hook runs `desk start`, so the viewer comes up in the background when you launch
Claude Code and is reused if it's already running. Set `DESK_NO_AUTOSTART=1` to turn that off; you can
always start it yourself with `desk start` and stop it with `desk stop`.

## Requirements

- The `desk` CLI on your PATH (the [install script](https://github.com/Alireza29675/desk#readme)
  installs it, plus [Bun](https://bun.sh), which desk runs on).
- Claude Code **v2.1.80 or later** — required for the comment-loop channel.

## Install

```
/plugin marketplace add Alireza29675/desk
/plugin install desk@desk
```

Run `/mcp` afterward and you'll see `desk` with its tools. The agent can now render artifacts.

## The comment loop

Getting the human's comments back into the session uses Claude Code's **channels** feature, which is in
research preview. A channel from a marketplace other than Anthropic's official one can't load on a plain
launch — it needs a flag. The install script gives you a one-word launcher that supplies it:

```
desk-code        # = claude --dangerously-load-development-channels plugin:desk@desk
```

Launch with `desk-code` instead of `claude` when you want the full loop. On a plain `claude` launch the
tools still work; only the inbound comments stay quiet. (No org policy is bypassed — the flag only opts
this one plugin past the research-preview allowlist on your own machine.)

## Local-first

Everything runs on your machine: one Bun process, a SQLite file under `~/.desk`, no cloud.
