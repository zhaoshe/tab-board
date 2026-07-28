import type { ReactNode } from 'react';
import { Stack, Text, Title } from '@mantine/core';

export function SettingsSection({
  children,
  description,
  icon,
  title,
}: {
  children: ReactNode;
  description: string;
  icon?: ReactNode;
  title: string;
}) {
  return (
    <section className="options-settings-section">
      <Stack gap="md">
        <div>
          <div className="options-settings-section__heading">
            {icon}
            <Title order={2} size="h5">{title}</Title>
          </div>
          <Text size="sm" c="dimmed">{description}</Text>
        </div>
        {children}
      </Stack>
    </section>
  );
}
