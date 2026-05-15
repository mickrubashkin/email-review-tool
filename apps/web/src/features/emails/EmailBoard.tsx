import { ScrollArea } from "@mantine/core";

import { StageColumnView } from "./StageColumnView";
import type { StageColumn } from "./types";
import styles from "./EmailBoard.module.css";

type EmailBoardProps = {
  columns: StageColumn[];
  scrollPosition: { x: number; y: number };
  selectedVersionByGroup: Record<string, string>;
  onOpenVersionGroup: (groupKey: string, emailId: string) => void;
  onScrollPositionChange: (position: { x: number; y: number }) => void;
  onSelectVersion: (groupKey: string, emailId: string) => void;
};

export function EmailBoard({
  columns,
  scrollPosition,
  selectedVersionByGroup,
  onOpenVersionGroup,
  onScrollPositionChange,
  onSelectVersion,
}: EmailBoardProps) {
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
            onOpenVersionGroup={onOpenVersionGroup}
            onSelectVersion={onSelectVersion}
          />
        ))}
      </div>
    </ScrollArea>
  );
}
