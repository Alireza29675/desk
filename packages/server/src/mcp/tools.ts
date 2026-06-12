import type {
  ArtifactId,
  CommentAnchor,
  CommentId,
  CommentPayload,
  SubscriptionId,
} from '@desk/types';
import {
  ArtifactPatchSchema,
  AuthorSchema,
  CommentAnchorSchema,
  CommentPayloadSchema,
} from '@desk/types';
import { z } from 'zod';
import type { DeskService } from '../core/service';

/**
 * Each tool: input schema, the call into `DeskService`, and a small JSON
 * envelope. Output is JSON-encoded text in the MCP `content` shape (the
 * SDK doesn't yet have a structured-result helper that all clients honor).
 */
export interface DeskMcpTool {
  name: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  handler: (input: unknown) => Promise<unknown> | unknown;
}

export function buildMcpTools(service: DeskService): DeskMcpTool[] {
  return [
    {
      name: 'create_artifact',
      description:
        "Create a new artifact of the given type. `initial_content` is optional; if omitted, the artifact-type plugin's empty content is used. Returns the artifact, including its id and current version.",
      inputSchema: z.object({
        type: z
          .string()
          .describe('Plugin-registered artifact type, e.g. "enriched-document" or "presentation".'),
        author: AuthorSchema,
        initial_content: z
          .object({ title: z.string().optional(), components: z.array(z.unknown()).optional() })
          .optional(),
        reason: z.string().optional(),
      }),
      handler: (input) => {
        const parsed = z
          .object({
            type: z.string(),
            author: AuthorSchema,
            initial_content: z
              .object({ title: z.string().optional(), components: z.array(z.unknown()).optional() })
              .optional(),
            reason: z.string().optional(),
          })
          .parse(input);
        return service.createArtifact({
          type: parsed.type,
          author: parsed.author,
          ...(parsed.initial_content ? { initialContent: parsed.initial_content as never } : {}),
          ...(parsed.reason ? { reason: parsed.reason } : {}),
        });
      },
    },

    {
      name: 'update_artifact',
      description:
        "Apply a patch to an artifact's working state. Working-state changes do not enter the history log until they are committed (explicitly via `commit`, or automatically after 2s of idle). Returns the updated artifact.",
      inputSchema: z.object({
        id: z.string(),
        patch: ArtifactPatchSchema,
        author: AuthorSchema,
      }),
      handler: (input) => {
        const parsed = z
          .object({ id: z.string(), patch: ArtifactPatchSchema, author: AuthorSchema })
          .parse(input);
        return service.patchArtifact({
          id: parsed.id as ArtifactId,
          patch: parsed.patch,
          author: parsed.author,
        });
      },
    },

    {
      name: 'commit',
      description:
        'Promote the current working state of an artifact to a committed history event. Cancels the pending auto-commit timer. Optional `reason` is surfaced in the history scrubber.',
      inputSchema: z.object({
        id: z.string(),
        author: AuthorSchema,
        reason: z.string().optional(),
      }),
      handler: (input) => {
        const parsed = z
          .object({ id: z.string(), author: AuthorSchema, reason: z.string().optional() })
          .parse(input);
        return service.commit(parsed.id as ArtifactId, parsed.author, parsed.reason);
      },
    },
    {
      name: 'delete_artifact',
      description:
        'Permanently delete an artifact and everything attached to it (history, comments, relations). This cannot be undone. Removes it from every connected viewer live.',
      inputSchema: z.object({ id: z.string() }),
      handler: (input) => {
        const parsed = z.object({ id: z.string() }).parse(input);
        service.deleteArtifact(parsed.id as ArtifactId);
        return { ok: true, id: parsed.id };
      },
    },

    {
      name: 'get_artifact',
      description:
        'Fetch an artifact. Returns the current state by default; pass `version` to time-travel to a past committed snapshot.',
      inputSchema: z.object({ id: z.string(), version: z.number().int().nonnegative().optional() }),
      handler: (input) => {
        const parsed = z
          .object({ id: z.string(), version: z.number().int().nonnegative().optional() })
          .parse(input);
        return {
          artifact: service.getArtifact(parsed.id as ArtifactId, parsed.version),
          relations: service.getRelations(parsed.id as ArtifactId),
          comments: service.listComments(parsed.id as ArtifactId),
        };
      },
    },

    {
      name: 'list_artifacts',
      description: 'List artifacts ordered by most recently updated. Supports filtering by `type`.',
      inputSchema: z.object({
        type: z.string().optional(),
        limit: z.number().int().positive().max(500).optional(),
        offset: z.number().int().nonnegative().optional(),
      }),
      handler: (input) => {
        const parsed = z
          .object({
            type: z.string().optional(),
            limit: z.number().optional(),
            offset: z.number().optional(),
          })
          .parse(input);
        return { items: service.listArtifacts(parsed) };
      },
    },

    {
      name: 'search_artifacts',
      description: 'Full-text + structural search across artifact title and content.',
      inputSchema: z.object({
        query: z.string().min(1),
        limit: z.number().int().positive().max(100).optional(),
      }),
      handler: (input) => {
        const parsed = z.object({ query: z.string(), limit: z.number().optional() }).parse(input);
        return { items: service.searchArtifacts(parsed.query, parsed.limit) };
      },
    },

    {
      name: 'find_similar',
      description:
        "Content-based similarity. Returns artifacts whose text overlaps the target's. v1 is keyword-overlap; the backend can be swapped for a vector engine without affecting the tool surface.",
      inputSchema: z.object({
        id: z.string(),
        limit: z.number().int().positive().max(50).optional(),
      }),
      handler: (input) => {
        const parsed = z.object({ id: z.string(), limit: z.number().optional() }).parse(input);
        return { items: service.findSimilar(parsed.id as ArtifactId, parsed.limit) };
      },
    },

    {
      name: 'get_related',
      description:
        'Returns the typed-relation graph for an artifact: outgoing edges (this artifact → others) and incoming edges (others → this artifact). Edges are explicit, never inferred.',
      inputSchema: z.object({ id: z.string() }),
      handler: (input) => {
        const parsed = z.object({ id: z.string() }).parse(input);
        return service.getRelations(parsed.id as ArtifactId);
      },
    },

    {
      name: 'add_relation',
      description: 'Add a typed directional edge between two artifacts.',
      inputSchema: z.object({
        from_id: z.string(),
        to_id: z.string(),
        type: z.string().min(1),
      }),
      handler: (input) => {
        const parsed = z
          .object({ from_id: z.string(), to_id: z.string(), type: z.string() })
          .parse(input);
        return service.addRelation({
          from: parsed.from_id as ArtifactId,
          to: parsed.to_id as ArtifactId,
          type: parsed.type,
        });
      },
    },

    {
      name: 'remove_relation',
      description: 'Remove a typed directional edge between two artifacts.',
      inputSchema: z.object({
        from_id: z.string(),
        to_id: z.string(),
        type: z.string().min(1),
      }),
      handler: (input) => {
        const parsed = z
          .object({ from_id: z.string(), to_id: z.string(), type: z.string() })
          .parse(input);
        return {
          removed:
            service.removeRelation({
              from: parsed.from_id as ArtifactId,
              to: parsed.to_id as ArtifactId,
              type: parsed.type,
            }) ?? null,
        };
      },
    },

    {
      name: 'comment',
      description:
        'Post a comment on an artifact. Anchors are always semantic — they target a typed component (and optionally a sub-element path), never pixel coordinates. v1 supports `text` payloads; future payloads (sketch, pen, image overlay) plug in without schema changes.',
      inputSchema: z.object({
        artifact_id: z.string(),
        anchor: CommentAnchorSchema,
        body: CommentPayloadSchema,
        author: AuthorSchema,
        thread_parent_id: z.string().optional(),
      }),
      handler: (input) => {
        const parsed = z
          .object({
            artifact_id: z.string(),
            anchor: CommentAnchorSchema,
            body: CommentPayloadSchema,
            author: AuthorSchema,
            thread_parent_id: z.string().optional(),
          })
          .parse(input);
        return service.postComment({
          artifactId: parsed.artifact_id as ArtifactId,
          // Agents post a single anchor today; normalize to the multi-anchor
          // array the service now takes.
          anchors: [parsed.anchor as CommentAnchor],
          payload: parsed.body as CommentPayload,
          author: parsed.author,
          ...(parsed.thread_parent_id
            ? { threadParentId: parsed.thread_parent_id as CommentId }
            : {}),
        });
      },
    },

    {
      name: 'get_history',
      description:
        'Fetch the append-only history log for an artifact, with optional version range.',
      inputSchema: z.object({
        id: z.string(),
        from: z.number().int().nonnegative().optional(),
        to: z.number().int().nonnegative().optional(),
        limit: z.number().int().positive().max(5000).optional(),
      }),
      handler: (input) => {
        const parsed = z
          .object({
            id: z.string(),
            from: z.number().optional(),
            to: z.number().optional(),
            limit: z.number().optional(),
          })
          .parse(input);
        return { events: service.getHistory(parsed.id as ArtifactId, parsed) };
      },
    },

    {
      name: 'subscribe',
      description:
        'Open a realtime stream for an artifact. The agent receives push events on the WebSocket connection associated with this MCP session: working-state edits, commits, comments, and relation changes. Returns a subscription id usable with `unsubscribe`.',
      inputSchema: z.object({ artifact_id: z.string() }),
      handler: () => {
        // The MCP server adapter binds this tool to the active WebSocket sink
        // before invocation — see `mcp/server.ts`. This default implementation
        // exists only for callers that wire it differently.
        throw new Error(
          '`subscribe` requires a WebSocket-bound MCP context; this server build expects the streamable transport.',
        );
      },
    },

    {
      name: 'unsubscribe',
      description: 'Close a previously opened realtime subscription.',
      inputSchema: z.object({ subscription_id: z.string() }),
      handler: (input) => {
        const parsed = z.object({ subscription_id: z.string() }).parse(input);
        service.unsubscribe(parsed.subscription_id as SubscriptionId);
        return { ok: true };
      },
    },
  ];
}
