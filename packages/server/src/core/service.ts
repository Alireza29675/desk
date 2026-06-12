import type { Database } from 'bun:sqlite';
import type { PluginRegistry } from '@desk/plugin-sdk';
import type {
  Artifact,
  ArtifactContent,
  ArtifactId,
  ArtifactPatch,
  AttachmentId,
  Author,
  Comment,
  CommentAnchor,
  CommentAttachment,
  CommentAttachmentInput,
  CommentId,
  CommentPayload,
  Component,
  HistoryEvent,
  Relation,
  RelationGraph,
  RelationType,
  SubscriptionId,
} from '@desk/types';
import {
  newArtifactId,
  newAttachmentId,
  newCommentId,
  newHistoryEventId,
  newRelationId,
} from '../ids';
import { ArtifactRepository } from '../storage/artifacts';
import { AttachmentRepository } from '../storage/attachments';
import { CommentRepository } from '../storage/comments';
import { HistoryRepository } from '../storage/history';
import { RelationRepository } from '../storage/relations';
import { ALL_ARTIFACTS, type RealtimeHub, type SubscriberSink } from '../ws/hub';
import { CommitDebouncer } from './commit-debouncer';
import { compileCustomReact, validateCustomReactCode } from './custom-react';
import { illegalState, notFound, unknownPlugin, validationFailed } from './errors';
import { decodePngDataUrl } from './png';

export interface DeskServiceOptions {
  db: Database;
  registry: PluginRegistry;
  hub: RealtimeHub;
  autoCommitMs: number;
}

/** A comment anchors to at most this many selections (UI enforces the same). */
export const MAX_ANCHORS = 8;

/** A comment carries at most this many images (one per spatial anchor). */
export const MAX_ATTACHMENTS_PER_COMMENT = MAX_ANCHORS;

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
  readonly attachments: AttachmentRepository;
  readonly relations: RelationRepository;
  readonly hub: RealtimeHub;
  readonly registry: PluginRegistry;
  private readonly debouncer: CommitDebouncer;

  constructor(opts: DeskServiceOptions) {
    this.artifacts = new ArtifactRepository(opts.db);
    this.history = new HistoryRepository(opts.db);
    this.comments = new CommentRepository(opts.db);
    this.attachments = new AttachmentRepository(opts.db);
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
    validateServerSide(content);

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
    validateServerSide(nextContent);

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
    // A trusted FTS OR-expression over the artifact's own tokens — passed to
    // searchExpr (raw), NOT search (which sanitizes user input and would quote
    // the OR operator into a literal, matching nothing).
    const query = tokens
      .slice(0, 8)
      .map((t) => `"${t.replace(/"/g, '')}"`)
      .join(' OR ');
    return this.artifacts
      .searchExpr(query, limit + 1)
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

  /**
   * The AI-authored baseline of a checklist component: each item's `checked`
   * at its FIRST appearance in the artifact's committed snapshots, in version
   * order. "Last agent-authored snapshot" would be wrong here — agents commit
   * the FULL working content, so a later agent edit carries the human's
   * checks along with it; first-appearance is the value the item's author
   * gave it. Works retroactively for every existing artifact (`created`
   * always snapshots v1 — no migration). Items with no committed appearance
   * (added but never committed yet) fall back to their current value.
   */
  checklistBaseline(
    artifactId: ArtifactId,
    componentId: string,
  ): { items: Record<string, boolean> } {
    const artifact = this.artifacts.get(artifactId);
    if (!artifact) throw notFound(`Artifact "${artifactId}" not found.`);
    const component = artifact.content.components.find((c: Component) => c.id === componentId);
    if (!component) {
      throw notFound(`Component "${componentId}" is not present on artifact "${artifactId}".`);
    }
    if (component.type !== 'checkbox') {
      throw validationFailed(`Component "${componentId}" is not a checklist.`);
    }

    const firstSeen: Record<string, boolean> = {};
    for (const event of this.history.snapshots(artifactId)) {
      if (event.kind !== 'created' && event.kind !== 'edited') continue;
      const past = event.snapshot.components.find(
        (c: Component) => c.id === componentId && c.type === 'checkbox',
      );
      if (!past) continue;
      for (const item of checklistItems(past)) {
        if (!(item.id in firstSeen)) firstSeen[item.id] = item.checked;
      }
    }

    // Project onto the CURRENT items only: deleted items drop out, and a
    // never-committed item's current value IS its authored value.
    const items: Record<string, boolean> = {};
    for (const item of checklistItems(component)) {
      items[item.id] = firstSeen[item.id] ?? item.checked;
    }
    return { items };
  }

  // ─── comments ────────────────────────────────────────────────────────

  postComment(input: {
    artifactId: ArtifactId;
    anchors: CommentAnchor[];
    payload: CommentPayload;
    author: Author;
    threadParentId?: CommentId;
    attachments?: CommentAttachmentInput[];
  }): Comment {
    const artifact = this.artifacts.get(input.artifactId);
    if (!artifact) throw notFound(`Artifact "${input.artifactId}" not found.`);
    this.validateAnchors(artifact, input.anchors);
    if (input.attachments && input.attachments.length > MAX_ATTACHMENTS_PER_COMMENT) {
      throw validationFailed(
        `A comment carries at most ${MAX_ATTACHMENTS_PER_COMMENT} attachments.`,
      );
    }
    // Each image must name a real, distinct selection so delivery can pair them
    // one-to-one. A single-anchor post may omit anchorIndex; it defaults to 0.
    const seenIndexes = new Set<number>();
    for (const a of input.attachments ?? []) {
      const idx = a.anchorIndex ?? 0;
      if (idx < 0 || idx >= input.anchors.length) {
        throw validationFailed(
          `Attachment anchorIndex ${idx} is out of range for ${input.anchors.length} anchor(s).`,
        );
      }
      if (seenIndexes.has(idx)) {
        throw validationFailed(
          `Two attachments target the same selection (anchorIndex ${idx}); each selection carries at most one image.`,
        );
      }
      seenIndexes.add(idx);
    }
    // Decode-and-validate EVERY attachment before any row is written, so a
    // bad image can never leave a comment stored without it.
    const decoded = (input.attachments ?? []).map((a) => ({
      ...decodePngDataUrl(a.dataUrl),
      anchorIndex: a.anchorIndex ?? 0,
    }));

    const now = new Date().toISOString();
    const attachmentMeta: CommentAttachment[] = decoded.map((d) => ({
      id: newAttachmentId(),
      kind: 'image',
      mediaType: 'image/png',
      width: d.width,
      height: d.height,
      anchorIndex: d.anchorIndex,
    }));
    const comment: Comment = {
      id: newCommentId(),
      artifactId: input.artifactId,
      anchors: input.anchors,
      anchor: input.anchors[0]!, // transitional primary (validated non-empty)
      author: input.author,
      payload: input.payload,
      ...(input.threadParentId ? { threadParentId: input.threadParentId } : {}),
      ...(attachmentMeta.length > 0 ? { attachments: attachmentMeta } : {}),
      createdAt: now,
    };
    this.comments.insert(comment);
    decoded.forEach((d, i) => {
      const meta = attachmentMeta[i];
      if (!meta) return;
      this.attachments.insert({
        id: meta.id,
        commentId: comment.id,
        mediaType: meta.mediaType,
        width: d.width,
        height: d.height,
        anchorIndex: d.anchorIndex,
        bytes: d.bytes,
        createdAt: now,
      });
    });

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
    // Hydrate envelope metadata; bytes stay behind GET /api/attachments/:id.
    return this.comments.listByArtifact(artifactId).map((c) => {
      const attachments = this.attachments.listMetaByComment(c.id);
      return attachments.length > 0 ? { ...c, attachments } : c;
    });
  }

  getAttachment(id: AttachmentId): { mediaType: string; bytes: Uint8Array } {
    const attachment = this.attachments.get(id);
    if (!attachment) throw notFound(`Attachment "${id}" not found.`);
    return attachment;
  }

  /**
   * Compiled JS for a `custom-react` component — what the viewer's sandbox
   * harness executes. Source stays canonical in the artifact; compilation is
   * cached by content hash.
   */
  async compiledComponent(artifactId: ArtifactId, componentId: string): Promise<string> {
    const artifact = this.artifacts.get(artifactId);
    if (!artifact) throw notFound(`Artifact "${artifactId}" not found.`);
    const component = artifact.content.components.find((c: Component) => c.id === componentId);
    if (!component) {
      throw notFound(`Component "${componentId}" is not present on artifact "${artifactId}".`);
    }
    if (component.type !== 'custom-react') {
      throw validationFailed(`Component "${componentId}" is not a custom-react component.`);
    }
    return compileCustomReact((component.data as { code: string }).code);
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

  private validateAnchors(artifact: Artifact, anchors: CommentAnchor[]): void {
    if (anchors.length === 0) {
      throw validationFailed('A comment must anchor to at least one selection.');
    }
    if (anchors.length > MAX_ANCHORS) {
      throw validationFailed(`A comment anchors to at most ${MAX_ANCHORS} selections.`);
    }
    // `general` is a document-level, untethered anchor — it is exclusive: a
    // comment is EITHER document-level or one-or-more tethered selections,
    // never a mix.
    const hasGeneral = anchors.some((a) => a.kind === 'general');
    if (hasGeneral && anchors.length > 1) {
      throw validationFailed(
        'A document-level (general) comment cannot be combined with other selections.',
      );
    }
    for (const anchor of anchors) {
      if (anchor.kind === 'general') continue;
      const target = artifact.content.components.find(
        (c: Component) => c.id === anchor.componentId,
      );
      if (!target) {
        throw validationFailed(
          `Comment anchor references component "${anchor.componentId}", which is not present on artifact "${artifact.id}".`,
        );
      }
    }
  }
}

/**
 * Server-only validation passes that plugin schemas (which must stay
 * browser-safe — the viewer imports them too) cannot express. Add a case
 * here when a component type needs write-time checks beyond its Zod shape.
 */
function validateServerSide(content: ArtifactContent): void {
  for (const component of content.components) {
    if (component.type === 'custom-react') validateCustomReactCode(component.data);
  }
}

function checklistItems(component: Component): { id: string; checked: boolean }[] {
  const data = component.data as { items?: { id: string; checked: boolean }[] };
  return Array.isArray(data.items) ? data.items : [];
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
