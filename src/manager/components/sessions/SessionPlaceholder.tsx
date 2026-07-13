import { Box } from '@mantine/core';

interface SessionPlaceholderProps {
  height?: number;
}

export function SessionPlaceholder({ height = 200 }: SessionPlaceholderProps) {
  return (
    <Box
      style={{
        height,
        border: '2px dashed var(--mantine-color-blue-4)',
        borderRadius: 'var(--mantine-radius-md)',
        backgroundColor: 'var(--mantine-color-blue-0)',
        opacity: 0.6,
      }}
    />
  );
}
