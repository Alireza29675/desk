import type { CommentAnchor, ComponentId } from '@desk/types';

export interface ToggleDraft {
  text: string;
  anchor: CommentAnchor;
}

/**
 * The auto-draft a checkbox toggle seeds into the comment composer, so the
 * model sees what got checked once the human sends it. Single slot,
 * last-write-wins: consecutive toggles on the SAME checklist coalesce into
 * one draft ("Checked: A · Unchecked: B") and the anchor widens from the
 * item to the whole component; a toggle on a different checklist starts a
 * fresh item-anchored draft.
 */
export function draftAfterToggle(
  prev: { text: string; componentId: string } | null,
  toggle: { componentId: ComponentId; itemId: string; label: string; checked: boolean },
): ToggleDraft {
  const part = `${toggle.checked ? 'Checked' : 'Unchecked'}: ${toggle.label}`;
  if (prev && prev.componentId === toggle.componentId) {
    return {
      text: `${prev.text} · ${part}`,
      anchor: { kind: 'element', componentId: toggle.componentId },
    };
  }
  return {
    text: part,
    anchor: {
      kind: 'element',
      componentId: toggle.componentId,
      elementPath: `items.${toggle.itemId}`,
    },
  };
}
