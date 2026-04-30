import { Badge, Group, ScrollArea, Stack, Text, Title } from "@mantine/core";

import { StageColumnView } from "./StageColumnView";
import type { StageColumn } from "./types";

type EmailBoardProps = {
  columns: StageColumn[];
  onOpenEmail: (emailId: string) => void;
};

export function EmailBoard({ columns, onOpenEmail }: EmailBoardProps) {
  return (
    <ScrollArea className="boardScroll" type="auto">
      <Group className="boardTitle" justify="space-between">
        <Stack gap={2}>
          <Title order={2}>Email automation review</Title>
          <Text size="sm">
            Review onboarding emails using the same flow managers already know.
          </Text>
        </Stack>

        <Badge className="sequenceBadge" radius="sm">
          [Partners] Onboarding
        </Badge>
      </Group>

      <div className="board">
        {columns.map((column, columnIndex) => (
          <StageColumnView
            column={column}
            columnIndex={columnIndex}
            key={column.stage}
            onOpenEmail={onOpenEmail}
          />
        ))}
      </div>
    </ScrollArea>
  );
}
