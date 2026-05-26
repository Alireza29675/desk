import { z } from 'zod';
import { SERVER_VERSION } from '../config';
import type { DeskService } from '../core/service';
import { type DeskMcpTool, buildMcpTools } from './tools';

/**
 * Minimal MCP-over-HTTP implementation matching the JSON-RPC 2.0 shape of
 * the `tools/*` methods from the Model Context Protocol streamable HTTP
 * transport. Hand-rolled so the dependency footprint stays small; a future
 * cut can swap to `@modelcontextprotocol/sdk` Streamable transport without
 * the rest of the server caring.
 */
export interface McpRequest {
  jsonrpc: '2.0';
  id: number | string | null;
  method: string;
  params?: unknown;
}

export interface McpResponse {
  jsonrpc: '2.0';
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export class DeskMcpServer {
  private readonly tools: DeskMcpTool[];

  constructor(service: DeskService) {
    this.tools = buildMcpTools(service);
  }

  async handle(req: McpRequest): Promise<McpResponse> {
    try {
      switch (req.method) {
        case 'initialize':
          return ok(req, {
            protocolVersion: '2025-03-26',
            serverInfo: { name: 'desk', version: SERVER_VERSION },
            capabilities: { tools: { listChanged: false } },
          });
        case 'tools/list':
          return ok(req, { tools: this.listTools() });
        case 'tools/call': {
          const params = z
            .object({ name: z.string(), arguments: z.unknown().optional() })
            .parse(req.params);
          const tool = this.tools.find((t) => t.name === params.name);
          if (!tool) return err(req, -32601, `Unknown tool: ${params.name}`);
          const result = await tool.handler(params.arguments ?? {});
          return ok(req, {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            isError: false,
          });
        }
        case 'ping':
          return ok(req, {});
        default:
          return err(req, -32601, `Method not found: ${req.method}`);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return err(req, -32000, message);
    }
  }

  private listTools(): Array<{ name: string; description: string; inputSchema: unknown }> {
    return this.tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: zodToJsonSchema(t.inputSchema),
    }));
  }
}

function ok(req: McpRequest, result: unknown): McpResponse {
  return { jsonrpc: '2.0', id: req.id, result };
}
function err(req: McpRequest, code: number, message: string): McpResponse {
  return { jsonrpc: '2.0', id: req.id, error: { code, message } };
}

/**
 * Minimal Zod-to-JSON-Schema for the subset of constructs the tools use.
 * Good enough for `tools/list` advertisement; the real validation runs
 * inside each handler with the actual Zod schema, so we don't need a
 * lossless conversion here.
 */
function zodToJsonSchema(schema: z.ZodTypeAny): unknown {
  if (schema instanceof z.ZodObject) {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [key, value] of Object.entries(schema.shape as Record<string, z.ZodTypeAny>)) {
      properties[key] = zodToJsonSchema(value);
      if (!(value instanceof z.ZodOptional)) required.push(key);
    }
    return { type: 'object', properties, required, additionalProperties: false };
  }
  if (schema instanceof z.ZodOptional) return zodToJsonSchema(schema.unwrap());
  if (schema instanceof z.ZodString) return { type: 'string' };
  if (schema instanceof z.ZodNumber) return { type: 'number' };
  if (schema instanceof z.ZodBoolean) return { type: 'boolean' };
  if (schema instanceof z.ZodArray)
    return { type: 'array', items: zodToJsonSchema(schema.element) };
  if (schema instanceof z.ZodUnion || schema instanceof z.ZodDiscriminatedUnion) {
    const options = (schema as unknown as { options: z.ZodTypeAny[] }).options ?? [];
    return { anyOf: options.map(zodToJsonSchema) };
  }
  if (schema instanceof z.ZodLiteral) return { const: (schema as z.ZodLiteral<unknown>).value };
  if (schema instanceof z.ZodEnum)
    return { type: 'string', enum: (schema as z.ZodEnum<[string, ...string[]]>).options };
  if (schema instanceof z.ZodRecord) return { type: 'object', additionalProperties: true };
  return {};
}
