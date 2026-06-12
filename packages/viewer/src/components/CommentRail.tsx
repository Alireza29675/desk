import type { ArtifactId, Author, Comment, CommentAnchor } from '@desk/types';
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { captureAnchorImage } from '../lib/capture-anchor';
import { useStore } from '../state/store';
import { RelationsSection } from './RelationsSection';

export function CommentRail() {
  const open = useStore((s) => s.open);
  const author = useStore((s) => s.author);
  const commentTarget = useStore((s) => s.commentTarget);
  const commentDraft = useStore((s) => s.commentDraft);
  const clearCommentTarget = useStore((s) => s.clearCommentTarget);
  const [draft, setDraft] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // When the user targets a component, focus the composer so they can type.
  useEffect(() => {
    if (commentTarget) textareaRef.current?.focus();
  }, [commentTarget]);

  // Seed the composer from the store's draft slot (checkbox toggles etc.).
  // Single slot, last-write-wins: a newer auto-draft replaces the text.
  useEffect(() => {
    if (commentDraft !== null) setDraft(commentDraft);
  }, [commentDraft]);

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
    row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    row.setAttribute('data-rail-flash', 'true');
    return () => row.removeAttribute('data-rail-flash');
  }, [railTarget]);

  if (!open) return null;
  const artifactId = open.artifact.id;
  const { roots, repliesByParent } = buildThreads(open.comments);

  async function post() {
    if (!draft.trim() || !open) return;
    const anchor = commentTarget ?? ({ kind: 'general' } as CommentAnchor);
    // Point/region anchors ride with a capture of what the operator sees
    // (their theme, viewport, live state). Best-effort: a failed capture
    // still posts the comment and the channel falls back to its own render.
    const shot = await captureAnchorImage(anchor);
    await api.comment(artifactId, {
      anchor,
      payload: { kind: 'text', text: draft.trim() },
      author,
      ...(shot ? { attachments: [{ kind: 'image', dataUrl: shot.dataUrl }] } : {}),
    });
    setDraft('');
    clearCommentTarget();
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
            No comments yet. Hover any element and click “Comment” to anchor one, or leave a general
            note below.
          </p>
        ) : (
          roots.map((c) => (
            <CommentThread
              key={c.id}
              comment={c}
              repliesByParent={repliesByParent}
              artifactId={artifactId}
              author={author}
            />
          ))
        )}
      </div>
      <div className="comment-rail__composer">
        {commentTarget && commentTarget.kind !== 'general' ? (
          <div className="comment-rail__target">
            <span>
              Commenting on <code>{describeAnchor(commentTarget)}</code>
            </span>
            <button
              className="comment-rail__target-clear"
              onClick={clearCommentTarget}
              title="Make it a general comment"
            >
              ✕
            </button>
          </div>
        ) : null}
        <textarea
          ref={textareaRef}
          className="comment-rail__textarea"
          placeholder={
            commentTarget && commentTarget.kind !== 'general'
              ? `Comment on this ${commentTarget.kind === 'text-selection' ? 'selection' : commentTarget.kind}…`
              : 'Leave a general comment…'
          }
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void post();
            }
            if (e.key === 'Escape' && commentTarget) {
              // Dismissing an UNEDITED auto-draft clears it (the slot's
              // send-or-dismiss semantic); hand-typed text survives an
              // anchor dismiss, as before.
              if (commentDraft !== null && draft === commentDraft) setDraft('');
              clearCommentTarget();
            }
          }}
          rows={3}
        />
        <div className="comment-rail__composer-row">
          <span className="comment-rail__hint">⌘+Enter to post</span>
          <button className="btn btn--primary btn--sm" disabled={!draft.trim()} onClick={post}>
            Post
          </button>
        </div>
      </div>
    </aside>
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
}: {
  comment: Comment;
  repliesByParent: Map<string, Comment[]>;
  artifactId: ArtifactId;
  author: Author;
}) {
  const replies = repliesByParent.get(comment.id) ?? [];
  return (
    <div className="comment-thread">
      <CommentCard comment={comment} artifactId={artifactId} author={author} />
      {replies.length > 0 ? (
        <div className="comment-thread__replies">
          {replies.map((r) => (
            <CommentThread
              key={r.id}
              comment={r}
              repliesByParent={repliesByParent}
              artifactId={artifactId}
              author={author}
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
}: {
  comment: Comment;
  artifactId: ArtifactId;
  author: Author;
}) {
  const [replying, setReplying] = useState(false);
  const [text, setText] = useState('');
  const focusAnchor = useStore((s) => s.focusAnchor);

  async function submitReply() {
    if (!text.trim()) return;
    await api.comment(artifactId, {
      anchor: comment.anchor, // inherit the parent's anchor so the thread stays in context
      payload: { kind: 'text', text: text.trim() },
      author,
      threadParentId: comment.id,
    });
    setText('');
    setReplying(false);
  }

  const who = comment.author.kind === 'human' ? comment.author.humanId : comment.author.agentId;

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
      {comment.anchor.kind !== 'general' ? (
        <button
          className="comment__anchor"
          title="Reveal where this is anchored"
          onClick={() => {
            focusAnchor(comment.anchor);
            const cid = 'componentId' in comment.anchor ? comment.anchor.componentId : null;
            if (cid) {
              document
                .querySelector(`[data-component-id="${cid.replace(/["\\]/g, '\\$&')}"]`)
                ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }}
        >
          ⌖ {describeAnchor(comment.anchor)}
        </button>
      ) : null}
      {comment.payload.kind === 'text' ? (
        <div className="comment__body">{comment.payload.text}</div>
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
