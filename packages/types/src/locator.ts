/**
 * Deep-link locators — the unified grammar for addressing a place *inside* an
 * artifact. This is the URL-fragment cousin of comment anchors (§ comment.ts):
 * both are semantic, never pixel coordinates.
 *
 * Grammar: a locator is a sequence of `kind:value` segments joined by `/`.
 *
 *   slide:3
 *   slide:3/component:s7-code
 *   component:h1-code/element:lines.12
 *
 * `kind` is a lowercase identifier; `value` is percent-encoded so it may carry
 * dotted element paths (`rows.3.cells.title`) without colliding with the `/`
 * segment separator. Each artifact type decides which `kind`s it understands
 * (a presentation reads `slide`; a document reads `component`), but every
 * artifact type speaks the same segment format — that's the "unified pattern".
 */
export interface LocatorSegment {
  kind: string;
  value: string;
}

const SEGMENT = /^([a-z][a-z0-9-]*):(.*)$/;

/** Parse a hash string (with or without the leading `#`) into segments. */
export function parseLocator(hash: string): LocatorSegment[] {
  const clean = hash.replace(/^#/, '').trim();
  if (!clean) return [];
  const segments: LocatorSegment[] = [];
  for (const part of clean.split('/')) {
    const match = SEGMENT.exec(part);
    if (!match) continue;
    const [, kind, rawValue] = match;
    if (!kind) continue;
    segments.push({ kind: kind.toLowerCase(), value: safeDecode(rawValue ?? '') });
  }
  return segments;
}

/** Serialize segments back into a hash string (no leading `#`). */
export function formatLocator(segments: LocatorSegment[]): string {
  return segments
    .filter((s) => s.kind && s.value !== '')
    .map((s) => `${s.kind}:${encodeURIComponent(s.value)}`)
    .join('/');
}

/** First value for a given segment kind, or undefined. */
export function locatorValue(segments: LocatorSegment[], kind: string): string | undefined {
  return segments.find((s) => s.kind === kind)?.value;
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
