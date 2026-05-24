import { create } from 'zustand';
import type {
  Artifact,
  ArtifactId,
  Author,
  Comment,
  RealtimeServerMessage,
  RelationGraph,
} from '@desk/types';
import { api, type ArtifactBundle } from '../lib/api';
import { buildRealtimeClient, type RealtimeClient } from '../realtime/client';

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
  /** Optional historical version the viewer is "scrubbed" to. */
  pinnedVersion?: number;
}

interface State {
  realtime: RealtimeClient;
  realtimeConnected: boolean;
  author: Author;
  artifacts: Artifact[];
  open: OpenArtifact | null;
  loading: boolean;
  theme: 'light' | 'dark';

  init(): Promise<void>;
  refresh(): Promise<void>;
  openArtifact(id: ArtifactId): Promise<void>;
  closeArtifact(): void;
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
    theme:
      (document.documentElement.dataset.theme as 'light' | 'dark') ??
      (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),

    async init() {
      get().realtime.connect();
      document.documentElement.dataset.theme = get().theme;
      await get().refresh();
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

    async openArtifact(id) {
      const bundle: ArtifactBundle = await api.getArtifact(id);
      set({ open: { ...bundle } });
      get().realtime.subscribe(id);
    },

    closeArtifact() {
      const open = get().open;
      if (open) get().realtime.unsubscribe(open.artifact.id);
      set({ open: null });
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
