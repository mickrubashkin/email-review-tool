import { ScrollArea } from "@mantine/core";

import { StageColumnView } from "./StageColumnView";
import type { EmailReviewStatus, StageColumn } from "./types";
import styles from "./EmailBoard.module.css";

type EmailBoardProps = {
  columns: StageColumn[];
  scrollPosition: { x: number; y: number };
  selectedVersionByGroup: Record<string, string>;
  onOpenVersionGroup: (groupKey: string, emailId: string) => void;
  onReviewStatusChange: (emailId: string, reviewStatus: EmailReviewStatus) => void;
  onScrollPositionChange: (position: { x: number; y: number }) => void;
  onSelectVersion: (groupKey: string, emailId: string) => void;
};

export function EmailBoard({
  columns,
  scrollPosition,
  selectedVersionByGroup,
  onOpenVersionGroup,
  onReviewStatusChange,
  onScrollPositionChange,
  onSelectVersion,
}: EmailBoardProps) {
  const sequenceEmails = columns.flatMap((column) =>
    column.emailGroups.flatMap((group) => group.versions)
  );

  return (
    <ScrollArea
      className={styles.boardScroll}
      onScrollPositionChange={onScrollPositionChange}
      startScrollPosition={scrollPosition}
      type="auto"
    >
      <div className={styles.board}>
        {columns.map((column, columnIndex) => (
          <StageColumnView
            column={column}
            columnIndex={columnIndex}
            key={column.stage}
            selectedVersionByGroup={selectedVersionByGroup}
            sequenceEmails={sequenceEmails}
            onOpenVersionGroup={onOpenVersionGroup}
            onReviewStatusChange={onReviewStatusChange}
            onSelectVersion={onSelectVersion}
          />
        ))}
      </div>
    </ScrollArea>
  );
}
