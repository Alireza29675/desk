import {
  type ArtifactId,
  type Author,
  type Comment,
  type CommentAnchor,
  type CommentAttachment,
  commentAnchors,
} from '@desk/types';
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { submitComment } from '../lib/submit-comment';
import { useStore } from '../state/store';
import { RelationsSection } from './RelationsSection';

export function CommentRail() {
  const open = useStore((s) => s.open);
  const author = useStore((s) => s.author);
  const draftAnchors = useStore((s) => s.draftAnchors);
  const draftBody = useStore((s) => s.draftBody);
  const setDraftBody = useStore((s) => s.setDraftBody);
  const removeDraftAnchor = useStore((s) => s.removeDraftAnchor);
  const armComment = useStore((s) => s.armComment);
  const clearDraft = useStore((s) => s.clearDraft);
  // The one open attachment lightbox (at most one at a time, across all cards).
  const [lightbox, setLightbox] = useState<CommentAttachment | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  // Guards post() against a double ⌘-Enter while the capture+POST await runs.
  const submitting = useRef(false);
  const anchorCount = draftAnchors.length;

  // Each new selection added to the draft pulls focus to the composer so the
  // operator can keep typing without reaching for the textarea.
  useEffect(() => {
    if (anchorCount > 0) textareaRef.current?.focus();
  }, [anchorCount]);

  // An unresolved dot on the artifact was clicked: scroll its rail row into
  // view and flash it. The store auto-clears `railTarget` after ~1.6s (same
  // pattern as focusAnchor), which removes the flash attribute via cleanup so
  // a repeat reveal can re-run the one-shot animation.
  const railTarget = useStore((s) => s.railTarget);
  useEffect(() => {
    if (!railTarget) return;
    const row = document.querySelector(
      `.comment-rail [data-comment-id="${railTarget.replace(/["\\]/g, '\\$&')}"]`,
    );
    if (!(row instanceof HTMLElement)) return;
    row.scrollIntoView({ block: 'nearest', behavior: scrollBehavior() });
    row.setAttribute('data-rail-flash', 'true');
    return () => row.removeAttribute('data-rail-flash');
  }, [railTarget]);

  if (!open) return null;
  const artifactId = open.artifact.id;
  const { roots, repliesByParent } = buildThreads(open.comments);

  async function post() {
    const body = draftBody.trim();
    if (!body || !open || submitting.current) return;
    submitting.current = true;
    // No selections → a general (document-level) comment, modeled as a single
    // `general` anchor so the server's ≥1 invariant holds. submitComment does
    // the per-anchor capture + POST internally.
    const anchors: CommentAnchor[] = draftAnchors.length > 0 ? draftAnchors : [{ kind: 'general' }];
    try {
      await submitComment({ body, anchors });
      clearDraft();
    } finally {
      submitting.current = false;
    }
  }

  return (
    <aside className="comment-rail">
      <header className="comment-rail__header">
        <span>Comments</span>
        <span className="comment-rail__count">{open.comments.length}</span>
      </header>
      <RelationsSection relations={open.relations} />
      <div className="comment-rail__list">
        {roots.length === 0 ? (
          <p className="comment-rail__empty">
            No comments yet. Press <kbd>C</kbd> (or the comment button) to mark a point, region, or
            text — or just leave a general note below.
          </p>
        ) : (
          roots.map((c) => (
            <CommentThread
              key={c.id}
              comment={c}
              repliesByParent={repliesByParent}
              artifactId={artifactId}
              author={author}
              onOpenAttachment={setLightbox}
            />
          ))
        )}
      </div>
      <div className="comment-rail__composer">
        {anchorCount > 0 ? (
          <div className="comment-rail__chips">
            {draftAnchors.map((a, i) => (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: draft anchors are a small, append-only set
                key={i}
                className="comment-chip"
              >
                <span className="comment-chip__label">{chipLabel(a)}</span>
                <button
                  type="button"
                  className="comment-chip__remove"
                  aria-label={`Remove ${chipLabel(a)} selection`}
                  onClick={() => removeDraftAnchor(i)}
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        ) : null}
        <textarea
          ref={textareaRef}
          className="comment-rail__textarea"
          placeholder={
            anchorCount > 0 ? 'Comment on the selections above…' : 'Leave a general comment…'
          }
          value={draftBody}
          onChange={(e) => setDraftBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void post();
            }
            // Escape cancels the whole draft (selections + text).
            if (e.key === 'Escape' && (anchorCount > 0 || draftBody)) {
              e.preventDefault();
              clearDraft();
            }
          }}
          rows={3}
        />
        <div className="comment-rail__composer-row">
          <button
            type="button"
            className="comment-rail__addmore"
            onClick={armComment}
            title="Pick another point, region, or text to add to this comment"
          >
            + Add selection
          </button>
          <div className="comment-rail__composer-actions">
            <span className="comment-rail__hint">⌘+Enter to post</span>
            <button
              className="btn btn--primary btn--sm"
              disabled={!draftBody.trim()}
              onClick={post}
            >
              Post
            </button>
          </div>
        </div>
      </div>
      {lightbox ? (
        <AttachmentLightbox attachment={lightbox} onClose={() => setLightbox(null)} />
      ) : null}
    </aside>
  );
}

/**
 * Full-size view of a comment attachment. Click anywhere or Escape closes.
 * Stays inside the rail's tree so the print hide rule on .comment-rail also
 * keeps it off paper.
 */
function AttachmentLightbox({
  attachment,
  onClose,
}: {
  attachment: CommentAttachment;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    // Move focus into the dialog on open and hand it back to whatever held it
    // when the lightbox closes, so keyboard users aren't dropped at the page top.
    const restoreTo = document.activeElement;
    dialogRef.current?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        // Capture phase + preventDefault: the lightbox is the topmost surface,
        // so this press must not also close a drawer (App checks
        // defaultPrevented) — same pattern as the topbar overflow menu.
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true });
      if (restoreTo instanceof HTMLElement) restoreTo.focus();
    };
  }, [onClose]);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: Escape (window, capture) is the keyboard close path
    <div
      ref={dialogRef}
      className="comment-lightbox"
      // biome-ignore lint/a11y/useSemanticElements: a native dialog needs showModal lifecycle; a role-dialog overlay is simpler here
      role="dialog"
      aria-modal="true"
      aria-label="Attachment preview"
      tabIndex={-1}
      onClick={onClose}
    >
      <img
        className="comment-lightbox__image"
        src={api.attachmentUrl(attachment.id)}
        width={attachment.width}
        height={attachment.height}
        alt="comment attachment"
      />
    </div>
  );
}

/**
 * A comment and its nested replies, rendered recursively. Replies inherit the
 * parent's anchor so a thread stays attached to the same artifact element.
 */
function CommentThread({
  comment,
  repliesByParent,
  artifactId,
  author,
  onOpenAttachment,
}: {
  comment: Comment;
  repliesByParent: Map<string, Comment[]>;
  artifactId: ArtifactId;
  author: Author;
  onOpenAttachment: (attachment: CommentAttachment) => void;
}) {
  const replies = repliesByParent.get(comment.id) ?? [];
  return (
    <div className="comment-thread">
      <CommentCard
        comment={comment}
        artifactId={artifactId}
        author={author}
        onOpenAttachment={onOpenAttachment}
      />
      {replies.length > 0 ? (
        <div className="comment-thread__replies">
          {replies.map((r) => (
            <CommentThread
              key={r.id}
              comment={r}
              repliesByParent={repliesByParent}
              artifactId={artifactId}
              author={author}
              onOpenAttachment={onOpenAttachment}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CommentCard({
  comment,
  artifactId,
  author,
  onOpenAttachment,
}: {
  comment: Comment;
  artifactId: ArtifactId;
  author: Author;
  onOpenAttachment: (attachment: CommentAttachment) => void;
}) {
  const [replying, setReplying] = useState(false);
  const [text, setText] = useState('');
  const focusAnchor = useStore((s) => s.focusAnchor);

  async function submitReply() {
    if (!text.trim()) return;
    // A reply inherits its parent's primary anchor so the thread stays in
    // context. commentAnchors() is always ≥1; the `comment.anchor` default
    // only satisfies the type checker (it equals anchors[0] by the dual-write
    // contract) and is never taken at runtime.
    const [primaryAnchor = comment.anchor] = commentAnchors(comment);
    await api.comment(artifactId, {
      anchor: primaryAnchor,
      payload: { kind: 'text', text: text.trim() },
      author,
      threadParentId: comment.id,
    });
    setText('');
    setReplying(false);
  }

  const who = comment.author.kind === 'human' ? comment.author.humanId : comment.author.agentId;
  // One chip per spatial anchor — a multi-select comment reveals each selection
  // it covers; `general` anchors have no place to point and stay chip-less.
  const anchorChips = commentAnchors(comment).filter((a) => a.kind !== 'general');

  return (
    <article
      className="comment"
      data-comment-id={comment.id}
      data-resolved={String(Boolean(comment.resolved))}
    >
      <header className="comment__head">
        <span className="comment__author" data-kind={comment.author.kind}>
          {who}
        </span>
        <span className="comment__when">
          {comment.resolved ? <span className="comment__resolved-tag">✓ resolved</span> : null}
          {new Date(comment.createdAt).toLocaleTimeString()}
        </span>
      </header>
      {anchorChips.length > 0 ? (
        <div className="comment__anchors">
          {anchorChips.map((anchor, ai) => (
            <button
              // biome-ignore lint/suspicious/noArrayIndexKey: a comment's anchors are a small, never-reordered set
              key={ai}
              className="comment__anchor"
              title="Reveal where this is anchored"
              onClick={() => {
                focusAnchor(anchor);
                const cid = 'componentId' in anchor ? anchor.componentId : null;
                if (cid) {
                  document
                    .querySelector(`[data-component-id="${cid.replace(/["\\]/g, '\\$&')}"]`)
                    ?.scrollIntoView({ behavior: scrollBehavior(), block: 'center' });
                }
              }}
            >
              ⌖ {describeAnchor(anchor)}
            </button>
          ))}
        </div>
      ) : null}
      {comment.payload.kind === 'text' ? (
        <div className="comment__body">{comment.payload.text}</div>
      ) : null}
      {comment.attachments && comment.attachments.length > 0 ? (
        <div className="comment__attachments">
          {comment.attachments.map((a) => (
            <button
              key={a.id}
              type="button"
              className="comment__attachment"
              onClick={() => onOpenAttachment(a)}
              aria-label="View attachment full size"
            >
              {/* The width/height attributes carry the intrinsic size so CSS
                  can derive the aspect ratio before the bytes arrive. */}
              <img
                className="comment__attachment-thumb"
                src={api.attachmentUrl(a.id)}
                width={a.width}
                height={a.height}
                loading="lazy"
                alt="comment attachment"
              />
            </button>
          ))}
        </div>
      ) : null}

      <div className="comment__actions">
        <button className="comment__reply-btn" onClick={() => setReplying((v) => !v)}>
          {replying ? 'Cancel' : 'Reply'}
        </button>
        <button
          className="comment__reply-btn"
          title={comment.resolved ? 'Reopen this comment' : 'Mark this comment resolved'}
          onClick={() => void api.resolveComment(comment.id, !comment.resolved)}
        >
          {comment.resolved ? 'Reopen' : 'Resolve'}
        </button>
      </div>

      {replying ? (
        <div className="comment__reply-composer">
          <textarea
            className="comment-rail__textarea"
            placeholder={`Reply to ${who}…`}
            value={text}
            rows={2}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void submitReply();
              }
              if (e.key === 'Escape') setReplying(false);
            }}
          />
          <div className="comment-rail__composer-row">
            <span className="comment-rail__hint">⌘+Enter to reply · Esc to cancel</span>
            <button
              className="btn btn--primary btn--sm"
              disabled={!text.trim()}
              onClick={submitReply}
            >
              Reply
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}

/**
 * Group a flat comment list into threads. A comment with no (resolvable)
 * thread parent is a root; replies are bucketed under their parent id. A
 * reply whose parent isn't present is promoted to a root so it never vanishes.
 */
function buildThreads(comments: Comment[]): {
  roots: Comment[];
  repliesByParent: Map<string, Comment[]>;
} {
  const ids = new Set(comments.map((c) => c.id));
  const roots: Comment[] = [];
  const repliesByParent = new Map<string, Comment[]>();

  for (const c of comments) {
    if (c.threadParentId && ids.has(c.threadParentId)) {
      const arr = repliesByParent.get(c.threadParentId) ?? [];
      arr.push(c);
      repliesByParent.set(c.threadParentId, arr);
    } else {
      roots.push(c);
    }
  }
  return { roots, repliesByParent };
}

/** 'auto' when the OS asks for reduced motion, else 'smooth' — so JS-driven
 *  scrollIntoView honors the same preference the CSS motion budget respects. */
function scrollBehavior(): ScrollBehavior {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}

/** Short, glyph-led label for a draft selection chip in the composer. */
function chipLabel(anchor: CommentAnchor): string {
  switch (anchor.kind) {
    case 'point':
      return '⌖ Point';
    case 'region':
      return '▭ Region';
    case 'text-selection':
      return '❝ Text';
    case 'element':
      return '◳ Element';
    case 'general':
      return 'General';
  }
}

/** Concise label for an anchor (no leading verb, so callers supply context). */
function describeAnchor(anchor: CommentAnchor): string {
  switch (anchor.kind) {
    case 'element':
      return `${anchor.componentId}${anchor.elementPath ? ` · ${anchor.elementPath}` : ''}`;
    case 'text-selection':
      return `${anchor.componentId} · text ${anchor.start}–${anchor.end}`;
    case 'region':
      return `${anchor.componentId} · region`;
    case 'point':
      return `${anchor.componentId} · point`;
    case 'general':
      return 'general';
  }
}
