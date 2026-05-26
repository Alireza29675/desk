import { join } from 'node:path';
import type { DeskPlugin, RealtimeClientMessage, SubscriptionId } from '@desk/types';
import { RealtimeClientMessageSchema } from '@desk/types';
import type { ServerWebSocket } from 'bun';
import { SERVER_VERSION, type ServerConfig, loadConfig } from './config';
import { DeskService } from './core/service';
import { buildHttpApp } from './http/app';
import { DeskMcpServer, type McpRequest } from './mcp/server';
import { buildRegistry } from './plugins';
import { openDatabase } from './storage/db';
import { RealtimeHub, type SubscriberSink } from './ws/hub';

export interface StartOptions {
  config?: Partial<ServerConfig>;
  /** Extra plugins to register beyond the built-in set. */
  plugins?: DeskPlugin[];
}

export interface RunningServer {
  config: ServerConfig;
  service: DeskService;
  stop: () => Promise<void>;
}

/**
 * Bring up the Desk server. Single port for HTTP, WebSocket upgrade, and
 * the MCP HTTP transport — they share one origin so MCP clients only need
 * one URL.
 */
export async function startServer(opts: StartOptions = {}): Promise<RunningServer> {
  const config = loadConfig(opts.config);

  const registry = buildRegistry(opts.plugins ?? []);
  const db = openDatabase(join(config.home, config.dbFilename));
  const hub = new RealtimeHub();
  const service = new DeskService({ db, registry, hub, autoCommitMs: config.autoCommitMs });
  const httpApp = buildHttpApp(service);
  const mcpServer = new DeskMcpServer(service);

  const wsState = new WeakMap<ServerWebSocket<SocketState>, Set<SubscriptionId>>();

  const server = Bun.serve<SocketState>({
    hostname: config.host,
    port: config.port,
    async fetch(req, srv) {
      const url = new URL(req.url);

      // ── WebSocket upgrade ───────────────────────────────────────────
      if (url.pathname === '/ws') {
        const upgraded = srv.upgrade(req, { data: { kind: 'ws' } });
        return upgraded ? undefined : new Response('Upgrade failed', { status: 400 });
      }

      // ── MCP streamable HTTP transport ───────────────────────────────
      if (url.pathname === '/mcp' && req.method === 'POST') {
        let body: McpRequest;
        try {
          body = (await req.json()) as McpRequest;
        } catch {
          // Malformed JSON: answer with a JSON-RPC parse error, not Bun's HTML page.
          return Response.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
        }
        const response = await mcpServer.handle(body);
        return Response.json(response);
      }

      // ── HTTP API for the viewer ─────────────────────────────────────
      return httpApp.fetch(req);
    },
    websocket: {
      open(ws) {
        wsState.set(ws, new Set());
        const sink = sinkFor(ws);
        sink.send({ kind: 's.welcome', serverVersion: SERVER_VERSION });
      },
      message(ws, raw) {
        let parsed: RealtimeClientMessage;
        try {
          parsed = RealtimeClientMessageSchema.parse(JSON.parse(raw.toString()));
        } catch (e) {
          sinkFor(ws).send({ kind: 's.error', message: `Bad message: ${(e as Error).message}` });
          return;
        }
        const subs = wsState.get(ws);
        if (!subs) return;
        try {
          switch (parsed.kind) {
            case 'c.subscribe': {
              const id = service.subscribe(parsed.artifactId, sinkFor(ws));
              subs.add(id);
              return;
            }
            case 'c.unsubscribe':
              subs.delete(parsed.subscriptionId);
              service.unsubscribe(parsed.subscriptionId);
              return;
            case 'c.ping':
              sinkFor(ws).send({ kind: 's.pong' });
              return;
          }
        } catch (e) {
          sinkFor(ws).send({ kind: 's.error', message: (e as Error).message });
        }
      },
      close(ws) {
        const subs = wsState.get(ws);
        wsState.delete(ws);
        if (!subs) return;
        for (const id of subs) service.unsubscribe(id);
      },
    },
  });

  const sinkFor = (ws: ServerWebSocket<SocketState>): SubscriberSink => ({
    send: (msg) => {
      try {
        ws.send(JSON.stringify(msg));
      } catch {
        // socket closed mid-send; cleanup happens on close
      }
    },
  });

  return {
    config,
    service,
    stop: async () => {
      service.shutdown();
      server.stop();
      db.close();
    },
  };
}

interface SocketState {
  kind: 'ws';
}

export { DeskService } from './core/service';
export { buildRegistry } from './plugins';
export type { ServerConfig } from './config';
