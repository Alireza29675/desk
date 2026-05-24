import type { ArtifactId, Author } from '@desk/types';

/**
 * Auto-commit-on-idle: each `update_artifact` call resets a timer for the
 * affected artifact; when the timer fires, the artifact's working state is
 * committed. The agent's explicit `commit()` cancels the pending timer
 * (so the explicit commit wins) and creates the committed event itself.
 *
 * The debouncer holds the *last* author it saw because the auto-commit fires
 * without an authored call. If the human edits in the viewer and walks away,
 * the auto-commit lands with the human as the author of that snapshot.
 */
export interface PendingCommit {
  artifactId: ArtifactId;
  lastAuthor: Author;
  timer: ReturnType<typeof setTimeout>;
}

export class CommitDebouncer {
  private readonly pending = new Map<ArtifactId, PendingCommit>();

  constructor(
    private readonly delayMs: number,
    private readonly fire: (artifactId: ArtifactId, author: Author) => void,
  ) {}

  /** Mark the artifact dirty under this author; resets the timer. */
  touch(artifactId: ArtifactId, author: Author): void {
    if (this.delayMs <= 0) return;
    const existing = this.pending.get(artifactId);
    if (existing) clearTimeout(existing.timer);
    const timer = setTimeout(() => this.flush(artifactId), this.delayMs);
    this.pending.set(artifactId, { artifactId, lastAuthor: author, timer });
  }

  /** Cancel a pending auto-commit (e.g. on explicit commit). */
  cancel(artifactId: ArtifactId): void {
    const existing = this.pending.get(artifactId);
    if (!existing) return;
    clearTimeout(existing.timer);
    this.pending.delete(artifactId);
  }

  /** Force-fire all pending timers (used on graceful shutdown). */
  flushAll(): void {
    for (const id of Array.from(this.pending.keys())) this.flush(id);
  }

  private flush(artifactId: ArtifactId): void {
    const existing = this.pending.get(artifactId);
    if (!existing) return;
    clearTimeout(existing.timer);
    this.pending.delete(artifactId);
    this.fire(artifactId, existing.lastAuthor);
  }
}
