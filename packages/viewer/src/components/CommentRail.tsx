import { useState } from 'react';
import { api } from '../lib/api';
import { useStore } from '../state/store';
import type { Comment, CommentAnchor } from '@desk/types';

export function CommentRail() {
  const open = useStore((s) => s.open);
  const author = useStore((s) => s.author);
  const [draft, setDraft] = useState('');

  if (!open) return null;
  const comments = open.comments;

  async function postGeneralComment() {
    if (!draft.trim() || !open) return;
    const anchor: CommentAnchor = { kind: 'general' };
    await api.comment(open.artifact.id, {
      anchor,
      payload: { kind: 'text', text: draft.trim() },
      author,
    });
    setDraft('');
  }

  return (
    <aside className="comment-rail">
      <header className="comment-rail__header">
        <span>Comments</span>
        <span className="comment-rail__count">{comments.length}</span>
      </header>
      <div className="comment-rail__list">
        {comments.length === 0 ? (
          <p className="comment-rail__empty">
            No comments yet. Anchor a comment to an element by clicking it in the artifact, or leave a general note below.
          </p>
        ) : (
          comments.map((c) => <CommentCard key={c.id} comment={c} />)
        )}
      </div>
      <div className="comment-rail__composer">
        <textarea
          className="comment-rail__textarea"
          placeholder="Leave a general comment…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
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

function CommentCard({ comment }: { comment: Comment }) {
  return (
    <article className="comment" data-resolved={String(Boolean(comment.resolved))}>
      <header className="comment__head">
        <span className="comment__author">
          {comment.author.kind === 'human' ? comment.author.humanId : comment.author.agentId}
        </span>
        <span className="comment__when">{new Date(comment.createdAt).toLocaleTimeString()}</span>
      </header>
      <div className="comment__anchor">{describeAnchor(comment.anchor)}</div>
      {comment.payload.kind === 'text' ? <div className="comment__body">{comment.payload.text}</div> : null}
    </article>
  );
}

function describeAnchor(anchor: CommentAnchor): string {
  switch (anchor.kind) {
    case 'element':
      return `on ${anchor.componentId}${anchor.elementPath ? '.' + anchor.elementPath : ''}`;
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
