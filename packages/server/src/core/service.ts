import type { Database } from 'bun:sqlite';
import type { PluginRegistry } from '@desk/plugin-sdk';
import type {
  Artifact,
  ArtifactContent,
  ArtifactId,
  ArtifactPatch,
  Author,
  Comment,
  CommentAnchor,
  CommentId,
  CommentPayload,
  Component,
  HistoryEvent,
  Relation,
  RelationGraph,
  RelationType,
  SubscriptionId,
} from '@desk/types';
import { newArtifactId, newCommentId, newHistoryEventId, newRelationId } from '../ids';
import { ArtifactRepository } from '../storage/artifacts';
import { CommentRepository } from '../storage/comments';
import { HistoryRepository } from '../storage/history';
import { RelationRepository } from '../storage/relations';
import { ALL_ARTIFACTS, type RealtimeHub, type SubscriberSink } from '../ws/hub';
import { CommitDebouncer } from './commit-debouncer';
import { illegalState, notFound, unknownPlugin, validationFailed } from './errors';

export interface DeskServiceOptions {
  db: Database;
  registry: PluginRegistry;
  hub: RealtimeHub;
  autoCommitMs: number;
}

/**
 * The domain core. Holds the plugin registry, the repositories, and the
 * realtime hub. Every transport (MCP tools, HTTP routes) calls into here.
 *
 * Invariants this layer enforces:
 *   1. No artifact mutation lands without passing plugin-side validation.
 *   2. Working-state mutations emit `s.working_changed`; commits emit
 *      `s.committed` and bump `Artifact.version`.
 *   3. Auto-commit-on-idle fires after `autoCommitMs` ms without an edit.
 */
export class DeskService {
  readonly artifacts: ArtifactRepository;
  readonly history: HistoryRepository;
  readonly comments: CommentRepository;
  readonly relations: RelationRepository;
  readonly hub: RealtimeHub;
  readonly registry: PluginRegistry;
  private readonly debouncer: CommitDebouncer;

  constructor(opts: DeskServiceOptions) {
    this.artifacts = new ArtifactRepository(opts.db);
    this.history = new HistoryRepository(opts.db);
    this.comments = new CommentRepository(opts.db);
    this.relations = new RelationRepository(opts.db);
    this.hub = opts.hub;
    this.registry = opts.registry;
    this.debouncer = new CommitDebouncer(opts.autoCommitMs, (id, author) =>
      this.commit(id, author, '[auto-commit]'),
    );
  }

  // ─── artifact lifecycle ──────────────────────────────────────────────

  createArtifact(input: {
    type: string;
    author: Author;
    initialContent?: Partial<ArtifactContent>;
    reason?: string;
  }): Artifact {
    const plugin = this.registry.artifactType(input.type);
    if (!plugin) throw unknownPlugin(`Unknown artifact type "${input.type}".`);

    const empty = plugin.emptyContent();
    const content: ArtifactContent = {
      title: input.initialContent?.title ?? empty.title,
      components: input.initialContent?.components ?? empty.components,
    };
    this.registry.validateContent(input.type, content);

    const provenance = authorToProvenance(input.author);
    const now = new Date().toISOString();
    const artifact: Artifact = {
      id: newArtifactId(),
      type: input.type,
      content,
      provenance,
      contributors: [{ author: input.author, firstTouchedAt: now }],
      createdAt: now,
      updatedAt: now,
      version: 1,
    };

    this.artifacts.insert(artifact);
    const event: HistoryEvent = {
      id: newHistoryEventId(),
      artifactId: artifact.id,
      kind: 'created',
      version: 1,
      author: input.author,
      ...(input.reason ? { reason: input.reason } : {}),
      snapshot: artifact.content,
      createdAt: now,
    };
    this.history.append(event);

    this.hub.publish({ kind: 's.committed', artifactId: artifact.id, event, artifact });
    return artifact;
  }

  patchArtifact(input: { id: ArtifactId; patch: ArtifactPatch; author: Author }): Artifact {
    const current = this.artifacts.get(input.id);
    if (!current) throw notFound(`Artifact "${input.id}" not found.`);

    const nextContent: ArtifactContent = {
      title: input.patch.title ?? current.content.title,
      components: input.patch.components ?? current.content.components,
    };
    this.registry.validateContent(current.type, nextContent);

    const now = new Date().toISOString();
    const next: Artifact = {
      ...current,
      content: nextContent,
      contributors: addContributor(current.contributors, input.author, now),
      updatedAt: now,
    };

    this.artifacts.update(next);
    this.debouncer.touch(next.id, input.author);
    this.hub.publish({ kind: 's.working_changed', artifactId: next.id, artifact: next });
    return next;
  }

  commit(artifactId: ArtifactId, author: Author, reason?: string): Artifact {
    const current = this.artifacts.get(artifactId);
    if (!current) throw notFound(`Artifact "${artifactId}" not found.`);
    this.debouncer.cancel(artifactId);

    const now = new Date().toISOString();
    const nextVersion = current.version + 1;
    const committed: Artifact = { ...current, version: nextVersion, updatedAt: now };
    this.artifacts.update(committed);

    const event: HistoryEvent = {
      id: newHistoryEventId(),
      artifactId,
      kind: 'edited',
      version: nextVersion,
      author,
      ...(reason ? { reason } : {}),
      snapshot: committed.content,
      createdAt: now,
    };
    this.history.append(event);

    this.hub.publish({ kind: 's.committed', artifactId, event, artifact: committed });
    return committed;
  }

  /**
   * Permanently delete an artifact. Cascades to its history, comments, and
   * relations (FK ON DELETE CASCADE). This is a lifecycle op, not a history
   * rewrite — the append-only guarantee is about an artifact's own timeline,
   * not about keeping every artifact forever.
   */
  deleteArtifact(id: ArtifactId): void {
    if (!this.artifacts.get(id)) throw notFound(`Artifact "${id}" not found.`);
    this.debouncer.cancel(id);
    this.artifacts.delete(id);
    this.hub.publish({ kind: 's.deleted', artifactId: id });
  }

  // ─── reads ───────────────────────────────────────────────────────────

  getArtifact(id: ArtifactId, version?: number): Artifact {
    if (version === undefined) {
      const artifact = this.artifacts.get(id);
      if (!artifact) throw notFound(`Artifact "${id}" not found.`);
      return artifact;
    }
    const snapshot = this.history.snapshotAt(id, version);
    if (!snapshot) throw notFound(`No committed snapshot at version ${version} for "${id}".`);
    if (snapshot.kind !== 'created' && snapshot.kind !== 'edited') {
      throw illegalState('snapshotAt returned a non-snapshot event; this is a bug.');
    }
    const current = this.artifacts.get(id);
    if (!current) throw notFound(`Artifact "${id}" not found.`);
    return { ...current, content: snapshot.snapshot, version: snapshot.version };
  }

  listArtifacts(filter?: { type?: string; limit?: number; offset?: number }): Artifact[] {
    return this.artifacts.list(filter);
  }

  searchArtifacts(query: string, limit?: number): Artifact[] {
    return this.artifacts.search(query, limit);
  }

  /**
   * Content-similarity stub for v1: re-runs a token-overlap query against
   * the FTS index using the target artifact's body as the query. Cheap and
   * good-enough; vector-backed similarity is the path forward per the spec.
   */
  findSimilar(id: ArtifactId, limit = 10): Artifact[] {
    const target = this.artifacts.get(id);
    if (!target) throw notFound(`Artifact "${id}" not found.`);
    const tokens = uniqueTokens(`${target.content.title} ${flattenStrings(target.content)}`);
    if (tokens.length === 0) return [];
    const query = tokens
      .slice(0, 8)
      .map((t) => `"${t}"`)
      .join(' OR ');
    return this.artifacts
      .search(query, limit + 1)
      .filter((a) => a.id !== id)
      .slice(0, limit);
  }

  getHistory(
    id: ArtifactId,
    range?: { from?: number; to?: number; limit?: number },
  ): HistoryEvent[] {
    if (!this.artifacts.get(id)) throw notFound(`Artifact "${id}" not found.`);
    return this.history.list(id, range);
  }

  // ─── comments ────────────────────────────────────────────────────────

  postComment(input: {
    artifactId: ArtifactId;
    anchor: CommentAnchor;
    payload: CommentPayload;
    author: Author;
    threadParentId?: CommentId;
  }): Comment {
    const artifact = this.artifacts.get(input.artifactId);
    if (!artifact) throw notFound(`Artifact "${input.artifactId}" not found.`);
    this.validateAnchor(artifact, input.anchor);

    const now = new Date().toISOString();
    const comment: Comment = {
      id: newCommentId(),
      artifactId: input.artifactId,
      anchor: input.anchor,
      author: input.author,
      payload: input.payload,
      ...(input.threadParentId ? { threadParentId: input.threadParentId } : {}),
      createdAt: now,
    };
    this.comments.insert(comment);

    const next = {
      ...artifact,
      contributors: addContributor(artifact.contributors, input.author, now),
    };
    this.artifacts.update(next);

    const event: HistoryEvent = {
      id: newHistoryEventId(),
      artifactId: input.artifactId,
      kind: 'commented',
      version: artifact.version,
      author: input.author,
      comment,
      createdAt: now,
    };
    this.history.append(event);

    this.hub.publish({ kind: 's.commented', artifactId: input.artifactId, comment });
    return comment;
  }

  listComments(artifactId: ArtifactId): Comment[] {
    if (!this.artifacts.get(artifactId)) throw notFound(`Artifact "${artifactId}" not found.`);
    return this.comments.listByArtifact(artifactId);
  }

  resolveComment(commentId: CommentId, resolved: boolean): void {
    const comment = this.comments.get(commentId);
    if (!comment) throw notFound(`Comment "${commentId}" not found.`);
    this.comments.setResolved(commentId, resolved);
    this.hub.publish({
      kind: 's.comment_resolved',
      artifactId: comment.artifactId,
      commentId,
      resolved,
    });
  }

  // ─── relations ───────────────────────────────────────────────────────

  addRelation(input: { from: ArtifactId; to: ArtifactId; type: RelationType }): Relation {
    if (!this.artifacts.get(input.from)) throw notFound(`Artifact "${input.from}" not found.`);
    if (!this.artifacts.get(input.to)) throw notFound(`Artifact "${input.to}" not found.`);
    if (input.from === input.to) throw validationFailed('Self-relations are not allowed.');
    if (!this.registry.relationType(input.type))
      throw unknownPlugin(`Unknown relation type "${input.type}".`);

    const now = new Date().toISOString();
    const relation: Relation = {
      id: newRelationId(),
      from: input.from,
      to: input.to,
      type: input.type,
      createdAt: now,
    };
    this.relations.insert(relation);

    this.hub.publish({ kind: 's.relation_added', artifactId: input.from, relation });
    return relation;
  }

  removeRelation(input: { from: ArtifactId; to: ArtifactId; type: RelationType }):
    | Relation
    | undefined {
    const removed = this.relations.remove(input.from, input.to, input.type);
    if (removed) {
      this.hub.publish({ kind: 's.relation_removed', artifactId: input.from, relation: removed });
    }
    return removed;
  }

  getRelations(id: ArtifactId): RelationGraph {
    if (!this.artifacts.get(id)) throw notFound(`Artifact "${id}" not found.`);
    return this.relations.forArtifact(id);
  }

  // ─── subscriptions ───────────────────────────────────────────────────

  subscribe(artifactId: ArtifactId, sink: SubscriberSink): SubscriptionId {
    // ALL_ARTIFACTS is the firehose target; every other id must exist.
    if (artifactId !== ALL_ARTIFACTS && !this.artifacts.get(artifactId)) {
      throw notFound(`Artifact "${artifactId}" not found.`);
    }
    return this.hub.subscribe(artifactId, sink);
  }

  unsubscribe(id: SubscriptionId): void {
    this.hub.unsubscribe(id);
  }

  // ─── shutdown ────────────────────────────────────────────────────────

  shutdown(): void {
    this.debouncer.flushAll();
  }

  // ─── internal ────────────────────────────────────────────────────────

  private validateAnchor(artifact: Artifact, anchor: CommentAnchor): void {
    if (anchor.kind === 'general') return;
    const target = artifact.content.components.find((c: Component) => c.id === anchor.componentId);
    if (!target) {
      throw validationFailed(
        `Comment anchor references component "${anchor.componentId}", which is not present on artifact "${artifact.id}".`,
      );
    }
  }
}

function authorToProvenance(author: Author) {
  if (author.kind === 'agent') return { sessionId: author.sessionId, agentId: author.agentId };
  // For human-originated artifacts we record a synthetic "human" provenance.
  return {
    sessionId: 'human-session' as never,
    agentId: 'human' as never,
  };
}

function addContributor<T extends { author: Author; firstTouchedAt: string }>(
  contributors: T[],
  author: Author,
  at: string,
): T[] {
  const exists = contributors.some(
    (c) =>
      c.author.kind === author.kind &&
      (author.kind === 'agent'
        ? c.author.kind === 'agent' && c.author.agentId === author.agentId
        : c.author.kind === 'human' && c.author.humanId === author.humanId),
  );
  if (exists) return contributors;
  return [...contributors, { author, firstTouchedAt: at } as T];
}

function flattenStrings(content: ArtifactContent): string {
  const out: string[] = [];
  const walk = (v: unknown): void => {
    if (typeof v === 'string') out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  for (const c of content.components) walk(c.data);
  return out.join(' ');
}

function uniqueTokens(s: string): string[] {
  const tokens = s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 4);
  return Array.from(new Set(tokens));
}
