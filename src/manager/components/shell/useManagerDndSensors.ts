import type { MutableRefObject } from 'react';
import {
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { createManagerKeyboardCoordinates } from './managerDndGeometry';

export function useManagerDndSensors(
  groupKeyboardIndexRef: MutableRefObject<number | null>,
) {
  const keyboardCoordinates = createManagerKeyboardCoordinates(
    groupKeyboardIndexRef,
  );
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: keyboardCoordinates,
    }),
  );
}
