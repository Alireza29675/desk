---
name: desk-comments
description: Check and act on the human's comments left in the desk viewer. Use when the user asks you to review desk feedback or comments, says they left notes on an artifact, or asks you to revise based on what they marked up in the viewer.
---

The human leaves comments directly on the artifacts you render in the desk viewer. On a plain
`claude` launch these don't arrive on their own — you pull them. Do that whenever the user points you
at their feedback ("check the comments", "I left notes on the diagram", "address my feedback").

## Steps

1. **Find the artifact(s).** Use the ids of artifacts you created or updated this session. If you
   don't have them, call `list_artifacts` (most-recently-updated first) and pick the relevant one(s).
2. **Read the comments.** Call `get_artifact` for each — the response carries a `comments` array
   alongside the artifact itself. Each comment has the note text at `payload.text`, an `author`, a
   `resolved` flag (omitted when not yet resolved), and `anchors[]` saying what it points at —
   `kind:"general"` is the whole artifact, otherwise it targets a specific component (and sometimes a
   sub-element). Focus on the human's comments that aren't `resolved`, so you act on what's still open.
3. **Act on each.** Revise the artifact with `update_artifact` (and `commit` when you want to snapshot
   a version the human can scrub back to). When a comment deserves a written answer, reply with the
   `comment` tool: set `body` to your reply text, `thread_parent_id` to the comment you're answering,
   `author` to your agent identity, and `anchor` to the same component the comment targets.
4. **Summarize** what each comment asked for and what you changed.

Live push — comments arriving automatically, without you being asked — is available by launching with
`desk-code` instead of `claude`, which turns on desk's research-preview channel. The pull steps above
need no flag and work on a plain `claude` launch.
