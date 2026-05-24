import type {
  Artifact,
  ArtifactId,
  ArtifactPatch,
  Author,
  Comment,
  CommentAnchor,
  CommentId,
  CommentPayload,
  HistoryEvent,
  Relation,
  RelationGraph,
  RelationType,
} from '@desk/types';

/**
 * Thin REST client. The server mounts all data routes under `/api`, so the
 * base is `/api` in every environment. In dev, Vite proxies `/api` to the
 * server; in production the server hosts the viewer and the API on one origin.
 */
const base = '/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body?.error?.message ?? res.statusText, res.status, body?.error?.code);
  }
  return res.json() as Promise<T>;
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ArtifactBundle {
  artifact: Artifact;
  relations: RelationGraph;
  comments: Comment[];
}

export const api = {
  listArtifacts: (params?: { type?: string; limit?: number; offset?: number }) =>
    request<{ items: Artifact[] }>(
      `/artifacts?${new URLSearchParams(params as Record<string, string>).toString()}`,
    ),
  search: (q: string) => request<{ items: Artifact[] }>(`/artifacts/search?q=${encodeURIComponent(q)}`),
  getArtifact: (id: ArtifactId) => request<ArtifactBundle>(`/a/${id}`),
  getArtifactAtVersion: (id: ArtifactId, version: number) =>
    request<{ artifact: Artifact }>(`/a/${id}/v/${version}`),
  history: (id: ArtifactId) => request<{ events: HistoryEvent[] }>(`/a/${id}/history`),
  similar: (id: ArtifactId) => request<{ items: Artifact[] }>(`/a/${id}/similar`),
  createArtifact: (input: { type: string; author: Author; reason?: string }) =>
    request<Artifact>('/artifacts', { method: 'POST', body: JSON.stringify(input) }),
  patchArtifact: (id: ArtifactId, patch: ArtifactPatch, author: Author) =>
    request<Artifact>(`/a/${id}`, { method: 'PATCH', body: JSON.stringify({ patch, author }) }),
  commit: (id: ArtifactId, author: Author, reason?: string) =>
    request<Artifact>(`/a/${id}/commit`, { method: 'POST', body: JSON.stringify({ author, reason }) }),
  comment: (
    id: ArtifactId,
    body: { anchor: CommentAnchor; payload: CommentPayload; author: Author; threadParentId?: CommentId },
  ) => request<Comment>(`/a/${id}/comments`, { method: 'POST', body: JSON.stringify(body) }),
  resolveComment: (id: CommentId, resolved: boolean) =>
    request<{ ok: true }>(`/comments/${id}/resolve`, { method: 'POST', body: JSON.stringify({ resolved }) }),
  addRelation: (from: ArtifactId, to: ArtifactId, type: RelationType) =>
    request<Relation>('/relations', { method: 'POST', body: JSON.stringify({ from, to, type }) }),
  plugins: () =>
    request<{
      artifactTypes: { type: string; displayName: string }[];
      componentTypes: { type: string; displayName: string }[];
      relationTypes: { type: string; displayName: string }[];
    }>('/plugins'),
};
