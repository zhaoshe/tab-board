import type { PreviewChromeOptions } from '../../src/dev/previewChrome';

/**
 * Deterministic preview seed helpers shared across e2e specs.
 *
 * The preview harness (`dev/manager-preview.html`) reads
 * `window.__TABBOARD_PREVIEW__` and forwards it to `installPreviewChrome()`, so
 * seeding is just a matter of injecting this object before the module runs.
 */

const WORKSPACE_ID = 'workspace_default';

function link(id: string, title: string, url: string) {
  return {
    id,
    itemType: 'link' as const,
    title,
    url,
    favIconUrl: '',
    note: '',
    pinned: false,
    incognito: false,
    starred: false,
    taskStatus: 'none' as const,
    browserGroup: null,
    sourceWindowId: null,
    sourceTabId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function session(id: string, title: string, links: Array<[string, string, string]>) {
  return {
    id,
    title,
    note: '',
    workspaceId: WORKSPACE_ID,
    folderId: null,
    locked: false,
    starred: false,
    archived: false,
    collapsed: false,
    tabs: links.map(([tabId, tabTitle, url]) => link(tabId, tabTitle, url)),
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

/**
 * Two Inbox sessions so reorder / drag lifecycle has something to move.
 */
export function twoInboxSessions(): PreviewChromeOptions {
  return {
    state: {
      version: 1,
      workspaces: [
        { id: WORKSPACE_ID, name: 'Personal', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
      ],
      activeWorkspaceId: WORKSPACE_ID,
      groups: [
        session('group_alpha', 'Alpha Session', [
          ['tab_a1', 'Alpha One', 'https://alpha.example/one'],
          ['tab_a2', 'Alpha Two', 'https://alpha.example/two'],
        ]),
        session('group_beta', 'Beta Session', [
          ['tab_b1', 'Beta One', 'https://beta.example/one'],
        ]),
      ],
      folders: [],
      categoryOrderByWorkspace: {},
      bin: [],
      settings: {},
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  };
}

/**
 * Three Inbox sessions, so a keyboard drag can move a card past an adjacent
 * insertion point (which would be a no-op) and commit a real reorder.
 */
export function threeInboxSessions(): PreviewChromeOptions {
  return {
    state: {
      version: 1,
      workspaces: [
        { id: WORKSPACE_ID, name: 'Personal', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
      ],
      activeWorkspaceId: WORKSPACE_ID,
      groups: [
        session('group_alpha', 'Alpha Session', [['tab_a1', 'Alpha One', 'https://alpha.example/one']]),
        session('group_beta', 'Beta Session', [['tab_b1', 'Beta One', 'https://beta.example/one']]),
        session('group_gamma', 'Gamma Session', [['tab_g1', 'Gamma One', 'https://gamma.example/one']]),
      ],
      folders: [],
      categoryOrderByWorkspace: {},
      bin: [],
      settings: {},
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  };
}

/**
 * A large Inbox board (default 60 sessions) to exercise the content-visibility
 * perf path: only near-viewport slots should paint, but every card stays in the
 * DOM and remains reachable.
 */
export function manyInboxSessions(count = 60): PreviewChromeOptions {
  const groups = Array.from({ length: count }, (_, i) => {
    const n = String(i).padStart(3, '0');
    return session(`group_${n}`, `Session ${n}`, [
      [`tab_${n}_1`, `Tab ${n} One`, `https://example.com/${n}/one`],
      [`tab_${n}_2`, `Tab ${n} Two`, `https://example.com/${n}/two`],
    ]);
  });
  return {
    state: {
      version: 1,
      workspaces: [
        { id: WORKSPACE_ID, name: 'Personal', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
      ],
      activeWorkspaceId: WORKSPACE_ID,
      groups,
      folders: [],
      categoryOrderByWorkspace: {},
      bin: [],
      settings: {},
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  };
}
