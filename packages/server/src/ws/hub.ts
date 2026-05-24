import type {
  ArtifactId,
  RealtimeArtifactEvent,
  RealtimeServerMessage,
  SubscriptionId,
} from '@desk/types';
import { newSubscriptionId } from '../ids';

/**
 * The realtime hub fans server-side artifact events out to every connected
 * subscriber of the relevant artifact. It is transport-agnostic: clients
 * are `SubscriberSink`s, not raw WebSockets. The WebSocket layer adapts
 * a socket into a sink; in-process subscribers (the MCP `subscribe` tool's
 * server-side reader) can use the same interface.
 */
export interface SubscriberSink {
  send(message: RealtimeServerMessage): void;
}

interface Subscription {
  id: SubscriptionId;
  artifactId: ArtifactId;
  sink: SubscriberSink;
}

/**
 * Wildcard target for firehose subscriptions. A subscriber on this id receives
 * every artifact's events, not just one. The channel bridge uses it to watch
 * all comments at once without having to track which artifacts exist.
 */
export const ALL_ARTIFACTS = '*' as ArtifactId;

export class RealtimeHub {
  private readonly byArtifact = new Map<ArtifactId, Map<SubscriptionId, Subscription>>();
  private readonly firehose = new Map<SubscriptionId, Subscription>();
  private readonly all = new Map<SubscriptionId, Subscription>();

  subscribe(artifactId: ArtifactId, sink: SubscriberSink): SubscriptionId {
    const id = newSubscriptionId();
    const sub: Subscription = { id, artifactId, sink };
    this.all.set(id, sub);
    const bucket = artifactId === ALL_ARTIFACTS ? this.firehose : this.bucketFor(artifactId);
    bucket.set(id, sub);
    sink.send({ kind: 's.subscribed', subscriptionId: id, artifactId });
    return id;
  }

  private bucketFor(artifactId: ArtifactId): Map<SubscriptionId, Subscription> {
    let bucket = this.byArtifact.get(artifactId);
    if (!bucket) {
      bucket = new Map();
      this.byArtifact.set(artifactId, bucket);
    }
    return bucket;
  }

  unsubscribe(id: SubscriptionId): void {
    const sub = this.all.get(id);
    if (!sub) return;
    this.all.delete(id);
    if (sub.artifactId === ALL_ARTIFACTS) {
      this.firehose.delete(id);
    } else {
      const bucket = this.byArtifact.get(sub.artifactId);
      bucket?.delete(id);
      if (bucket && bucket.size === 0) this.byArtifact.delete(sub.artifactId);
    }
    sub.sink.send({ kind: 's.unsubscribed', subscriptionId: id });
  }

  /**
   * Drop every subscription whose sink matches the predicate. Used by the
   * WS layer when a socket closes — every subscription for that socket goes.
   */
  removeWhere(predicate: (sink: SubscriberSink) => boolean): void {
    for (const sub of Array.from(this.all.values())) {
      if (predicate(sub.sink)) this.unsubscribe(sub.id);
    }
  }

  publish(event: RealtimeArtifactEvent): void {
    const bucket = this.byArtifact.get(event.artifactId);
    if (bucket) for (const sub of bucket.values()) sub.sink.send(event);
    for (const sub of this.firehose.values()) sub.sink.send(event);
  }
}
