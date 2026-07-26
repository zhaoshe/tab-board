import { describe, expect, it, vi } from 'vitest';
import { createEmptyState } from '../../shared/model';
import { STATE_KEY } from '../../shared/model/constants';
import { resetActiveAdapterForTests } from '../../shared/store/activeAdapter';
import { getState, setState } from '../../shared/store/chromeStorage';
import { applyStateMutation, type StateMutation } from '../../shared/store/stateMutations';
import { createStatePersistence } from '../../background/statePersistence';
import { getCaptureMessage, getCaptureOutcome, shouldRevealCapture } from './capture';
import { clearDragState, resolveDrop } from './dnd';
import { getDropIntentReplayStatus } from './commands';
import { resolveSelectedWindow, sameOpenTabSelection } from './open-tabs';

describe('core contracts', () => {
  it('uses tabboardState as the canonical chrome storage key', async () => {
    const state = createEmptyState();
    const get = vi.fn(async (key: string) => ({ [key]: state }));
    const set = vi.fn(async (_value: Record<string, unknown>) => undefined);
    vi.stubGlobal('chrome', {
      storage: {
        local: { get, set },
        onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
      },
    });

    try {
      expect(await getState()).toEqual(state);
      await setState(state);
    } finally {
      resetActiveAdapterForTests();
      vi.unstubAllGlobals();
    }

    expect(STATE_KEY).toBe('tabboardState');
    expect(get).toHaveBeenCalledWith(STATE_KEY);
    expect(set).toHaveBeenCalledWith({ [STATE_KEY]: state });
  });

  it('executes representative DnD, state, persistence, replay, and feedback contracts', async () => {
    const state = createEmptyState();
    const workspaceId = state.activeWorkspaceId;
    const mutation: StateMutation = {
      type: 'update-settings',
      updates: { theme: 'dark' },
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    const mutated = applyStateMutation(state, mutation);
    expect(mutated.settings.theme).toBe('dark');
    expect(mutated).not.toBe(state);

    const persistenceWrites: typeof state[] = [];
    let persisted = state;
    const persistence = createStatePersistence({
      locks: undefined,
      getState: async () => structuredClone(persisted),
      setState: async (next) => {
        persisted = structuredClone(next);
        persistenceWrites.push(structuredClone(next));
      },
    });
    await persistence.applyMutations([mutation]);
    expect(persisted.settings.theme).toBe('dark');
    expect(persistenceWrites).toHaveLength(1);

    expect(resolveDrop({
      payload: { kind: 'group', groupId: 'missing-group', workspaceId },
      target: { kind: 'category-column', category: 'inbox', workspaceId },
      state,
    })).toBeNull();
    expect(clearDragState({
      payload: null,
      target: null,
      sourceRect: null,
      marker: null,
    })).toEqual({ payload: null, target: null, sourceRect: null, marker: null });

    const replayIntent = {
      kind: 'move-session' as const,
      groupId: 'missing-group',
      category: 'inbox' as const,
      index: 0,
      workspaceId,
    };
    expect(getDropIntentReplayStatus(state, replayIntent, [], 'release-proof-operation')).toBe('none');

    expect(resolveSelectedWindow([], null)).toBeNull();
    expect(sameOpenTabSelection([7, 2], [2, 7])).toBe(true);
    expect(getCaptureOutcome({ committed: true, reconciled: true, selectionCurrent: true }))
      .toEqual({ isSaved: true, shouldClearSelection: true, shouldReveal: true });
    expect(shouldRevealCapture({
      sourceWorkspaceId: workspaceId,
      activeWorkspaceId: workspaceId,
      createdGroupIds: ['created-group'],
    })).toBe(true);
    expect(getCaptureMessage({ committed: true, reconciled: false }))
      .toBe('Session was saved, but TabBoard could not locate it.');
  });
});
