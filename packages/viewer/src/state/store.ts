import { create } from 'zustand';
import type {
  Artifact,
  ArtifactId,
  Author,
  Comment,
  CommentAnchor,
  LocatorSegment,
  RealtimeServerMessage,
  RelationGraph,
} from '@desk/types';
import { api, type ArtifactBundle } from '../lib/api';
import { buildRealtimeClient, type RealtimeClient } from '../realtime/client';
import { goHome, onPopState, pushArtifact, readLocation, replaceLocator } from '../lib/router';

/**
 * UI store. Owns:
 *   - the list of artifacts (sidebar)
 *   - the currently-open artifact bundle
 *   - the open comment thread / draft anchor
 *   - the connection state for the realtime socket
 *   - the active human author (which goes onto every locally-originated edit
 *     and comment so provenance is recorded correctly)
 */

interface OpenArtifact {
  artifact: Artifact;
  relations: RelationGraph;
  comments: Comment[];
  /** The active in-artifact deep-link location (slide, component, …). */
  locator: LocatorSegment[];
  /** Optional historical version the viewer is "scrubbed" to. */
  pinnedVersion?: number;
}

interface OpenOptions {
  /** Deep-link target inside the artifact. */
  segments?: LocatorSegment[];
  /** Set when the open is driven by browser back/forward, to avoid re-pushing history. */
  fromHistory?: boolean;
}

interface State {
  realtime: RealtimeClient;
  realtimeConnected: boolean;
  author: Author;
  artifacts: Artifact[];
  open: OpenArtifact | null;
  loading: boolean;
  theme: 'light' | 'dark';
  /** Pending anchor for a new comment, set when the user targets a component. */
  commentTarget: CommentAnchor | null;

  init(): Promise<void>;
  refresh(): Promise<void>;
  openArtifact(id: ArtifactId, opts?: OpenOptions): Promise<void>;
  closeArtifact(): void;
  /** Update the active in-artifact locator and reflect it into the URL. */
  setLocator(segments: LocatorSegment[]): void;
  /** Re-sync the open artifact from the current address bar (load + popstate). */
  syncFromLocation(fromHistory: boolean): void;
  /** Begin composing a comment anchored to a specific element. */
  startComment(anchor: CommentAnchor): void;
  clearCommentTarget(): void;
  applyEvent(msg: RealtimeServerMessage): void;
  setTheme(theme: 'light' | 'dark'): void;
}

export const useStore = create<State>((set, get) => {
  const realtime = buildRealtimeClient();
  realtime.addListener((msg) => get().applyEvent(msg));

  return {
    realtime,
    realtimeConnected: false,
    author: { kind: 'human', humanId: 'M' },
    artifacts: [],
    open: null,
    loading: false,
    commentTarget: null,
    theme:
      (document.documentElement.dataset.theme as 'light' | 'dark') ??
      (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),

    async init() {
      get().realtime.connect();
      document.documentElement.dataset.theme = get().theme;
      onPopState(() => get().syncFromLocation(true));
      await get().refresh();
      // Open whatever the address bar points at (deep link on first load).
      get().syncFromLocation(true);
    },

    async refresh() {
      set({ loading: true });
      try {
        const { items } = await api.listArtifacts();
        set({ artifacts: items });
      } finally {
        set({ loading: false });
      }
    },

    async openArtifact(id, opts = {}) {
      const segments = opts.segments ?? [];
      const previous = get().open;
      if (previous && previous.artifact.id !== id) {
        get().realtime.unsubscribe(previous.artifact.id);
      }
      const bundle: ArtifactBundle = await api.getArtifact(id);
      set({ open: { ...bundle, locator: segments }, commentTarget: null });
      get().realtime.subscribe(id);
      if (!opts.fromHistory) pushArtifact(id, segments);
    },

    closeArtifact() {
      const open = get().open;
      if (open) get().realtime.unsubscribe(open.artifact.id);
      set({ open: null, commentTarget: null });
      goHome();
    },

    startComment(anchor) {
      set({ commentTarget: anchor });
    },

    clearCommentTarget() {
      set({ commentTarget: null });
    },

    setLocator(segments) {
      const open = get().open;
      if (!open) return;
      set({ open: { ...open, locator: segments } });
      replaceLocator(open.artifact.id, segments);
    },

    syncFromLocation(fromHistory) {
      const { artifactId, segments } = readLocation();
      const open = get().open;
      if (!artifactId) {
        if (open) {
          get().realtime.unsubscribe(open.artifact.id);
          set({ open: null });
        }
        return;
      }
      if (open && open.artifact.id === artifactId) {
        // Same artifact, possibly a new in-artifact locator (e.g. hash change).
        set({ open: { ...open, locator: segments } });
        return;
      }
      void get().openArtifact(artifactId as ArtifactId, { segments, fromHistory });
    },

    applyEvent(msg) {
      if (msg.kind === 's.welcome') {
        set({ realtimeConnected: true });
        return;
      }
      const open = get().open;
      if (!open) return;
      if (!('artifactId' in msg) || msg.artifactId !== open.artifact.id) return;

      if (msg.kind === 's.working_changed' || msg.kind === 's.committed') {
        // If the user is time-traveling, leave their view pinned; just update
        // the underlying artifact + relations.
        const pinned = open.pinnedVersion !== undefined;
        set({
          open: {
            ...open,
            artifact: pinned ? open.artifact : msg.artifact,
            ...(pinned ? {} : { pinnedVersion: undefined }),
          },
          artifacts: get().artifacts.map((a) => (a.id === msg.artifact.id ? msg.artifact : a)),
        });
      } else if (msg.kind === 's.commented') {
        set({ open: { ...open, comments: [...open.comments, msg.comment] } });
      } else if (msg.kind === 's.relation_added') {
        set({
          open: {
            ...open,
            relations: { ...open.relations, outgoing: [...open.relations.outgoing, msg.relation] },
          },
        });
      } else if (msg.kind === 's.relation_removed') {
        set({
          open: {
            ...open,
            relations: {
              outgoing: open.relations.outgoing.filter((r) => r.id !== msg.relation.id),
              incoming: open.relations.incoming.filter((r) => r.id !== msg.relation.id),
            },
          },
        });
      }
    },

    setTheme(theme) {
      document.documentElement.dataset.theme = theme;
      set({ theme });
    },
  };
});
