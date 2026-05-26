import {
  type Dispatch,
  type SetStateAction,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Alert,
  AppShell,
  Box,
  Loader,
  Stack,
  Text,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Navigate, useNavigate, useParams } from "react-router-dom";

import {
  ApiError,
  createBoard,
  fetchBoards,
  fetchEmails,
  updateEmailReviewStatus,
} from "../../emails/api";
import { EmailBoard } from "../../emails/EmailBoard";
import {
  formatEmailReviewStatus,
} from "../../emails/reviewStatus";
import { buildStageColumns } from "../../emails/stages";
import type {
  AuthUser,
  CreateBoardPayload,
  EmailReviewStatus,
} from "../../emails/types";

import {
  applyReviewStatusToBoardCaches,
  buildSequenceHandoffManifest,
  filterColumnsByBoardFilters,
  filterColumnsBySearch,
  filterEmailsByHandoffFilters,
  getActiveBoardFilterCount,
  getActiveHandoffFilterCount,
  getBoardFilterOptions,
} from "./BoardHome.helpers";
import {
  boardFilterStorageKey,
  boardScrollPositionStorageKey,
  boardSearchStorageKey,
  boardSelectedVersionsStorageKey,
  defaultBoardFilters,
  defaultHandoffFilters,
  type BoardFilters,
  type HandoffFilters,
} from "./BoardHome.types";
import {
  readStoredBoardFilters,
  readStoredBoardScrollPosition,
  readStoredBoardSearch,
  readStoredSelectedVersions,
  writeSessionStorageValue,
} from "./BoardHome.storage";
import { BoardHeader } from "./BoardHeader";
import { CreateBoardModal } from "./CreateBoardModal";
import { ManageStagesModal } from "./ManageStagesModal";
import styles from "../../../App.module.css";

export function BoardHomeRedirect() {
  const boardsQuery = useQuery({
    queryKey: ["boards"],
    queryFn: fetchBoards,
  });

  if (boardsQuery.isLoading) {
    return (
      <Stack align="center" justify="center" h="100dvh">
        <Loader />
        <Text c="dimmed">Loading boards</Text>
      </Stack>
    );
  }

  if (boardsQuery.isError || !boardsQuery.data || boardsQuery.data.length === 0) {
    return (
      <Stack align="center" justify="center" h="100dvh" p="md">
        <Alert color="red" title="Failed to load boards">
          Check that the API server is reachable.
        </Alert>
      </Stack>
    );
  }

  const preferredBoard =
    boardsQuery.data.find((board) => board.key === "onboarding") ??
    boardsQuery.data[0];

  return <Navigate replace to={`/boards/${encodeURIComponent(preferredBoard.key)}`} />;
}

export function EmailBoardRoute({
  currentUser,
  isLoggingOut,
  onLogout,
}: {
  currentUser: AuthUser;
  isLoggingOut: boolean;
  onLogout: () => void;
}) {
  const { boardKey } = useParams();
  const [selectedVersionByGroup, setSelectedVersionByGroup] = useState<
    Record<string, string>
  >(readStoredSelectedVersions);
  const [boardScrollPosition, setBoardScrollPosition] = useState(
    readStoredBoardScrollPosition
  );
  const [boardFilters, setBoardFilters] = useState<BoardFilters>(
    readStoredBoardFilters
  );
  const [boardSearchQuery, setBoardSearchQuery] = useState(readStoredBoardSearch);
  useEffect(() => {
    writeSessionStorageValue(
      boardSelectedVersionsStorageKey,
      selectedVersionByGroup
    );
  }, [selectedVersionByGroup]);
  useEffect(() => {
    writeSessionStorageValue(boardScrollPositionStorageKey, boardScrollPosition);
  }, [boardScrollPosition]);
  useEffect(() => {
    writeSessionStorageValue(boardFilterStorageKey, boardFilters);
  }, [boardFilters]);
  useEffect(() => {
    writeSessionStorageValue(boardSearchStorageKey, boardSearchQuery);
  }, [boardSearchQuery]);

  return boardKey ? (
    <EmailBoardApp
      boardFilters={boardFilters}
      boardKey={boardKey}
      boardScrollPosition={boardScrollPosition}
      boardSearchQuery={boardSearchQuery}
      currentUser={currentUser}
      isLoggingOut={isLoggingOut}
      selectedVersionByGroup={selectedVersionByGroup}
      onLogout={onLogout}
      onBoardScrollPositionChange={setBoardScrollPosition}
      onBoardFiltersChange={setBoardFilters}
      onBoardSearchQueryChange={setBoardSearchQuery}
      onSelectedVersionByGroupChange={setSelectedVersionByGroup}
    />
  ) : (
    <Navigate replace to="/" />
  );
}

function EmailBoardApp({
  boardFilters,
  boardKey,
  boardScrollPosition,
  boardSearchQuery,
  currentUser,
  isLoggingOut,
  selectedVersionByGroup,
  onLogout,
  onBoardScrollPositionChange,
  onBoardFiltersChange,
  onBoardSearchQueryChange,
  onSelectedVersionByGroupChange,
}: {
  boardFilters: BoardFilters;
  boardKey: string;
  boardScrollPosition: { x: number; y: number };
  boardSearchQuery: string;
  currentUser: AuthUser;
  isLoggingOut: boolean;
  selectedVersionByGroup: Record<string, string>;
  onLogout: () => void;
  onBoardScrollPositionChange: (position: { x: number; y: number }) => void;
  onBoardFiltersChange: (filters: BoardFilters) => void;
  onBoardSearchQueryChange: (query: string) => void;
  onSelectedVersionByGroupChange: Dispatch<
    SetStateAction<Record<string, string>>
  >;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [userMenuOpened, setUserMenuOpened] = useState(false);
  const [createBoardModalOpened, setCreateBoardModalOpened] = useState(false);
  const [manageStagesModalOpened, setManageStagesModalOpened] = useState(false);
  const [handoffFilters, setHandoffFilters] =
    useState<HandoffFilters>(defaultHandoffFilters);
  const isCompactHeader = useMediaQuery("(max-width: 64em)");
  const isAdmin =
    currentUser.role === "admin" || currentUser.role === "super_admin";

  const boardsQuery = useQuery({
    queryKey: ["boards"],
    queryFn: fetchBoards,
  });
  const emailsQuery = useQuery({
    queryKey: ["emails", boardKey],
    queryFn: () => fetchEmails(boardKey),
    enabled: boardKey.trim() !== "",
  });
  const createBoardMutation = useMutation({
    mutationFn: (payload: CreateBoardPayload) => createBoard(payload),
    onSuccess: (board) => {
      void queryClient.invalidateQueries({ queryKey: ["boards"] });
      setCreateBoardModalOpened(false);
      navigate(`/boards/${encodeURIComponent(board.key)}`);
    },
  });
  const reviewStatusMutation = useMutation({
    mutationFn: ({
      emailId,
      reviewStatus,
    }: {
      emailId: string;
      reviewStatus: EmailReviewStatus;
    }) =>
      updateEmailReviewStatus(emailId, {
        review_status: reviewStatus,
      }),
    onSuccess: (response, variables) => {
      applyReviewStatusToBoardCaches(
        queryClient,
        boardKey,
        variables.emailId,
        response.review_status
      );
      notifications.show({
        color: "green",
        message: `Review status changed to ${formatEmailReviewStatus(response.review_status)}.`,
        title: "Status updated",
      });
    },
    onError: (error) => {
      notifications.show({
        color: "red",
        message:
          error instanceof ApiError && error.status === 409
            ? "Resolve blocking comments before approval."
            : "Try again or check that you have admin access.",
        title:
          error instanceof ApiError && error.status === 409
            ? "Approval blocked"
            : "Status update failed",
      });
    },
  });
  const refreshBoardData = () => {
    void queryClient.invalidateQueries({ queryKey: ["boards"] });
    void queryClient.invalidateQueries({ queryKey: ["emails", boardKey] });
  };
  const boards = boardsQuery.data ?? [];
  const activeBoard = boards.find((board) => board.key === boardKey);

  const columns = useMemo(
    () => buildStageColumns(emailsQuery.data ?? [], activeBoard?.stages ?? []),
    [activeBoard?.stages, emailsQuery.data]
  );
  const searchQuery = boardSearchQuery.trim();
  const searchedColumns = useMemo(
    () => filterColumnsBySearch(columns, searchQuery),
    [columns, searchQuery]
  );
  const boardFilterOptions = useMemo(
    () => getBoardFilterOptions(emailsQuery.data ?? []),
    [emailsQuery.data]
  );
  const openCommentEmailCount = useMemo(
    () =>
      (emailsQuery.data ?? []).filter(
        (email) => (email.open_comment_count ?? 0) > 0
      ).length,
    [emailsQuery.data]
  );
  const visibleColumns = useMemo(
    () => filterColumnsByBoardFilters(searchedColumns, boardFilters),
    [boardFilters, searchedColumns]
  );
  const handoffEmails = useMemo(
    () => filterEmailsByHandoffFilters(emailsQuery.data ?? [], handoffFilters),
    [emailsQuery.data, handoffFilters]
  );
  const sequenceHandoffManifest = useMemo(
    () =>
      buildSequenceHandoffManifest(
        activeBoard?.key ?? boardKey,
        activeBoard?.name ?? boardKey,
        handoffEmails
      ),
    [activeBoard?.key, activeBoard?.name, boardKey, handoffEmails]
  );
  const sequenceHandoffJSON = useMemo(
    () => JSON.stringify(sequenceHandoffManifest, null, 2),
    [sequenceHandoffManifest]
  );
  const activeBoardFilterCount = getActiveBoardFilterCount(boardFilters);
  const updateBoardFilter = (key: keyof BoardFilters, value: string | null) => {
    onBoardFiltersChange({
      ...boardFilters,
      [key]: value ?? "",
    });
  };
  const resetBoardFilters = () => {
    onBoardFiltersChange(defaultBoardFilters);
  };
  const hasBoardFilters = activeBoardFilterCount > 0;
  const activeHandoffFilterCount = getActiveHandoffFilterCount(handoffFilters);
  const canExportSequenceHandoff = sequenceHandoffManifest.email_count > 0;
  const filterEmptyState =
    searchQuery || hasBoardFilters ? "No matching emails" : "No emails on this board";
  const filterEmptyHint = searchQuery
    ? "Try another search or clear the query."
    : hasBoardFilters
      ? "Clear filters to browse the full sequence."
      : "Create or import an email to start reviewing.";
  const visibleGroupCount = visibleColumns.reduce(
    (count, column) => count + column.emailGroups.length,
    0
  );
  const totalGroupCount = columns.reduce(
    (count, column) => count + column.emailGroups.length,
    0
  );
  const preferredBoard =
    boards.find((board) => board.key === "onboarding") ?? boards[0];
  const headerSubtitle = searchQuery
    ? `${activeBoard?.name ?? "Board review"} · ${visibleGroupCount} of ${totalGroupCount} matches`
    : `${activeBoard?.name ?? "Board review"} · ${emailsQuery.data?.length ?? 0} emails`;
  if (boardsQuery.isSuccess && !activeBoard && preferredBoard) {
    return <Navigate replace to={`/boards/${encodeURIComponent(preferredBoard.key)}`} />;
  }

  const handleSelectVersion = (groupKey: string, emailId: string) => {
    onSelectedVersionByGroupChange((current) => ({
      ...current,
      [groupKey]: emailId,
    }));
  };

  const handleOpenVersionGroup = (_groupKey: string, emailId: string) => {
    navigate(`/emails/${encodeURIComponent(emailId)}/review`);
  };
  const handleReviewStatusChange = (
    emailId: string,
    reviewStatus: EmailReviewStatus
  ) => {
    const targetEmail = (emailsQuery.data ?? []).find((email) => email.id === emailId);
    if (
      reviewStatus === "approved" &&
      targetEmail &&
      (targetEmail.open_blocking_comment_count ?? 0) > 0
    ) {
      notifications.show({
        color: "red",
        message: "Resolve blocking comments before approval.",
        title: "Approval blocked",
      });
      return;
    }

    reviewStatusMutation.mutate({ emailId, reviewStatus });
  };
  const handleBoardChange = (value: string | null) => {
    if (value) {
      navigate(`/boards/${encodeURIComponent(value)}`);
    }
  };

  return (
    <AppShell header={{ height: 64 }} padding={0}>
      <AppShell.Header className={styles.appHeader}>
        <BoardHeader
          activeBoard={activeBoard}
          activeBoardFilterCount={activeBoardFilterCount}
          activeHandoffFilterCount={activeHandoffFilterCount}
          boardFilterOptions={boardFilterOptions}
          boardFilters={boardFilters}
          boardKey={boardKey}
          boardSearchQuery={boardSearchQuery}
          boards={boards}
          boardsLoading={boardsQuery.isLoading}
          canExportSequenceHandoff={canExportSequenceHandoff}
          currentUser={currentUser}
          handoffFilters={handoffFilters}
          hasBoardFilters={hasBoardFilters}
          headerSubtitle={headerSubtitle}
          isAdmin={isAdmin}
          isCompactHeader={isCompactHeader}
          isLoggingOut={isLoggingOut}
          openCommentEmailCount={openCommentEmailCount}
          sequenceHandoffEmailCount={sequenceHandoffManifest.email_count}
          sequenceHandoffJSON={sequenceHandoffJSON}
          userMenuOpened={userMenuOpened}
          onBoardChange={handleBoardChange}
          onBoardFilterChange={updateBoardFilter}
          onBoardSearchQueryChange={onBoardSearchQueryChange}
          onCreateBoard={() => setCreateBoardModalOpened(true)}
          onHandoffFiltersChange={setHandoffFilters}
          onLogout={onLogout}
          onManageStages={() => setManageStagesModalOpened(true)}
          onResetBoardFilters={resetBoardFilters}
          onUserMenuOpenedChange={setUserMenuOpened}
        />
      </AppShell.Header>

      <AppShell.Main>
        <Box className={styles.boardPage}>
          {emailsQuery.isLoading || boardsQuery.isLoading ? (
            <Stack align="center" justify="center" h="100%">
              <Loader />
              <Text c="dimmed">Loading emails</Text>
            </Stack>
          ) : null}

          {emailsQuery.isError || boardsQuery.isError ? (
            <Alert color="red" title="Failed to load emails">
              Check that the API server is reachable.
            </Alert>
          ) : null}

          {emailsQuery.isSuccess ? (
            visibleColumns.length > 0 ? (
              <EmailBoard
                scrollPosition={boardScrollPosition}
                columns={visibleColumns}
                selectedVersionByGroup={selectedVersionByGroup}
                onScrollPositionChange={onBoardScrollPositionChange}
                onOpenVersionGroup={handleOpenVersionGroup}
                onReviewStatusChange={handleReviewStatusChange}
                onSelectVersion={handleSelectVersion}
              />
            ) : (
              <Stack align="center" justify="center" h="100%" ta="center">
                <Text fw={600}>{filterEmptyState}</Text>
                <Text c="rgba(255, 255, 255, 0.72)" size="sm">
                  {filterEmptyHint}
                </Text>
              </Stack>
            )
          ) : null}
        </Box>
      </AppShell.Main>

      {createBoardModalOpened && activeBoard ? (
        <CreateBoardModal
          error={createBoardMutation.error}
          isSubmitting={createBoardMutation.isPending}
          sourceBoard={activeBoard}
          onClose={() => {
            createBoardMutation.reset();
            setCreateBoardModalOpened(false);
          }}
          onResetError={() => createBoardMutation.reset()}
          onSubmit={(payload) => createBoardMutation.mutateAsync(payload)}
        />
      ) : null}

      {manageStagesModalOpened && activeBoard ? (
        <ManageStagesModal
          board={activeBoard}
          stageCounts={new Map(columns.map((column) => [column.stage, column.emailGroups.length]))}
          onClose={() => setManageStagesModalOpened(false)}
          onMutated={refreshBoardData}
        />
      ) : null}
    </AppShell>
  );
}
