import { ScrollArea } from "@mantine/core";

import { StageColumnView } from "./StageColumnView";
import type { StageColumn } from "./types";
import styles from "./EmailBoard.module.css";

type EmailBoardProps = {
  columns: StageColumn[];
  selectedVersionByGroup: Record<string, string>;
  onOpenVersionGroup: (groupKey: string, emailId: string) => void;
  onSelectVersion: (groupKey: string, emailId: string) => void;
};

export function EmailBoard({
  columns,
  selectedVersionByGroup,
  onOpenVersionGroup,
  onSelectVersion,
}: EmailBoardProps) {
  return (
    <ScrollArea className={styles.boardScroll} type="auto">
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
