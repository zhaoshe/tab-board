import { describe, expect, it } from 'vitest';
import {
  createApplicationFeedbackChannel,
  type ApplicationFeedback,
} from './applicationFeedback';

describe('ApplicationFeedbackChannel', () => {
  it('publishes synchronously to active subscribers and stops after unsubscribe', () => {
    const channel = createApplicationFeedbackChannel();
    const received: ApplicationFeedback[] = [];
    const unsubscribe = channel.subscribe((feedback) => received.push(feedback));

    channel.publish({
      kind: 'save-succeeded',
      title: 'Work',
      tabCount: 2,
    });
    unsubscribe();
    channel.publish({
      kind: 'operation-failed',
      source: 'persistence',
      message: 'late',
    });

    expect(received).toEqual([{
      kind: 'save-succeeded',
      title: 'Work',
      tabCount: 2,
    }]);
  });

  it('uses a listener snapshot when a subscriber unsubscribes during publish', () => {
    const channel = createApplicationFeedbackChannel();
    const received: string[] = [];
    let unsubscribeSecond: () => void = () => undefined;
    channel.subscribe(() => {
      received.push('first');
      unsubscribeSecond();
    });
    unsubscribeSecond = channel.subscribe(() => received.push('second'));

    channel.publish({
      kind: 'restore-succeeded',
      item: 'tab',
      count: 1,
      label: 'Example',
    });
    channel.publish({
      kind: 'restore-succeeded',
      item: 'tab',
      count: 1,
      label: 'Example',
    });

    expect(received).toEqual(['first', 'second', 'first']);
  });

  it('isolates throwing subscribers from persistence callers and later listeners', () => {
    const channel = createApplicationFeedbackChannel();
    const received: ApplicationFeedback[] = [];
    channel.subscribe(() => {
      throw new Error('toast failed');
    });
    channel.subscribe((feedback) => received.push(feedback));
    const feedback: ApplicationFeedback = {
      kind: 'import-succeeded',
      groupCount: 2,
      tabCount: 4,
    };

    expect(() => channel.publish(feedback)).not.toThrow();
    expect(received).toEqual([feedback]);
  });

  it('isolates channel instances', () => {
    const first = createApplicationFeedbackChannel();
    const second = createApplicationFeedbackChannel();
    const firstReceived: ApplicationFeedback[] = [];
    const secondReceived: ApplicationFeedback[] = [];
    first.subscribe((feedback) => firstReceived.push(feedback));
    second.subscribe((feedback) => secondReceived.push(feedback));

    first.publish({
      kind: 'operation-failed',
      source: 'import',
      message: 'invalid import',
    });

    expect(firstReceived).toHaveLength(1);
    expect(secondReceived).toEqual([]);
  });

  it('does not replay feedback to late subscribers', () => {
    const channel = createApplicationFeedbackChannel();
    const received: ApplicationFeedback[] = [];
    channel.publish({
      kind: 'save-succeeded',
      title: 'Before',
      tabCount: 1,
    });

    channel.subscribe((feedback) => received.push(feedback));

    expect(received).toEqual([]);
  });
});
