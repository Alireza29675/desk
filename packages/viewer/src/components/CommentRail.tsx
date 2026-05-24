import { useState } from 'react';
import { api } from '../lib/api';
import { useStore } from '../state/store';
import type { ArtifactId, Author, Comment, CommentAnchor } from '@desk/types';

export function CommentRail() {
  const open = useStore((s) => s.open);
  const author = useStore((s) => s.author);
  const [draft, setDraft] = useState('');

  if (!open) return null;
  const artifactId = open.artifact.id;
  const { roots, repliesByParent } = buildThreads(open.comments);

  async function postGeneralComment() {
    if (!draft.trim() || !open) return;
    await api.comment(artifactId, {
      anchor: { kind: 'general' },
      payload: { kind: 'text', text: draft.trim() },
      author,
    });
    setDraft('');
  }

  return (
    <aside className="comment-rail">
      <header className="comment-rail__header">
        <span>Comments</span>
        <span className="comment-rail__count">{open.comments.length}</span>
      </header>
      <div className="comment-rail__list">
        {roots.length === 0 ? (
          <p className="comment-rail__empty">
            No comments yet. Leave a general note below, or reply to build a thread.
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
        <textarea
          className="comment-rail__textarea"
          placeholder="Leave a general comment…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void postGeneralComment();
            }
          }}
          rows={3}
        />
        <div className="comment-rail__composer-row">
          <span className="comment-rail__hint">⌘+Enter to post</span>
          <button className="btn btn--primary btn--sm" disabled={!draft.trim()} onClick={postGeneralComment}>
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
    <article className="comment" data-resolved={String(Boolean(comment.resolved))}>
      <header className="comment__head">
        <span className="comment__author" data-kind={comment.author.kind}>
          {who}
        </span>
        <span className="comment__when">{new Date(comment.createdAt).toLocaleTimeString()}</span>
      </header>
      {comment.anchor.kind !== 'general' ? (
        <div className="comment__anchor">{describeAnchor(comment.anchor)}</div>
      ) : null}
      {comment.payload.kind === 'text' ? <div className="comment__body">{comment.payload.text}</div> : null}

      <div className="comment__actions">
        <button className="comment__reply-btn" onClick={() => setReplying((v) => !v)}>
          {replying ? 'Cancel' : 'Reply'}
        </button>
      </div>

      {replying ? (
        <div className="comment__reply-composer">
          <textarea
            className="comment-rail__textarea"
            placeholder={`Reply to ${who}…`}
            value={text}
            autoFocus
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
            <button className="btn btn--primary btn--sm" disabled={!text.trim()} onClick={submitReply}>
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

function describeAnchor(anchor: CommentAnchor): string {
  switch (anchor.kind) {
    case 'element':
      return `on ${anchor.componentId}${anchor.elementPath ? `.${anchor.elementPath}` : ''}`;
    case 'text-selection':
      return `text in ${anchor.componentId} [${anchor.start}-${anchor.end}]`;
    case 'region':
      return `region in ${anchor.componentId}`;
    case 'point':
      return `point in ${anchor.componentId}`;
    case 'general':
      return 'general';
  }
}
