import type { Dispatch, SetStateAction } from "react";
import {
  Burger,
  Group,
  Menu,
  ScrollArea,
  Select,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import {
  KanbanIcon,
  SignOutIcon,
  SlidersHorizontalIcon,
} from "@phosphor-icons/react";

import type { AuthUser, Board } from "../../emails/types";

import {
  BoardFilterControls,
  BoardFilterMenu,
  BoardSearchInput,
} from "./BoardFilterMenu";
import {
  type BoardFilterOptions,
  type BoardFilters,
  type HandoffFilters,
} from "./BoardHome.types";
import {
  AccountMenu,
  CreateActions,
  OperationsMenuItems,
  SettingsMenu,
  UserMenuLabel,
} from "./BoardUserMenus";
import { HandoffMenuContent } from "./HandoffMenu";
import styles from "../../../App.module.css";

type BoardHeaderProps = {
  activeBoard: Board | undefined;
  activeBoardFilterCount: number;
  activeHandoffFilterCount: number;
  boardFilterOptions: BoardFilterOptions;
  boardFilters: BoardFilters;
  boardKey: string;
  boardSearchQuery: string;
  boards: Board[];
  boardsLoading: boolean;
  canExportSequenceHandoff: boolean;
  currentUser: AuthUser;
  handoffFilters: HandoffFilters;
  hasBoardFilters: boolean;
  headerSubtitle: string;
  isAdmin: boolean;
  isCompactHeader: boolean;
  isLoggingOut: boolean;
  openCommentEmailCount: number;
  sequenceHandoffEmailCount: number;
  sequenceHandoffJSON: string;
  userMenuOpened: boolean;
  onBoardChange: (value: string | null) => void;
  onBoardFilterChange: (key: keyof BoardFilters, value: string | null) => void;
  onBoardSearchQueryChange: (query: string) => void;
  onCreateBoard: () => void;
  onHandoffFiltersChange: Dispatch<SetStateAction<HandoffFilters>>;
  onLogout: () => void;
  onManageStages: () => void;
  onResetBoardFilters: () => void;
  onUserMenuOpenedChange: (opened: boolean) => void;
};

export function BoardHeader({
  activeBoard,
  activeBoardFilterCount,
  activeHandoffFilterCount,
  boardFilterOptions,
  boardFilters,
  boardKey,
  boardSearchQuery,
  boards,
  boardsLoading,
  canExportSequenceHandoff,
  currentUser,
  handoffFilters,
  hasBoardFilters,
  headerSubtitle,
  isAdmin,
  isCompactHeader,
  isLoggingOut,
  openCommentEmailCount,
  sequenceHandoffEmailCount,
  sequenceHandoffJSON,
  userMenuOpened,
  onBoardChange,
  onBoardFilterChange,
  onBoardSearchQueryChange,
  onCreateBoard,
  onHandoffFiltersChange,
  onLogout,
  onManageStages,
  onResetBoardFilters,
  onUserMenuOpenedChange,
}: BoardHeaderProps) {
  const boardOptions = boards.map((board) => ({
    label: board.name,
    value: board.key,
  }));

  return (
    <Group className={styles.headerInner} h="100%" px="md" wrap="nowrap">
      <Stack className={styles.headerBrand} gap={0}>
        <Title className={styles.headerTitle} order={4}>
          ReviewDesk
        </Title>
        <Text className={styles.headerSubtitle} size="xs">
          {headerSubtitle}
        </Text>
      </Stack>

      {isCompactHeader ? (
        <CompactHeaderMenu
          activeBoard={activeBoard}
          activeHandoffFilterCount={activeHandoffFilterCount}
          boardFilterOptions={boardFilterOptions}
          boardFilters={boardFilters}
          boardKey={boardKey}
          boardOptions={boardOptions}
          boardSearchQuery={boardSearchQuery}
          boardsLoading={boardsLoading}
          canExportSequenceHandoff={canExportSequenceHandoff}
          currentUser={currentUser}
          handoffFilters={handoffFilters}
          hasBoardFilters={hasBoardFilters}
          isAdmin={isAdmin}
          isLoggingOut={isLoggingOut}
          openCommentEmailCount={openCommentEmailCount}
          sequenceHandoffEmailCount={sequenceHandoffEmailCount}
          sequenceHandoffJSON={sequenceHandoffJSON}
          userMenuOpened={userMenuOpened}
          onBoardChange={onBoardChange}
          onBoardFilterChange={onBoardFilterChange}
          onBoardSearchQueryChange={onBoardSearchQueryChange}
          onCreateBoard={onCreateBoard}
          onHandoffFiltersChange={onHandoffFiltersChange}
          onLogout={onLogout}
          onManageStages={onManageStages}
          onResetBoardFilters={onResetBoardFilters}
          onUserMenuOpenedChange={onUserMenuOpenedChange}
        />
      ) : (
        <>
          <Group className={styles.boardControls} gap="xs" wrap="nowrap">
            <Select
              allowDeselect={false}
              className={styles.boardSelect}
              data={boardOptions}
              disabled={boardsLoading}
              leftSection={<KanbanIcon aria-hidden="true" size={16} />}
              size="sm"
              value={activeBoard?.key ?? null}
              onChange={onBoardChange}
            />
            <BoardFilterMenu
              activeBoardFilterCount={activeBoardFilterCount}
              boardFilterOptions={boardFilterOptions}
              boardFilters={boardFilters}
              hasBoardFilters={hasBoardFilters}
              openCommentEmailCount={openCommentEmailCount}
              onBoardFilterChange={onBoardFilterChange}
              onResetBoardFilters={onResetBoardFilters}
            />
            <BoardSearchInput
              boardSearchQuery={boardSearchQuery}
              size="sm"
              onBoardSearchQueryChange={onBoardSearchQueryChange}
            />
          </Group>

          <Group className={styles.headerActions} gap="xs" wrap="nowrap">
            {isAdmin ? (
              <SettingsMenu
                currentUser={currentUser}
                onCreateBoard={onCreateBoard}
                onManageStages={onManageStages}
              />
            ) : null}

            <AccountMenu
              activeBoard={activeBoard}
              activeHandoffFilterCount={activeHandoffFilterCount}
              boardFilterOptions={boardFilterOptions}
              boardKey={boardKey}
              canExportSequenceHandoff={canExportSequenceHandoff}
              currentUser={currentUser}
              handoffFilters={handoffFilters}
              isLoggingOut={isLoggingOut}
              sequenceHandoffEmailCount={sequenceHandoffEmailCount}
              sequenceHandoffJSON={sequenceHandoffJSON}
              onHandoffFiltersChange={onHandoffFiltersChange}
              onLogout={onLogout}
            />
          </Group>
        </>
      )}
    </Group>
  );
}

function CompactHeaderMenu({
  activeBoard,
  activeHandoffFilterCount,
  boardFilterOptions,
  boardFilters,
  boardKey,
  boardOptions,
  boardSearchQuery,
  boardsLoading,
  canExportSequenceHandoff,
  currentUser,
  handoffFilters,
  hasBoardFilters,
  isAdmin,
  isLoggingOut,
  openCommentEmailCount,
  sequenceHandoffEmailCount,
  sequenceHandoffJSON,
  userMenuOpened,
  onBoardChange,
  onBoardFilterChange,
  onBoardSearchQueryChange,
  onCreateBoard,
  onHandoffFiltersChange,
  onLogout,
  onManageStages,
  onResetBoardFilters,
  onUserMenuOpenedChange,
}: Omit<
  BoardHeaderProps,
  | "activeBoardFilterCount"
  | "boards"
  | "headerSubtitle"
  | "isCompactHeader"
> & {
  boardOptions: Array<{ label: string; value: string }>;
}) {
  return (
    <Group className={styles.headerActions} gap="sm" wrap="nowrap">
      <Menu
        opened={userMenuOpened}
        position="bottom-end"
        width={260}
        withinPortal
        onChange={onUserMenuOpenedChange}
      >
        <Menu.Target>
          <Burger
            aria-label="Open user menu"
            color="white"
            opened={userMenuOpened}
            size="sm"
          />
        </Menu.Target>
        <Menu.Dropdown className={styles.compactHeaderDropdown} p={0}>
          <ScrollArea.Autosize
            mah="calc(100dvh - var(--app-shell-header-height) - 24px)"
            offsetScrollbars="y"
            overscrollBehavior="contain"
            scrollbars="y"
            type="auto"
          >
            <Menu.Label>Current board</Menu.Label>
            <div className={styles.boardFilterMenuControl}>
              <Select
                data={boardOptions}
                disabled={boardsLoading}
                size="xs"
                value={activeBoard?.key ?? null}
                onChange={onBoardChange}
              />
            </div>
            <Menu.Label>Search</Menu.Label>
            <div className={styles.boardFilterMenuControl}>
              <BoardSearchInput
                boardSearchQuery={boardSearchQuery}
                size="xs"
                onBoardSearchQueryChange={onBoardSearchQueryChange}
              />
            </div>
            <Menu.Label>Filters</Menu.Label>
            <BoardFilterControls
              boardFilterOptions={boardFilterOptions}
              boardFilters={boardFilters}
              commentLabel={`Open comments ${openCommentEmailCount}`}
              onBoardFilterChange={onBoardFilterChange}
            />
            {hasBoardFilters ? (
              <Menu.Item color="red" onClick={onResetBoardFilters}>
                Clear filters
              </Menu.Item>
            ) : null}
            <Menu.Divider />
            <HandoffMenuContent
              activeBoard={activeBoard}
              activeHandoffFilterCount={activeHandoffFilterCount}
              boardFilterOptions={boardFilterOptions}
              boardKey={boardKey}
              canExportSequenceHandoff={canExportSequenceHandoff}
              handoffFilters={handoffFilters}
              sequenceHandoffEmailCount={sequenceHandoffEmailCount}
              sequenceHandoffJSON={sequenceHandoffJSON}
              onHandoffFiltersChange={onHandoffFiltersChange}
            />
            <Menu.Divider />
            <UserMenuLabel currentUser={currentUser} />
            {isAdmin ? (
              <>
                <Menu.Divider />
                <Menu.Label>Settings</Menu.Label>
                <CreateActions onCreateBoard={onCreateBoard} />
                <Menu.Item
                  leftSection={
                    <SlidersHorizontalIcon aria-hidden="true" size={16} />
                  }
                  onClick={onManageStages}
                >
                  Board settings
                </Menu.Item>
                <Menu.Divider />
                <OperationsMenuItems currentUser={currentUser} />
              </>
            ) : null}
            <Menu.Divider />
            <Menu.Item
              color="red"
              leftSection={<SignOutIcon aria-hidden="true" size={16} />}
              onClick={onLogout}
            >
              {isLoggingOut ? "Logging out" : "Logout"}
            </Menu.Item>
          </ScrollArea.Autosize>
        </Menu.Dropdown>
      </Menu>
    </Group>
  );
}
