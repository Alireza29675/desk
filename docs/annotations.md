# Annotations: anchors, attachments, and how a screenshot reaches the agent

This document covers the comment/annotation pipeline end to end — the part of
Desk a contributor can't reverse-engineer from any single package, because it
spans types → viewer → server → channel.

## Anchors (where a comment points)

`CommentAnchor` (`packages/types/src/comment.ts`) is a five-kind discriminated
union: `element`, `region`, `text-selection`, `point`, `general`. The design
pillar: anchors are **semantic or relative, never raw pixels**. A region is
fractions (0..1) of its component's box (the type also allows a plugin-defined
*named* sub-region — nothing produces one yet, and the capture crop treats it
as the whole component); a point is a relative offset; a text
selection is character offsets into the component's resolved text. That's what
lets an anchor survive zoom, reflow, theme changes, and different screens.

Projecting an anchor back into pixels happens at the edges, with one shared
implementation: **`@desk/anchor-geometry`** (`cropForAnchor`). Both capture
pipelines (below) call it, so a point anchor is framed identically no matter
which pipeline produced the image: a fixed 220×160 context window around the
point; a region maps to its fractional rect; element/text-selection fall back
to the whole component box. Everything is padded by 10px and clamped.

## Anchors rendered back on the artifact

The reverse projection — unresolved comments surfacing on the artifact for
the operator. A component carrying unresolved anchored comments shows a small
persistent dot per thread (`unresolved-dot` buttons,
`packages/viewer/src/components/Commentable.tsx`; `general` anchors have no
spatial placement and stay rail-only). Unresolved text selections also get a
persistent tint (`desk-anchor-unresolved`, a CSS Custom Highlight painted by
`packages/viewer/src/state/use-anchor-highlights.ts`). Hovering or focusing a
dot opens a popover with the comment text and reveals the anchor's shape;
clicking it calls `focusAnchor` (pulses the anchor) and `revealInRail(id)` —
the store sets `railTarget` (self-clearing after 1.6s) and the comment rail
scrolls the thread into view and flashes it (`data-rail-flash`). Resolving a
comment removes its dot and tint.

## Attachments (images riding on a comment)

Metadata lives on the comment **envelope** (`Comment.attachments`), beside the
payload — a comment has a body AND attachments; the payload union stays the
body type. Bytes never travel with the comment: they're stored in the
`attachments` SQLite table and served at `GET /api/attachments/:id`
(immutable, cacheable).

Posting: `POST /api/a/:id/comments` accepts
`attachments: [{ kind: 'image', dataUrl: 'data:image/png;base64,…' }]`.
The server decodes and validates **before any row is written** — PNG
signature, IHDR dimensions, ≤ 2 MB each (`packages/server/src/core/png.ts`);
the service caps a comment at 4 attachments (`MAX_ATTACHMENTS_PER_COMMENT`,
`packages/server/src/core/service.ts`). A bad image bounces the whole post
with a clear message; a comment is never stored without its image.

Two consumers fetch from that endpoint: the comment rail renders attachment
thumbnails with a click-to-zoom lightbox (`api.attachmentUrl`,
`packages/viewer/src/components/CommentRail.tsx`), and the channel's
`attachmentToFile` (below) materializes the bytes for the agent.

## Capture (what the operator saw)

When a human posts a comment on a `point` or `region` anchor, the viewer
(`packages/viewer/src/lib/capture-anchor.ts`) rasterizes the anchored component's live
DOM with `html-to-image`, crops via the shared `cropForAnchor`, and attaches
the PNG. This captures the operator's **actual view** — their theme, viewport,
and live component state.

Caps: device-pixel-ratio ≤ 2, long edge ≤ 1600px, and a 2 MB encoded ceiling.

Capture is best-effort **by contract**: any failure returns null and the
comment posts without an attachment. Known, accepted limits:

- CSS Custom Highlight painting does not rasterize (irrelevant for
  point/region anchors).
- Cross-origin iframe content — including sandboxed custom components —
  rasterizes blank from the parent document.

## Delivery (how the agent sees it)

The channel bridge (`packages/channel`) forwards every human comment into the
Claude Code session. For the image:

1. **Primary** — `src/attachments.ts` `attachmentToFile`: if the comment
   carries an image attachment, fetch its bytes from the server and write a
   tmp PNG; the file path travels in the notification's `meta.screenshot` and
   in the body line ("Open this image to see exactly what they selected").
2. **Fallback** — `src/screenshot.ts` `captureAnchor`: for spatial comments
   with no attachment (older viewer, capture failure, custom-component
   iframes), a headless-Chrome re-render of the artifact, cropped with the
   same shared geometry. Note its limits: it renders in forced light scheme
   at a fixed 1440×900 viewport, and needs a Chrome binary — it defaults to
   the macOS Google Chrome path and can be pointed elsewhere with the
   `DESK_CHROME` env var (set it on Linux/Windows).

Either way the agent receives a local file path it can open — verified
end-to-end: real server → real WebSocket `s.commented` (metadata included) →
`attachmentToFile` → a PNG the model opened and saw.

## Checkbox state and the authored baseline (related protocol)

Checklist toggles are real state: the viewer PATCHes the flipped item and
commits immediately (reason `[checkbox]`), so a toggle never sits in the 2s
auto-commit window. Toggling also seeds a comment draft (store slot
`commentDraft`, single-slot, rapid toggles coalesce) so the agent learns what
got checked once the human sends it.

Reset restores the **authored** state, served by
`GET /api/a/:id/baseline/:componentId`: each item's `checked` at its first
appearance in the artifact's committed snapshots. (Not "last agent snapshot" —
agents commit full working content, which would carry human checks along.)
Derivable for every existing artifact; items never yet committed fall back to
their current value.
