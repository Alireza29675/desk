import type { ReactNode } from 'react';
import type { ComponentId } from '@desk/types';
import { useStore } from '../state/store';

/**
 * Wraps a rendered component so the operator can comment on it directly.
 * Hovering reveals a "Comment" affordance; clicking it sets a pending
 * element-anchored comment target in the store, which the comment rail's
 * composer then posts against. This is the semantic-anchoring pillar made
 * tangible: the comment targets the component's id, never a pixel.
 *
 * It also carries `data-component-id`, so deep links (`#component:<id>`) still
 * resolve to this element.
 */
export function Commentable({
  componentId,
  className,
  children,
}: {
  componentId: string;
  className?: string;
  children: ReactNode;
}) {
  const startComment = useStore((s) => s.startComment);
  const target = useStore((s) => s.commentTarget);
  const isTarget = target !== null && 'componentId' in target && target.componentId === componentId;

  return (
    <div
      className={['commentable', className].filter(Boolean).join(' ')}
      data-component-id={componentId}
      data-comment-target={isTarget ? 'true' : undefined}
    >
      {children}
      <button
        className="commentable__btn"
        title="Comment on this"
        onClick={() => startComment({ kind: 'element', componentId: componentId as ComponentId })}
      >
        Comment
      </button>
    </div>
  );
}
