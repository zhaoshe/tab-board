export type ApplicationFeedback =
  | {
      kind: 'save-succeeded';
      title: string;
      tabCount: number;
    }
  | {
      kind: 'import-succeeded';
      groupCount: number;
      tabCount: number;
    }
  | {
      kind: 'restore-succeeded';
      item: 'group' | 'tab';
      count: number;
      label: string;
    }
  | {
      kind: 'operation-failed';
      source: 'persistence' | 'import';
      message: string;
    };

export interface ApplicationFeedbackChannel {
  publish(feedback: ApplicationFeedback): void;
  subscribe(
    listener: (feedback: ApplicationFeedback) => void,
  ): () => void;
}

export function createApplicationFeedbackChannel():
ApplicationFeedbackChannel {
  const listeners = new Set<(feedback: ApplicationFeedback) => void>();

  const publish = (feedback: ApplicationFeedback) => {
    for (const listener of [...listeners]) {
      try {
        listener(feedback);
      } catch {
      }
    }
  };
  const subscribe = (listener: (feedback: ApplicationFeedback) => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  return { publish, subscribe };
}

export const applicationFeedbackChannel = createApplicationFeedbackChannel();
