import { Badge, Card, Group, Stack, Text, UnstyledButton } from "@mantine/core";

import type { EmailListItem } from "./types";

type EmailCardProps = {
  email: EmailListItem;
  onOpen: (emailId: string) => void;
};

export function EmailCard({ email, onOpen }: EmailCardProps) {
  return (
    <UnstyledButton
      className="emailCardButton"
      key={email.id}
      onClick={() => onOpen(email.id)}
    >
      <Card className="emailCard" withBorder padding="md" radius="md">
        <Stack gap={6}>
          <Group justify="space-between" gap="xs">
            <Text className="emailCardTitle" fw={600} size="sm" lineClamp={2}>
              {email.title}
            </Text>
            <Badge size="xs" variant="light" radius="sm">
              {email.language}
            </Badge>
          </Group>

          {email.subject ? (
            <Text size="sm" c="dimmed" lineClamp={2}>
              {email.subject}
            </Text>
          ) : null}

          {email.preheader ? (
            <Text size="xs" c="dimmed" lineClamp={2}>
              {email.preheader}
            </Text>
          ) : null}

          <Group className="emailCardFooter" justify="space-between">
            <Text size="xs">preview</Text>
            <Text size="xs">open</Text>
          </Group>
        </Stack>
      </Card>
    </UnstyledButton>
  );
}
