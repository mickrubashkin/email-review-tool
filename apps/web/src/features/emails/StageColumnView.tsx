import { type CSSProperties } from "react";
import { Badge, Group, Stack, Text } from "@mantine/core";

import { EmailCard } from "./EmailCard";
import { stageColors } from "./stages";
import type { EmailListItem, EmailReviewStatus, StageColumn } from "./types";
import styles from "./StageColumnView.module.css";

type StageColumnViewProps = {
  column: StageColumn;
  columnIndex: number;
  selectedVersionByGroup: Record<string, string>;
  sequenceEmails: EmailListItem[];
  onOpenVersionGroup: (groupKey: string, emailId: string) => void;
  onReviewStatusChange: (emailId: string, reviewStatus: EmailReviewStatus) => void;
  onSelectVersion: (groupKey: string, emailId: string) => void;
};

export function StageColumnView({
  column,
  columnIndex,
  selectedVersionByGroup,
  sequenceEmails,
  onOpenVersionGroup,
  onReviewStatusChange,
  onSelectVersion,
}: StageColumnViewProps) {
  return (
    <section className={styles.stageColumn}>
      <Group
        className={styles.stageHeader}
        justify="space-between"
        style={
          {
            "--stage-color": stageColors[columnIndex % stageColors.length],
          } as CSSProperties
        }
      >
        <Stack gap={0}>
          <Text className={styles.stageTitle} fw={700} size="sm">
            {column.title}
          </Text>
          {/* <Text className={styles.stageMeta} size="xs">
            Stage {Math.floor(column.sortOrder / 100) || 1}
          </Text> */}
        </Stack>
        <Badge className={styles.stageCount} variant="default" radius="sm">
          {column.emailGroups.length}
        </Badge>
      </Group>

      <Stack gap="sm">
        {column.emailGroups.map((emailGroup) => (
          <EmailCard
            emailGroup={emailGroup}
            key={emailGroup.key}
            selectedEmailId={selectedVersionByGroup[emailGroup.key]}
            sequenceEmails={sequenceEmails}
            onOpen={onOpenVersionGroup}
            onReviewStatusChange={onReviewStatusChange}
            onSelectVersion={onSelectVersion}
          />
        ))}
      </Stack>
    </section>
  );
}
