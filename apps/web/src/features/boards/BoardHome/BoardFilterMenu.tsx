import {
  ActionIcon,
  Badge,
  Menu,
  SegmentedControl,
  Select,
  TextInput,
} from "@mantine/core";
import {
  MagnifyingGlassIcon,
  SlidersHorizontalIcon,
  XIcon,
} from "@phosphor-icons/react";

import { emailReviewStatusOptions } from "../../emails/reviewStatus";

import type { BoardFilterOptions, BoardFilters } from "./BoardHome.types";
import styles from "../../../App.module.css";

export function BoardFilterMenu({
  activeBoardFilterCount,
  boardFilterOptions,
  boardFilters,
  hasBoardFilters,
  openCommentEmailCount,
  onBoardFilterChange,
  onResetBoardFilters,
}: {
  activeBoardFilterCount: number;
  boardFilterOptions: BoardFilterOptions;
  boardFilters: BoardFilters;
  hasBoardFilters: boolean;
  openCommentEmailCount: number;
  onBoardFilterChange: (key: keyof BoardFilters, value: string | null) => void;
  onResetBoardFilters: () => void;
}) {
  const filterButtonLabel =
    activeBoardFilterCount > 0
      ? `Filters ${activeBoardFilterCount}`
      : "Filters";

  return (
    <Menu position="bottom-end" width={270} shadow="md" withinPortal>
      <Menu.Target>
        <div className={styles.boardFilterButtonWrap}>
          <ActionIcon
            aria-label={filterButtonLabel}
            className={styles.boardFilterButton}
            size="lg"
            variant="white"
          >
            <SlidersHorizontalIcon aria-hidden="true" size={18} />
          </ActionIcon>
          {activeBoardFilterCount > 0 ? (
            <Badge
              className={styles.boardFilterBadge}
              color="blue"
              radius="xl"
              size="xs"
              variant="filled"
            >
              {activeBoardFilterCount}
            </Badge>
          ) : null}
        </div>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>Comments</Menu.Label>
        <BoardFilterControls
          boardFilterOptions={boardFilterOptions}
          boardFilters={boardFilters}
          commentLabel={`Open ${openCommentEmailCount}`}
          showLabels
          onBoardFilterChange={onBoardFilterChange}
        />

        {hasBoardFilters ? (
          <>
            <Menu.Divider />
            <Menu.Item color="red" onClick={onResetBoardFilters}>
              Clear filters
            </Menu.Item>
          </>
        ) : null}
      </Menu.Dropdown>
    </Menu>
  );
}

export function BoardFilterControls({
  boardFilterOptions,
  boardFilters,
  commentLabel,
  showLabels = false,
  onBoardFilterChange,
}: {
  boardFilterOptions: BoardFilterOptions;
  boardFilters: BoardFilters;
  commentLabel: string;
  showLabels?: boolean;
  onBoardFilterChange: (key: keyof BoardFilters, value: string | null) => void;
}) {
  return (
    <>
      <div className={styles.boardFilterMenuControl}>
        <SegmentedControl
          data={[
            { label: "All", value: "all" },
            { label: commentLabel, value: "open" },
          ]}
          fullWidth
          size="xs"
          value={boardFilters.comments}
          onChange={(value) => onBoardFilterChange("comments", value)}
        />
      </div>
      <BoardFilterSelect
        data={boardFilterOptions.languages}
        label="Language"
        placeholder="All languages"
        showLabel={showLabels}
        value={boardFilters.language}
        onChange={(value) => onBoardFilterChange("language", value)}
      />
      <BoardFilterSelect
        data={boardFilterOptions.adaptations}
        label="Adaptation"
        placeholder="All adaptations"
        showLabel={showLabels}
        value={boardFilters.adaptation}
        onChange={(value) => onBoardFilterChange("adaptation", value)}
      />
      <BoardFilterSelect
        data={boardFilterOptions.variants}
        label="Version"
        placeholder="All versions"
        showLabel={showLabels}
        value={boardFilters.variant}
        onChange={(value) => onBoardFilterChange("variant", value)}
      />
      <BoardFilterSelect
        data={boardFilterOptions.owners}
        label="Owner"
        placeholder="All owners"
        showLabel={showLabels}
        value={boardFilters.owner}
        onChange={(value) => onBoardFilterChange("owner", value)}
      />
      <BoardFilterSelect
        data={boardFilterOptions.reviewers}
        label="Reviewer"
        placeholder="All reviewers"
        showLabel={showLabels}
        value={boardFilters.reviewer}
        onChange={(value) => onBoardFilterChange("reviewer", value)}
      />
      <BoardFilterSelect
        data={emailReviewStatusOptions}
        label="Status"
        placeholder="All statuses"
        showLabel={showLabels}
        value={boardFilters.status}
        onChange={(value) => onBoardFilterChange("status", value)}
      />
    </>
  );
}

function BoardFilterSelect({
  data,
  label,
  placeholder,
  showLabel,
  value,
  onChange,
}: {
  data: Array<{ label: string; value: string }>;
  label: string;
  placeholder: string;
  showLabel: boolean;
  value: string;
  onChange: (value: string | null) => void;
}) {
  return (
    <>
      {showLabel ? <Menu.Label>{label}</Menu.Label> : null}
      <div className={styles.boardFilterMenuControl}>
        <Select
          clearable
          data={data}
          placeholder={placeholder}
          size="xs"
          value={value || null}
          onChange={onChange}
        />
      </div>
    </>
  );
}

export function BoardSearchInput({
  boardSearchQuery,
  size,
  onBoardSearchQueryChange,
}: {
  boardSearchQuery: string;
  size: "xs" | "sm";
  onBoardSearchQueryChange: (query: string) => void;
}) {
  return (
    <TextInput
      className={size === "sm" ? styles.boardSearch : undefined}
      leftSection={<MagnifyingGlassIcon aria-hidden="true" size={16} />}
      placeholder="Search emails"
      size={size}
      value={boardSearchQuery}
      rightSection={
        boardSearchQuery ? (
          <ActionIcon
            aria-label="Clear search"
            size={size}
            variant="subtle"
            onClick={() => onBoardSearchQueryChange("")}
          >
            <XIcon aria-hidden="true" size={size === "sm" ? 14 : 12} />
          </ActionIcon>
        ) : null
      }
      onChange={(event) => onBoardSearchQueryChange(event.currentTarget.value)}
    />
  );
}
