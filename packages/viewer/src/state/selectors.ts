import type { Comment } from '@desk/types';
import { useMemo } from 'react';
import { useStore } from './store';

/**
 * Unresolved ROOT comments anchored to a component, in any spatial anchor
 * kind. Replies are excluded — they inherit their parent's resolution for
 * display, so the consumer renders the root and lets the thread follow.
 */
export function unresolvedByComponent(comments: Comment[], componentId: string): Comment[] {
  return comments.filter(
    (c) =>
      !c.resolved &&
      !c.threadParentId &&
      c.anchor.kind !== 'general' &&
      c.anchor.componentId === componentId,
  );
}

/** Hook form over the open artifact's comments, memoized per comments/component. */
export function useUnresolvedByComponent(componentId: string): Comment[] {
  const comments = useStore((s) => s.open?.comments);
  return useMemo(() => unresolvedByComponent(comments ?? [], componentId), [comments, componentId]);
}
