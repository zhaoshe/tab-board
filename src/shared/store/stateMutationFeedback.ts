import type { ApplicationFeedback } from '../applicationFeedback';
import type { StateMutation } from './stateMutations';

export function feedbackForCommittedMutation(
  mutation: StateMutation,
): ApplicationFeedback | null {
  switch (mutation.type) {
    case 'add-group':
      return {
        kind: 'save-succeeded',
        title: mutation.group.title,
        tabCount: mutation.group.tabs.length,
      };
    case 'import-groups':
      return {
        kind: 'import-succeeded',
        groupCount: mutation.groups.length,
        tabCount: mutation.groups.reduce(
          (sum, group) => sum + group.tabs.length,
          0,
        ),
      };
    case 'restore-group':
      return {
        kind: 'restore-succeeded',
        item: 'group',
        count: mutation.group.tabs.length,
        label: mutation.group.title,
      };
    case 'restore-tab':
      return {
        kind: 'restore-succeeded',
        item: 'tab',
        count: 1,
        label: mutation.tab.title,
      };
    default:
      return null;
  }
}
