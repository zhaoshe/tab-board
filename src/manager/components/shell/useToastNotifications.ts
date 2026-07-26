import { useEffect, useMemo } from 'react';
import {
  applicationFeedbackChannel,
  type ApplicationFeedback,
} from '../../../shared/applicationFeedback';
import { useToast } from '../../hooks/useToast';

export interface FeedbackPresenter {
  showSuccess(message: string, title?: string): void;
  showError(message: string, title?: string): void;
}

export function presentApplicationFeedback(
  feedback: ApplicationFeedback,
  presenter: FeedbackPresenter,
): void {
  switch (feedback.kind) {
    case 'save-succeeded':
      presenter.showSuccess(
        `${feedback.tabCount} tab${feedback.tabCount === 1 ? '' : 's'} saved`,
        feedback.title,
      );
      return;
    case 'import-succeeded':
      presenter.showSuccess(
        `Imported ${feedback.groupCount} session${feedback.groupCount === 1 ? '' : 's'} (${feedback.tabCount} tabs)`,
        'Import successful',
      );
      return;
    case 'restore-succeeded':
      if (feedback.item === 'group') {
        presenter.showSuccess(
          `Restored ${feedback.count} tab${feedback.count === 1 ? '' : 's'}`,
          feedback.label,
        );
      } else {
        presenter.showSuccess('Tab restored', feedback.label);
      }
      return;
    case 'operation-failed':
      presenter.showError(feedback.message || 'Unable to save changes');
  }
}

export function useToastNotifications() {
  const { showSuccess, showError } = useToast();
  const presenter = useMemo<FeedbackPresenter>(
    () => ({ showSuccess, showError }),
    [showError, showSuccess],
  );

  useEffect(
    () => applicationFeedbackChannel.subscribe(
      (feedback) => presentApplicationFeedback(feedback, presenter),
    ),
    [presenter],
  );
}
