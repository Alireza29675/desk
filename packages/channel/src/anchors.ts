/**
 * Turning a comment's anchors into the text the agent reads. A comment can now
 * anchor to MANY selections (a region in one component, a sentence in another),
 * each with its own captured image — this builds the description that pairs
 * every selection to its picture so the model sees them all.
 */

export interface ChannelAnchor {
  kind: string;
  componentId?: string;
  elementPath?: string;
  region?: { kind: string; x?: number; y?: number; width?: number; height?: number };
  offset?: { x: number; y: number };
}

/** A compact, human-readable id for one anchor, e.g. `region:chart-1` or
 *  `text-selection:doc-2.body`. */
export function describeAnchor(anchor: ChannelAnchor): string {
  if (anchor.kind === 'general') return 'general';
  const path = anchor.elementPath ? `.${anchor.elementPath}` : '';
  return `${anchor.kind}:${anchor.componentId ?? '?'}${path}`;
}

/**
 * Describe a comment's whole selection set and collect its image paths.
 * `images` maps an anchor's index → the local PNG path captured for it.
 *
 * - A lone document-level (`general`) comment has nothing spatial to show, so
 *   the text is empty (the comment body stands alone).
 * - One tethered selection reads as a sentence (back-compat with the single
 *   anchor phrasing).
 * - Several selections read as a list, each paired to its image.
 */
export function describeAnchors(
  anchors: ChannelAnchor[],
  images: Map<number, string>,
): { text: string; paths: string[] } {
  if (anchors.length === 0 || (anchors.length === 1 && anchors[0]!.kind === 'general')) {
    return { text: '', paths: [] };
  }

  const paths: string[] = [];
  const lines = anchors.map((anchor, i) => {
    const img = images.get(i);
    if (img) paths.push(img);
    return img ? `- ${describeAnchor(anchor)} → image: ${img}` : `- ${describeAnchor(anchor)}`;
  });

  if (anchors.length === 1) {
    const img = images.get(0);
    const desc = describeAnchor(anchors[0]!);
    return {
      text: img
        ? `The operator anchored this to ${desc}. Open this image to see exactly what they selected: ${img}`
        : `The operator anchored this to ${desc}.`,
      paths,
    };
  }

  return {
    text: `The operator anchored this to ${anchors.length} selections:\n${lines.join('\n')}\nOpen the listed images to see what they selected.`,
    paths,
  };
}
