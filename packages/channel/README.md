# @desk/channel

The Claude Code **channel bridge** for Desk. It closes the human→agent half of the loop: when you leave a comment in the Desk viewer, this bridge pushes it into your running Claude Code session as a `<channel source="desk">` event, so the agent reacts to it live. When the agent replies, the bridge posts that reply back to Desk as a comment you see in the viewer.

## How it fits

```
  you comment in viewer
        │
        ▼
  Desk server  ──(WebSocket s.commented)──▶  desk-channel bridge  ──(notifications/claude/channel)──▶  Claude Code session
        ▲                                          │
        └──────────(POST /a/:id/comments)──────────┘   ← agent calls the `reply` tool
```

The bridge is a **stdio MCP server** (Claude Code spawns it as a subprocess — that's how channels work). It is separate from Desk's HTTP MCP server, which still provides the 14 artifact tools. The bridge only does two things: forward human comments in, and post agent replies back out.

## Run it

Channels are a Claude Code research-preview feature and custom channels aren't on the allowlist, so they load with the development flag. Register the bridge as an MCP server, then launch:

```bash
claude mcp add desk-channel -- bun /ABSOLUTE/PATH/desk/packages/channel/src/index.ts
claude --dangerously-load-development-channels server:desk-channel
```

The Desk server must be running (default `http://127.0.0.1:7878`). Override with `DESK_URL` if you moved it.

## What arrives in the session

```
<channel source="desk" artifact_id="yqnrm6d8kqrhfk" comment_id="…" author="M" anchor="general">
M's comment text here
</channel>
```

The agent replies by calling the `reply` tool with the `artifact_id` from the tag. Only **human** comments are forwarded — the agent's own replies don't echo back, so there's no loop.

## Security

The bridge listens only to a localhost Desk instance and forwards comments authored by `kind: "human"`. Because Desk is single-operator and local-first, the comment stream is already trusted; there's no external sender to gate. If you ever expose Desk beyond loopback, add a sender allowlist here before trusting the stream (see the Claude Code channels-reference notes on prompt-injection gating).
