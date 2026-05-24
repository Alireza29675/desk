import { z } from 'zod';
import type { AgentId, SessionId } from './ids';

export type Author =
  | { kind: 'agent'; agentId: AgentId; sessionId: SessionId }
  | { kind: 'human'; humanId: string };

export const AuthorSchema: z.ZodType<Author> = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('agent'),
    agentId: z.string().min(1) as unknown as z.ZodType<AgentId>,
    sessionId: z.string().min(1) as unknown as z.ZodType<SessionId>,
  }),
  z.object({
    kind: z.literal('human'),
    humanId: z.string().min(1),
  }),
]);

export const HUMAN_AUTHOR_ID = 'M' as const;
