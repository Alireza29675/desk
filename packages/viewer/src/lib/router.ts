import { type LocatorSegment, formatLocator, parseLocator } from '@desk/types';

/**
 * Tiny history-API router. Desk URLs are unified and shareable:
 *
 *   /a/<id>                       the artifact, current state
 *   /a/<id>/v/<n>                 a past committed version
 *   /a/<id>#slide:3/component:x   a deep link inside the artifact
 *
 * The viewer reflects the open artifact (and its in-artifact location) into
 * the address bar so any view is a copy-pasteable link. The locator fragment
 * grammar lives in @desk/types so artifact types and the server share it.
 */
export interface ParsedLocation {
  artifactId?: string;
  version?: number;
  segments: LocatorSegment[];
}

const ARTIFACT_PATH = /^\/a\/([^/]+)(?:\/v\/(\d+))?\/?$/;

export function readLocation(): ParsedLocation {
  const { pathname, hash } = window.location;
  const match = ARTIFACT_PATH.exec(pathname);
  const segments = parseLocator(hash);
  if (!match) return { segments };
  const [, id, version] = match;
  return { artifactId: id, version: version ? Number(version) : undefined, segments };
}

export function artifactPath(
  id: string,
  segments: LocatorSegment[] = [],
  version?: number,
): string {
  const base = version ? `/a/${id}/v/${version}` : `/a/${id}`;
  const fragment = formatLocator(segments);
  return fragment ? `${base}#${fragment}` : base;
}

export function absoluteUrl(path: string): string {
  return `${window.location.origin}${path}`;
}

function currentPath(): string {
  return window.location.pathname + window.location.hash;
}

/** Navigate to an artifact, adding a history entry (back button works). */
export function pushArtifact(id: string, segments: LocatorSegment[] = [], version?: number): void {
  const path = artifactPath(id, segments, version);
  if (path !== currentPath()) window.history.pushState({}, '', path);
}

/** Update only the in-artifact locator without adding a history entry. */
export function replaceLocator(id: string, segments: LocatorSegment[], version?: number): void {
  const path = artifactPath(id, segments, version);
  if (path !== currentPath()) window.history.replaceState({}, '', path);
}

export function goHome(): void {
  if (currentPath() !== '/') window.history.pushState({}, '', '/');
}

export function onPopState(cb: () => void): () => void {
  window.addEventListener('popstate', cb);
  return () => window.removeEventListener('popstate', cb);
}
