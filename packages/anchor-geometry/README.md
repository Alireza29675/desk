# @desk/anchor-geometry

Pure projection math for spatial comment anchors. Anchors store **semantic or relative** positions — fractions of a component's box, never raw pixels. This package answers the inverse question both capture pipelines need: given the component's box on screen, what area does an anchor cover? The viewer's `html-to-image` crop (`packages/viewer/src/lib/capture-anchor.ts`) and the channel's Puppeteer fallback (`packages/channel/src/screenshot.ts`) both call it, so the operator sees the same framing no matter which pipeline produced the image.

## What it exports

| Export | What it does |
| --- | --- |
| `cropForAnchor(anchor, box, bounds)` | The crop rectangle for an anchor, in the same coordinate space as `box`. A `point` anchor gets a fixed 220×160 context window centered on the point; a fractional `region` maps to its rect within the box; everything else (element, text-selection, named regions) falls back to the whole component box. Every crop is padded by `CROP_PADDING` and clamped to `bounds`, never below 1×1. |
| `longEdgeScale(width, height, pixelRatio, maxLongEdge)` | Scale factor (≤ 1) that keeps a crop rendered at `pixelRatio` inside `maxLongEdge` device pixels — multiply the render ratio by it. The viewer's capture path passes 1600. |
| `POINT_CROP` | The fixed point-anchor context window: `{ width: 220, height: 160 }`. |
| `CROP_PADDING` | Breathing room added around every crop before clamping: 10px. |
| `PixelRect`, `SpatialAnchorLike` | The minimal structural shapes the math needs — callers pass their real anchor types without this package depending on `@desk/types`. |

## What deliberately doesn't live here

This is pure geometry: no DOM, no rasterization, no failure handling. What happens when a capture fails is each pipeline's own contract — the viewer's lives in `packages/viewer/src/lib/capture-anchor.ts`. For the annotation pipeline end to end (anchor shapes, capture, attachments, channel delivery), see [`docs/annotations.md`](../../docs/annotations.md).

## Development

```bash
bun run typecheck  # types
bun run test       # vitest unit tests for the projection math
```
