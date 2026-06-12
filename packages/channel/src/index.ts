#!/usr/bin/env bun
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { attachmentToFile } from './attachments';
import { captureAnchor } from './screenshot';

/**
 * Desk → Claude Code channel bridge.
 *
 * Connects to a running Desk server's WebSocket firehose, forwards each
 * human-authored comment into the Claude Code session as a `claude/channel`
 * notification, and exposes a `reply` tool so the agent can post a comment
 * back to Desk (which the operator sees live in the viewer).
 *
 * Transport to Claude Code is stdio (Claude Code spawns this process). All
 * diagnostics go to stderr — stdout is reserved for the MCP protocol.
 */

const DESK_URL = (process.env.DESK_URL ?? 'http://127.0.0.1:7878').replace(/\/$/, '');
const WS_URL = `${DESK_URL.replace(/^http/, 'ws')}/ws`;
const SOURCE = 'desk';

const log = (...args: unknown[]) => console.error('[desk-channel]', ...args);

const mcp = new Server(
  { name: SOURCE, version: '0.1.0' },
  {
    capabilities: {
      experimental: { 'claude/channel': {} },
      tools: {},
    },
    instructions:
      'Comments the human (M) leaves in the Desk viewer arrive as ' +
      '<channel source="desk" artifact_id="..." comment_id="..." author="..." anchor="...">. ' +
      'They are the operator reacting to an artifact you produced. Read the comment, do the work it ' +
      'implies (e.g. edit the artifact via the Desk MCP tools), then acknowledge by calling the `reply` ' +
      'tool with the artifact_id from the tag. Keep replies short.',
  },
);

// ── reply tool: agent → Desk comment ──────────────────────────────────
mcp.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'reply',
      description:
        'Post a comment back to a Desk artifact, visible to the operator in the viewer. Use the ' +
        'artifact_id from the inbound <channel> tag. Optionally thread under the comment you are answering.',
      inputSchema: {
        type: 'object',
        properties: {
          artifact_id: {
            type: 'string',
            description: 'The artifact to comment on (from the channel tag).',
          },
          text: { type: 'string', description: 'The reply text.' },
          thread_parent_id: {
            type: 'string',
            description: 'Optional: the comment_id you are replying to, to thread the reply.',
          },
        },
        required: ['artifact_id', 'text'],
      },
    },
  ],
}));

mcp.setRequestHandler(CallToolRequestSchema, async (req) => {
  if (req.params.name !== 'reply') throw new Error(`unknown tool: ${req.params.name}`);
  const { artifact_id, text, thread_parent_id } = req.params.arguments as {
    artifact_id: string;
    text: string;
    thread_parent_id?: string;
  };
  try {
    const res = await fetch(`${DESK_URL}/api/a/${artifact_id}/comments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        anchor: { kind: 'general' },
        payload: { kind: 'text', text },
        author: { kind: 'agent', agentId: 'claude', sessionId: 'desk-channel' },
        ...(thread_parent_id ? { threadParentId: thread_parent_id } : {}),
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      return {
        content: [{ type: 'text', text: `reply failed: ${res.status} ${body}` }],
        isError: true,
      };
    }
    return { content: [{ type: 'text', text: 'sent' }] };
  } catch (e) {
    return {
      content: [{ type: 'text', text: `reply error: ${(e as Error).message}` }],
      isError: true,
    };
  }
});

await mcp.connect(new StdioServerTransport());
log(`connected to Claude Code over stdio; bridging ${DESK_URL}`);

// ── Desk WebSocket firehose → channel notifications ───────────────────
const titleCache = new Map<string, string>();

async function artifactTitle(id: string): Promise<string> {
  const cached = titleCache.get(id);
  if (cached) return cached;
  try {
    const res = await fetch(`${DESK_URL}/api/a/${id}`);
    if (res.ok) {
      const { artifact } = (await res.json()) as { artifact: { content: { title: string } } };
      titleCache.set(id, artifact.content.title);
      return artifact.content.title;
    }
  } catch {
    /* fall through */
  }
  return id;
}

function describeAnchor(anchor: {
  kind: string;
  componentId?: string;
  elementPath?: string;
}): string {
  if (anchor.kind === 'general') return 'general';
  const path = anchor.elementPath ? `.${anchor.elementPath}` : '';
  return `${anchor.kind}:${anchor.componentId ?? '?'}${path}`;
}

function connect(): void {
  const ws = new WebSocket(WS_URL);

  ws.addEventListener('open', () => {
    log('websocket open; subscribing to firehose');
    ws.send(
      JSON.stringify({ kind: 'c.subscribe', artifactId: '*', subscriptionId: crypto.randomUUID() }),
    );
  });

  ws.addEventListener('message', async (ev: MessageEvent) => {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data));
    } catch {
      return;
    }
    if (msg.kind !== 's.commented') return;

    const comment = msg.comment as {
      id: string;
      artifactId: string;
      author: { kind: string; humanId?: string; agentId?: string };
      payload: { kind: string; text?: string };
      attachments?: { id: string; kind: string }[];
      anchor: {
        kind: string;
        componentId?: string;
        elementPath?: string;
        region?: { kind: string; x?: number; y?: number; width?: number; height?: number };
        offset?: { x: number; y: number };
      };
    };

    // Only forward human comments — agent replies must not echo back into the session.
    if (comment.author.kind !== 'human') return;

    const title = await artifactTitle(comment.artifactId);
    const who = comment.author.humanId ?? 'human';
    const body =
      comment.payload.kind === 'text' ? (comment.payload.text ?? '') : `[${comment.payload.kind}]`;

    // Show the agent what the operator anchored to. Primary: the image the
    // VIEWER captured at comment time (exactly what the operator saw — their
    // theme, viewport, live state), riding on the comment as an attachment.
    // Fallback: the Puppeteer re-render — for comments without attachments
    // and anchors over iframe content the viewer can't rasterize.
    const shot =
      (await attachmentToFile(DESK_URL, comment.id, comment.attachments)) ??
      (await captureAnchor(DESK_URL, comment.artifactId, comment.id, comment.anchor));

    log(
      `forwarding comment ${comment.id} on ${comment.artifactId} from ${who}${shot ? ' (+screenshot)' : ''}`,
    );
    await mcp.notification({
      method: 'notifications/claude/channel',
      params: {
        content: `Comment on "${title}":\n\n${body}${
          shot
            ? `\n\nThe operator anchored this to ${describeAnchor(comment.anchor)}. Open this image to see exactly what they selected: ${shot}`
            : ''
        }`,
        meta: {
          artifact_id: comment.artifactId,
          comment_id: comment.id,
          author: who,
          anchor: describeAnchor(comment.anchor),
          ...(shot ? { screenshot: shot } : {}),
        },
      },
    });
  });

  ws.addEventListener('close', () => {
    log('websocket closed; reconnecting in 1s');
    setTimeout(connect, 1000);
  });

  ws.addEventListener('error', () => ws.close());
}

connect();
