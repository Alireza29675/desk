import type {
  ArtifactId,
  RealtimeClientMessage,
  RealtimeServerMessage,
  SubscriptionId,
} from '@desk/types';

/**
 * Realtime client with reconnect-with-backoff and subscription accounting.
 * On reconnect, every active subscription is re-issued automatically so
 * the caller doesn't have to know the socket was ever interrupted.
 */
export type RealtimeListener = (msg: RealtimeServerMessage) => void;

const MIN_BACKOFF = 250;
const MAX_BACKOFF = 8000;

export class RealtimeClient {
  private ws: WebSocket | null = null;
  private listeners = new Set<RealtimeListener>();
  private subscriptions = new Map<ArtifactId, SubscriptionId | null>();
  private backoff = MIN_BACKOFF;
  private closedByUser = false;

  constructor(private readonly url: string) {}

  connect(): void {
    this.closedByUser = false;
    this.open();
  }

  close(): void {
    this.closedByUser = true;
    this.ws?.close();
    this.ws = null;
  }

  addListener(listener: RealtimeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribe(artifactId: ArtifactId): void {
    if (this.subscriptions.has(artifactId)) return;
    this.subscriptions.set(artifactId, null);
    this.tryIssue(artifactId);
  }

  unsubscribe(artifactId: ArtifactId): void {
    const subId = this.subscriptions.get(artifactId);
    this.subscriptions.delete(artifactId);
    if (subId && this.ws?.readyState === WebSocket.OPEN) {
      this.send({ kind: 'c.unsubscribe', subscriptionId: subId });
    }
  }

  private open(): void {
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => {
      this.backoff = MIN_BACKOFF;
      for (const id of this.subscriptions.keys()) this.tryIssue(id);
    };
    ws.onmessage = (ev) => {
      let parsed: RealtimeServerMessage;
      try {
        parsed = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
      } catch {
        return;
      }
      if (parsed.kind === 's.subscribed') {
        this.subscriptions.set(parsed.artifactId, parsed.subscriptionId);
      }
      for (const l of this.listeners) l(parsed);
    };
    ws.onclose = () => {
      this.ws = null;
      if (this.closedByUser) return;
      setTimeout(() => this.open(), this.backoff);
      this.backoff = Math.min(MAX_BACKOFF, this.backoff * 2);
    };
    ws.onerror = () => ws.close();
  }

  private tryIssue(artifactId: ArtifactId): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    // Server returns a SubscriptionId in `s.subscribed`; until then we use a
    // throw-away ID just to round-trip the request.
    this.send({ kind: 'c.subscribe', artifactId, subscriptionId: crypto.randomUUID() as never });
  }

  private send(msg: RealtimeClientMessage): void {
    this.ws?.send(JSON.stringify(msg));
  }
}

export function buildRealtimeClient(): RealtimeClient {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return new RealtimeClient(`${proto}//${window.location.host}/ws`);
}
