import { z } from 'zod';
import type { ComponentId } from './ids';

/**
 * A component is the typed primitive inside an artifact's content. The
 * envelope is generic — only the plugin registered for `type` knows the
 * shape of `data`. Components are addressable by `id`; semantic anchoring
 * for comments and interactions targets components (and their named
 * sub-elements), never pixel coordinates.
 */
export interface Component<TData = unknown> {
  /** Stable identifier within the artifact. Used as the anchor for comments. */
  id: ComponentId;
  /** Plugin-registered component type, e.g. 'diagram', 'chart', 'callout'. */
  type: string;
  /** Plugin-defined typed payload. Schema is owned by the component plugin. */
  data: TData;
}

export const ComponentSchema: z.ZodType<Component> = z.object({
  id: z.string().min(1) as unknown as z.ZodType<ComponentId>,
  type: z.string().min(1),
  data: z.unknown(),
}) as unknown as z.ZodType<Component>;
