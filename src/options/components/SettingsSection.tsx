import type { ReactNode } from 'react';
import { Stack, Text, Title } from '@mantine/core';

export function SettingsSection({
  children,
  description,
  title,
}: {
  children: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <section className="options-settings-section">
      <Stack gap="md">
        <div className="options-settings-section__heading">
          <Title order={2} size="h5">{title}</Title>
          <Text
            className="options-settings-section__description"
            size="sm"
            c="dimmed"
          >
            {description}
          </Text>
        </div>
        {children}
      </Stack>
    </section>
  );
}
