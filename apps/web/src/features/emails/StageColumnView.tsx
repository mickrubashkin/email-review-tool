import { type CSSProperties } from "react";
import { Badge, Group, Stack, Text } from "@mantine/core";

import { EmailCard } from "./EmailCard";
import { stageColors } from "./stages";
import type { StageColumn } from "./types";

type StageColumnViewProps = {
  column: StageColumn;
  columnIndex: number;
  onOpenEmail: (emailId: string) => void;
};

export function StageColumnView({
  column,
  columnIndex,
  onOpenEmail,
}: StageColumnViewProps) {
  return (
    <section className="stageColumn">
      <Group
        className="stageHeader"
        justify="space-between"
        style={
          {
            "--stage-color": stageColors[columnIndex % stageColors.length],
          } as CSSProperties
        }
      >
        <Stack gap={0}>
          <Text className="stageTitle" fw={700} size="sm">
            {column.title}
          </Text>
          <Text className="stageMeta" size="xs">
            Stage {Math.floor(column.sortOrder / 100) || 1}
          </Text>
        </Stack>
        <Badge className="stageCount" variant="default" radius="sm">
          {column.emails.length}
        </Badge>
      </Group>

      <Stack gap="sm">
        {column.emails.map((email) => (
          <EmailCard email={email} key={email.id} onOpen={onOpenEmail} />
        ))}
      </Stack>
    </section>
  );
}
