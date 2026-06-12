# @desk/channel

The Claude Code **channel bridge** for Desk. It closes the human→agent half of the loop: when you leave a comment in the Desk viewer, this bridge pushes it into your running Claude Code session as a `<channel source="desk">` event, so the agent reacts to it live. When the agent replies, the bridge posts that reply back to Desk as a comment you see in the viewer.

## How it fits

```
  you comment in viewer
        │
        ▼
  Desk server  ──(WebSocket s.commented)──▶  desk-channel bridge  ──(notifications/claude/channel)──▶  Claude Code session
        ▲                                          │
        └────────(POST /api/a/:id/comments)────────┘   ← agent calls the `reply` tool
```

The bridge is a **stdio MCP server** (Claude Code spawns it as a subprocess — that's how channels work). It is separate from Desk's HTTP MCP server, which still provides the 15 artifact tools. The bridge does three things: forward human comments in, attach an image of what the operator anchored to, and post agent replies back out.

## Run it

Channels are a Claude Code research-preview feature and custom channels aren't on the allowlist, so they load with the development flag. Register the bridge as an MCP server, then launch:

```bash
claude mcp add desk-channel -- bun /ABSOLUTE/PATH/desk/packages/channel/src/index.ts
claude --dangerously-load-development-channels server:desk-channel
```

The Desk server must be running (default `http://127.0.0.1:7878`). Override with `DESK_URL` if you moved it.

## What arrives in the session

```
<channel source="desk" artifact_id="yqnrm6d8kqrhfk" comment_id="…" author="M" anchor="region:arch-diagram" screenshot="$TMPDIR/desk-channel/<comment-id>-attached.png">
Comment on "Payment flow":

M's comment text here

The operator anchored this to region:arch-diagram. Open this image to see exactly what they selected: $TMPDIR/desk-channel/<comment-id>-attached.png
</channel>
```

The body is prefixed with the artifact title. The `screenshot` attribute and the trailing image line appear only when a screenshot was captured (see below); a general, un-anchored comment is just the prefix and text. The agent replies by calling the `reply` tool with the `artifact_id` from the tag. Only **human** comments are forwarded — the agent's own replies don't echo back, so there's no loop.

## Screenshots

Anchored comments ride in with an image of what the operator selected, not just an anchor id:

- **Primary** — the screenshot the viewer captured at comment time (exactly what the operator saw: their theme, viewport, live state), attached to the comment and fetched from the Desk server (`GET /api/attachments/:id`).
- **Fallback** — a headless-Chrome re-render of the anchored component against the live viewer, via `puppeteer-core`. Used for comments without an attachment and for iframe content the viewer can't rasterize. It crops with `@desk/anchor-geometry`'s `cropForAnchor` — the same framing math the viewer's capture path uses — so fallback shots match primary shots.

Either way the PNG lands in `$TMPDIR/desk-channel/` — `<comment-id>-attached.png` for primary shots, `<comment-id>.png` for fallback re-renders — and its path appears in the channel message. The fallback needs a local Chrome (`puppeteer-core` doesn't bundle a browser): the default executable path is the macOS Google Chrome install, so set `DESK_CHROME` to your Chrome/Chromium binary on other platforms. Without it, comments are still forwarded — just text-only.

## Development

```bash
bun install        # once, at the repo root (workspace)
bun run start      # run the bridge standalone against a local Desk server
bun test           # tests
bun run typecheck  # types
```

## Security

The bridge listens only to a localhost Desk instance and forwards comments authored by `kind: "human"`. Because Desk is single-operator and local-first, the comment stream is already trusted; there's no external sender to gate. If you ever expose Desk beyond loopback, add a sender allowlist here before trusting the stream (see the Claude Code channels-reference notes on prompt-injection gating).
