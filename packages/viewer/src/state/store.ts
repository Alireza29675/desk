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

/** Firehose subscription target: receive realtime events for every artifact. */
const FIREHOSE = '*' as ArtifactId;

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
  /** Anchor being momentarily highlighted because its comment was clicked. */
  focusedAnchor: CommentAnchor | null;
  /** Id of an artifact that failed to load (e.g. a stale/deleted deep link). */
  loadError: string | null;

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
  /** Momentarily highlight an existing comment's anchor (clears itself). */
  focusAnchor(anchor: CommentAnchor): void;
  applyEvent(msg: RealtimeServerMessage): void;
  setTheme(theme: 'light' | 'dark'): void;
}

export const useStore = create<State>((set, get) => {
  const realtime = buildRealtimeClient();
  realtime.addListener((msg) => get().applyEvent(msg));
  // Auto-clears the focused anchor after its highlight pulse.
  let focusTimer: ReturnType<typeof setTimeout>;

  return {
    realtime,
    realtimeConnected: false,
    author: { kind: 'human', humanId: 'M' },
    artifacts: [],
    open: null,
    loading: false,
    commentTarget: null,
    focusedAnchor: null,
    loadError: null,
    theme:
      (document.documentElement.dataset.theme as 'light' | 'dark') ??
      (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),

    async init() {
      get().realtime.connect();
      // Subscribe to the firehose (all artifacts) rather than per-artifact, so
      // the sidebar updates live when an agent creates or commits anything —
      // and so events for the open artifact arrive exactly once (no per-id
      // double-subscription).
      get().realtime.subscribe(FIREHOSE);
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
      let bundle: ArtifactBundle;
      try {
        bundle = await api.getArtifact(id);
      } catch {
        // Stale/deleted deep link, or a bad id: surface a not-found state
        // rather than the generic empty desk. Keep the URL so a retry/refresh
        // hits the same id once the artifact (re)appears.
        set({ open: null, commentTarget: null, loadError: id });
        if (!opts.fromHistory) pushArtifact(id, segments);
        return;
      }
      // No per-artifact subscribe — the firehose (subscribed in init) already
      // delivers this artifact's events.
      set({ open: { ...bundle, locator: segments }, commentTarget: null, loadError: null });
      if (!opts.fromHistory) pushArtifact(id, segments);
    },

    closeArtifact() {
      set({ open: null, commentTarget: null, loadError: null });
      goHome();
    },

    startComment(anchor) {
      set({ commentTarget: anchor });
    },

    clearCommentTarget() {
      set({ commentTarget: null });
    },

    focusAnchor(anchor) {
      set({ focusedAnchor: anchor });
      clearTimeout(focusTimer);
      focusTimer = setTimeout(() => set({ focusedAnchor: null }), 1600);
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
        set({ open: null, loadError: null });
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

      // Sidebar stays live off the firehose: a committed create/edit upserts
      // the list regardless of what's open (new artifacts appear immediately;
      // existing ones reflect title changes).
      if (msg.kind === 's.committed') {
        const arts = get().artifacts;
        const i = arts.findIndex((a) => a.id === msg.artifact.id);
        set({ artifacts: i === -1 ? [msg.artifact, ...arts] : arts.map((a) => (a.id === msg.artifact.id ? msg.artifact : a)) });
      }

      if (msg.kind === 's.deleted') {
        set({ artifacts: get().artifacts.filter((a) => a.id !== msg.artifactId) });
        const current = get().open;
        if (current && current.artifact.id === msg.artifactId) get().closeArtifact();
        return;
      }

      const open = get().open;
      if (!open) return;
      if (!('artifactId' in msg) || msg.artifactId !== open.artifact.id) return;

      if (msg.kind === 's.working_changed' || msg.kind === 's.committed') {
        // If the user is time-traveling, leave their view pinned; just update
        // the underlying artifact.
        const pinned = open.pinnedVersion !== undefined;
        set({
          open: {
            ...open,
            artifact: pinned ? open.artifact : msg.artifact,
            ...(pinned ? {} : { pinnedVersion: undefined }),
          },
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
      // Persist the choice so it survives reloads and deep-link opens.
      try {
        localStorage.setItem('desk-theme', theme);
      } catch {
        // Storage unavailable (private mode): keep the in-memory theme only.
      }
      set({ theme });
    },
  };
});
