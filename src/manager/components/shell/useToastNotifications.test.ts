// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applicationFeedbackChannel,
  type ApplicationFeedback,
} from '../../../shared/applicationFeedback';
import {
  presentApplicationFeedback,
  useToastNotifications,
  type FeedbackPresenter,
} from './useToastNotifications';

const testHarness = vi.hoisted(() => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

vi.mock('../../hooks/useToast', () => ({
  useToast: () => ({
    showError: testHarness.showError,
    showSuccess: testHarness.showSuccess,
  }),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function NotificationProbe(): null {
  useToastNotifications();
  return null;
}

function presenter(): FeedbackPresenter {
  return {
    showError: testHarness.showError,
    showSuccess: testHarness.showSuccess,
  };
}

beforeEach(() => {
  testHarness.showError.mockReset();
  testHarness.showSuccess.mockReset();
  container = document.createElement('div');
  document.body.append(container);
});

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
  }
  root = null;
  container?.remove();
  container = null;
});

describe('presentApplicationFeedback', () => {
  it.each<{
    feedback: ApplicationFeedback;
    success?: [string, string];
    error?: [string];
  }>([
    {
      feedback: { kind: 'save-succeeded', title: 'Work', tabCount: 2 },
      success: ['2 tabs saved', 'Work'],
    },
    {
      feedback: { kind: 'import-succeeded', groupCount: 2, tabCount: 4 },
      success: ['Imported 2 sessions (4 tabs)', 'Import successful'],
    },
    {
      feedback: {
        kind: 'restore-succeeded',
        item: 'group',
        count: 2,
        label: 'Recovered work',
      },
      success: ['Restored 2 tabs', 'Recovered work'],
    },
    {
      feedback: {
        kind: 'restore-succeeded',
        item: 'tab',
        count: 1,
        label: 'Recovered tab',
      },
      success: ['Tab restored', 'Recovered tab'],
    },
    {
      feedback: {
        kind: 'operation-failed',
        source: 'persistence',
        message: 'Unable to save changes',
      },
      error: ['Unable to save changes'],
    },
  ])('maps $feedback.kind to the existing toast copy', ({
    feedback,
    success,
    error,
  }) => {
    presentApplicationFeedback(feedback, presenter());

    if (success) {
      expect(testHarness.showSuccess).toHaveBeenCalledWith(...success);
      expect(testHarness.showError).not.toHaveBeenCalled();
    } else if (error) {
      expect(testHarness.showError).toHaveBeenCalledWith(...error);
      expect(testHarness.showSuccess).not.toHaveBeenCalled();
    }
  });
});

describe('useToastNotifications', () => {
  it('subscribes while mounted and stops presenting after unmount', async () => {
    root = createRoot(container!);
    await act(async () => {
      root?.render(createElement(NotificationProbe));
    });

    await act(async () => {
      applicationFeedbackChannel.publish({
        kind: 'save-succeeded',
        title: 'Mounted',
        tabCount: 1,
      });
    });
    expect(testHarness.showSuccess).toHaveBeenCalledWith(
      '1 tab saved',
      'Mounted',
    );

    await act(async () => root?.unmount());
    root = null;
    testHarness.showSuccess.mockClear();
    applicationFeedbackChannel.publish({
      kind: 'save-succeeded',
      title: 'Unmounted',
      tabCount: 1,
    });

    expect(testHarness.showSuccess).not.toHaveBeenCalled();
  });
});
