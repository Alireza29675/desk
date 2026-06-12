import { type Comment, commentAnchors } from '@desk/types';
import { useMemo } from 'react';
import { useStore } from './store';

/**
 * Unresolved ROOT comments with at least one anchor on a component. A
 * multi-anchor comment that targets this component in ANY of its anchors
 * counts (it shows a dot per anchor that lands here). Replies are excluded —
 * they inherit their parent's resolution for display, so the consumer renders
 * the root and lets the thread follow.
 */
export function unresolvedByComponent(comments: Comment[], componentId: string): Comment[] {
  return comments.filter(
    (c) =>
      !c.resolved &&
      !c.threadParentId &&
      commentAnchors(c).some((a) => 'componentId' in a && a.componentId === componentId),
  );
}

/** Hook form over the open artifact's comments, memoized per comments/component. */
export function useUnresolvedByComponent(componentId: string): Comment[] {
  const comments = useStore((s) => s.open?.comments);
  return useMemo(() => unresolvedByComponent(comments ?? [], componentId), [comments, componentId]);
}
