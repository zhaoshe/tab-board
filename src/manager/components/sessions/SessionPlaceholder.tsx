import type { CSSProperties } from 'react';
import { Box } from '@mantine/core';

interface SessionPlaceholderProps {
  style?: CSSProperties;
}

export function SessionPlaceholder({ style }: SessionPlaceholderProps) {
  return (
    <Box
      className="session-placeholder"
      aria-hidden="true"
      style={style}
    />
  );
}
