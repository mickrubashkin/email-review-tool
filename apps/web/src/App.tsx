import {
  type Dispatch,
  type FormEvent,
  type SetStateAction,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ActionIcon,
  Alert,
  AppShell,
  Badge,
  Box,
  Burger,
  Button,
  Group,
  Loader,
  Menu,
  Modal,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CaretDownIcon,
  EnvelopeSimpleIcon,
  GearSixIcon,
  KanbanIcon,
  MagnifyingGlassIcon,
  PencilSimpleIcon,
  PlusIcon,
  SignOutIcon,
  SlidersHorizontalIcon,
  TrashIcon,
  UserCircleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { notifications } from "@mantine/notifications";
import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Link, Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";

import { AIAnalysisLogsView } from "./features/ai-logs/AIAnalysisLogsView";
import { AdminUsersView } from "./features/admin-users/AdminUsersView";
import { AuthEventsView } from "./features/auth-events/AuthEventsView";
import { LoginView } from "./features/auth/LoginView";
import { EmailEventsView } from "./features/email-events/EmailEventsView";
import { OperationalEventsView } from "./features/ops-events/OperationalEventsView";
import {
  ApiError,
  createBoard,
  createBoardStage,
  deleteBoardStage,
  fetchBoards,
  fetchCurrentUser,
  fetchEmails,
  logout,
  reorderBoardStages,
  updateEmailReviewStatus,
  updateBoardStage,
} from "./features/emails/api";
import { EmailBoard } from "./features/emails/EmailBoard";
import { EmailCreateView } from "./features/emails/EmailCreateView";
import {
  emailReviewStatusOptions,
  formatEmailReviewStatus,
} from "./features/emails/reviewStatus";
import { buildStageColumns, formatStageName } from "./features/emails/stages";
import type {
  AuthUser,
  Board,
  CreateBoardPayload,
  EmailDetail,
  EmailListItem,
  EmailReviewStatus,
  StageColumn,
} from "./features/emails/types";
import { EmailReviewView } from "./features/review/EmailReviewView";
import styles from "./App.module.css";

const boardSelectedVersionsStorageKey = "reviewdesk.board.selectedVersions";
const boardScrollPositionStorageKey = "reviewdesk.board.scrollPosition";
const boardFilterStorageKey = "reviewdesk.board.filter";
const boardSearchStorageKey = "reviewdesk.board.search";

type BoardCommentFilter = "all" | "open";

type BoardFilters = {
  comments: BoardCommentFilter;
  language: string;
  adaptation: string;
  variant: string;
  status: string;
};

const defaultBoardFilters: BoardFilters = {
  comments: "all",
  language: "",
  adaptation: "",
  variant: "",
  status: "",
};

export default function App() {
  return <AuthenticatedApp />;
}

function AuthenticatedApp() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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
  const currentUserQuery = useQuery({
    queryKey: ["auth", "me"],
    queryFn: fetchCurrentUser,
    retry: false,
  });
  const logoutMutation = useMutation({
    mutationFn: logout,
    onSettled: () => {
      queryClient.removeQueries();
      navigate("/");
    },
  });

  if (currentUserQuery.isLoading) {
    return (
      <Stack align="center" justify="center" h="100dvh">
        <Loader />
        <Text c="dimmed">Checking session</Text>
      </Stack>
    );
  }

  if (currentUserQuery.isError || !currentUserQuery.data) {
    return <LoginView />;
  }

  return (
    <Routes>
      <Route path="/ai-logs" element={<AIAnalysisLogsView />} />
      <Route path="/auth-events" element={<AuthEventsView />} />
      <Route path="/admin/users" element={<AdminUsersView />} />
      <Route path="/admin/email-events" element={<EmailEventsView />} />
      <Route path="/admin/operational-events" element={<OperationalEventsView />} />
      <Route
        path="/emails/new"
        element={<EmailCreateView currentUserRole={currentUserQuery.data.role} />}
      />
      <Route
        path="/emails/:emailId/edit"
        element={<EmailFieldsEditorRoute />}
      />
      <Route
        path="/emails/:emailId/review"
        element={<EmailReviewRoute currentUserRole={currentUserQuery.data.role} />}
      />
      <Route
        path="/"
        element={<BoardHomeRedirect />}
      />
      <Route
        path="/boards/:boardKey"
        element={
          <EmailBoardRoute
            boardFilters={boardFilters}
            boardScrollPosition={boardScrollPosition}
            boardSearchQuery={boardSearchQuery}
            currentUser={currentUserQuery.data}
            isLoggingOut={logoutMutation.isPending}
            selectedVersionByGroup={selectedVersionByGroup}
            onLogout={() => logoutMutation.mutate()}
            onBoardScrollPositionChange={setBoardScrollPosition}
            onBoardFiltersChange={setBoardFilters}
            onBoardSearchQueryChange={setBoardSearchQuery}
            onSelectedVersionByGroupChange={setSelectedVersionByGroup}
          />
        }
      />
      <Route path="*" element={<Navigate replace to="/" />} />
    </Routes>
  );
}

function EmailReviewRoute({
  currentUserRole,
}: {
  currentUserRole: AuthUser["role"];
}) {
  const { emailId } = useParams();
  return emailId ? (
    <EmailReviewView currentUserRole={currentUserRole} emailId={emailId} />
  ) : (
    <Navigate replace to="/" />
  );
}

function EmailFieldsEditorRoute() {
  const { emailId } = useParams();
  return emailId ? (
    <Navigate replace to={`/emails/${encodeURIComponent(emailId)}/review`} />
  ) : (
    <Navigate replace to="/" />
  );
}

function BoardHomeRedirect() {
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

function EmailBoardRoute({
  boardFilters,
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
  const { boardKey } = useParams();
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
        onBoardScrollPositionChange={onBoardScrollPositionChange}
        onBoardFiltersChange={onBoardFiltersChange}
        onBoardSearchQueryChange={onBoardSearchQueryChange}
        onSelectedVersionByGroupChange={onSelectedVersionByGroupChange}
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
  const filterButtonLabel =
    activeBoardFilterCount > 0
      ? `Filters ${activeBoardFilterCount}`
      : "Filters";
  const hasBoardFilters = activeBoardFilterCount > 0;
  const filterEmptyState =
    searchQuery || hasBoardFilters ? "No matching emails" : "No emails on this board";
  const filterEmptyHint = searchQuery
    ? "Try another search or clear the query."
    : hasBoardFilters
      ? "Clear filters to browse the full sequence."
      : "Create or import an email to start reviewing.";
  const boardFilterMenu = (
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
        <div className={styles.boardFilterMenuControl}>
          <SegmentedControl
            data={[
              { label: "All", value: "all" },
              { label: `Open ${openCommentEmailCount}`, value: "open" },
            ]}
            fullWidth
            size="xs"
            value={boardFilters.comments}
            onChange={(value) => updateBoardFilter("comments", value)}
          />
        </div>

        <Menu.Label>Language</Menu.Label>
        <div className={styles.boardFilterMenuControl}>
          <Select
            clearable
            data={boardFilterOptions.languages}
            placeholder="All languages"
            size="xs"
            value={boardFilters.language || null}
            onChange={(value) => updateBoardFilter("language", value)}
          />
        </div>

        <Menu.Label>Adaptation</Menu.Label>
        <div className={styles.boardFilterMenuControl}>
          <Select
            clearable
            data={boardFilterOptions.adaptations}
            placeholder="All adaptations"
            size="xs"
            value={boardFilters.adaptation || null}
            onChange={(value) => updateBoardFilter("adaptation", value)}
          />
        </div>

        <Menu.Label>Version</Menu.Label>
        <div className={styles.boardFilterMenuControl}>
          <Select
            clearable
            data={boardFilterOptions.variants}
            placeholder="All versions"
            size="xs"
            value={boardFilters.variant || null}
            onChange={(value) => updateBoardFilter("variant", value)}
          />
        </div>

        <Menu.Label>Status</Menu.Label>
        <div className={styles.boardFilterMenuControl}>
          <Select
            clearable
            data={emailReviewStatusOptions}
            placeholder="All statuses"
            size="xs"
            value={boardFilters.status || null}
            onChange={(value) => updateBoardFilter("status", value)}
          />
        </div>

        {hasBoardFilters ? (
          <>
            <Menu.Divider />
            <Menu.Item color="red" onClick={resetBoardFilters}>
              Clear filters
            </Menu.Item>
          </>
        ) : null}
      </Menu.Dropdown>
    </Menu>
  );
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
            <Group className={styles.headerActions} gap="sm" wrap="nowrap">
              <Menu
                opened={userMenuOpened}
                position="bottom-end"
                width={260}
                withinPortal
                onChange={setUserMenuOpened}
              >
                <Menu.Target>
                  <Burger
                    aria-label="Open user menu"
                    color="white"
                    opened={userMenuOpened}
                    size="sm"
                  />
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Label>Current board</Menu.Label>
                  <div className={styles.boardFilterMenuControl}>
                    <Select
                      data={boards.map((board) => ({
                        label: board.name,
                        value: board.key,
                      }))}
                      disabled={boardsQuery.isLoading}
                      size="xs"
                      value={activeBoard?.key ?? null}
                      onChange={handleBoardChange}
                    />
                  </div>
                  <Menu.Label>Search</Menu.Label>
                  <div className={styles.boardFilterMenuControl}>
                    <TextInput
                      leftSection={<MagnifyingGlassIcon aria-hidden="true" size={16} />}
                      placeholder="Search emails"
                      size="xs"
                      value={boardSearchQuery}
                      rightSection={
                        boardSearchQuery ? (
                          <ActionIcon
                            aria-label="Clear search"
                            size="xs"
                            variant="subtle"
                            onClick={() => onBoardSearchQueryChange("")}
                          >
                            <XIcon aria-hidden="true" size={12} />
                          </ActionIcon>
                        ) : null
                      }
                      onChange={(event) =>
                        onBoardSearchQueryChange(event.currentTarget.value)
                      }
                    />
                  </div>
                  <Menu.Label>Filters</Menu.Label>
                  <div className={styles.boardFilterMenuControl}>
                    <SegmentedControl
                      data={[
                        { label: "All", value: "all" },
                        {
                          label: `Open comments ${openCommentEmailCount}`,
                          value: "open",
                        },
                      ]}
                      fullWidth
                      size="xs"
                      value={boardFilters.comments}
                      onChange={(value) =>
                        updateBoardFilter("comments", value)
                      }
                    />
                  </div>
                  <div className={styles.boardFilterMenuControl}>
                    <Select
                      clearable
                      data={boardFilterOptions.languages}
                      placeholder="All languages"
                      size="xs"
                      value={boardFilters.language || null}
                      onChange={(value) => updateBoardFilter("language", value)}
                    />
                  </div>
                  <div className={styles.boardFilterMenuControl}>
                    <Select
                      clearable
                      data={boardFilterOptions.adaptations}
                      placeholder="All adaptations"
                      size="xs"
                      value={boardFilters.adaptation || null}
                      onChange={(value) => updateBoardFilter("adaptation", value)}
                    />
                  </div>
                  <div className={styles.boardFilterMenuControl}>
                    <Select
                      clearable
                      data={boardFilterOptions.variants}
                      placeholder="All versions"
                      size="xs"
                      value={boardFilters.variant || null}
                      onChange={(value) => updateBoardFilter("variant", value)}
                    />
                  </div>
                  <div className={styles.boardFilterMenuControl}>
                    <Select
                      clearable
                      data={emailReviewStatusOptions}
                      placeholder="All statuses"
                      size="xs"
                      value={boardFilters.status || null}
                      onChange={(value) => updateBoardFilter("status", value)}
                    />
                  </div>
                  {hasBoardFilters ? (
                    <Menu.Item color="red" onClick={resetBoardFilters}>
                      Clear filters
                    </Menu.Item>
                  ) : null}
                  <Menu.Divider />
                  <Menu.Label>
                    <Stack gap={4}>
                      <Text className={styles.userMenuEmail} size="sm">
                        {currentUser.email}
                      </Text>
                      <Badge
                        color={currentUser.role === "admin" ? "blue" : "gray"}
                        size="sm"
                      >
                        {currentUser.role}
                      </Badge>
                    </Stack>
                  </Menu.Label>
                  {isAdmin ? (
                    <>
                      <Menu.Divider />
                      <Menu.Label>Create</Menu.Label>
                      <Menu.Item
                        leftSection={<KanbanIcon aria-hidden="true" size={16} />}
                        onClick={() => setCreateBoardModalOpened(true)}
                      >
                        New board
                      </Menu.Item>
                      <Menu.Item
                        component={Link}
                        leftSection={<EnvelopeSimpleIcon aria-hidden="true" size={16} />}
                        to="/emails/new"
                      >
                        New email
                      </Menu.Item>
                      <Menu.Item
                        leftSection={<SlidersHorizontalIcon aria-hidden="true" size={16} />}
                        onClick={() => setManageStagesModalOpened(true)}
                      >
                        Board stages
                      </Menu.Item>
                      <Menu.Divider />
                      <Menu.Label>Admin</Menu.Label>
                      <Menu.Item component={Link} to="/auth-events">
                        Auth events
                      </Menu.Item>
                      <Menu.Item component={Link} to="/ai-logs">
                        AI logs
                      </Menu.Item>
                      <Menu.Item component={Link} to="/admin/operational-events">
                        Operational events
                      </Menu.Item>
                    </>
                  ) : null}
                  {currentUser.role === "super_admin" ? (
                    <>
                      <Menu.Item component={Link} to="/admin/email-events">
                        Email events
                      </Menu.Item>
                      <Menu.Item component={Link} to="/admin/users">
                        Users
                      </Menu.Item>
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
                </Menu.Dropdown>
              </Menu>
            </Group>
          ) : (
            <>
              <Group className={styles.boardControls} gap="xs" wrap="nowrap">
                <Select
                  allowDeselect={false}
                  className={styles.boardSelect}
                  data={boards.map((board) => ({
                    label: board.name,
                    value: board.key,
                  }))}
                  disabled={boardsQuery.isLoading}
                  leftSection={<KanbanIcon aria-hidden="true" size={16} />}
                  size="sm"
                  value={activeBoard?.key ?? null}
                  onChange={handleBoardChange}
                />
                {boardFilterMenu}
                <TextInput
                  className={styles.boardSearch}
                  leftSection={<MagnifyingGlassIcon aria-hidden="true" size={16} />}
                  placeholder="Search emails"
                  size="sm"
                  value={boardSearchQuery}
                  rightSection={
                    boardSearchQuery ? (
                      <ActionIcon
                        aria-label="Clear search"
                        size="sm"
                        variant="subtle"
                        onClick={() => onBoardSearchQueryChange("")}
                      >
                        <XIcon aria-hidden="true" size={14} />
                      </ActionIcon>
                    ) : null
                  }
                  onChange={(event) =>
                    onBoardSearchQueryChange(event.currentTarget.value)
                  }
                />
              </Group>

              <Group className={styles.headerActions} gap="xs" wrap="nowrap">
                {isAdmin ? (
                  <Menu position="bottom-end" width={220} withinPortal>
                    <Menu.Target>
                      <Button
                        className={styles.headerMenuButton}
                        leftSection={<PlusIcon aria-hidden="true" size={16} />}
                        rightSection={<CaretDownIcon aria-hidden="true" size={14} />}
                        variant="white"
                      >
                        Create
                      </Button>
                    </Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Item
                        leftSection={<KanbanIcon aria-hidden="true" size={16} />}
                        onClick={() => setCreateBoardModalOpened(true)}
                      >
                        New board
                      </Menu.Item>
                      <Menu.Item
                        component={Link}
                        leftSection={<EnvelopeSimpleIcon aria-hidden="true" size={16} />}
                        to="/emails/new"
                      >
                        New email
                      </Menu.Item>
                      <Menu.Divider />
                      <Menu.Item
                        leftSection={<SlidersHorizontalIcon aria-hidden="true" size={16} />}
                        onClick={() => setManageStagesModalOpened(true)}
                      >
                        Board stages
                      </Menu.Item>
                    </Menu.Dropdown>
                  </Menu>
                ) : null}

                {isAdmin ? (
                  <Menu position="bottom-end" width={220} withinPortal>
                    <Menu.Target>
                      <Button
                        className={styles.headerMenuButton}
                        leftSection={<GearSixIcon aria-hidden="true" size={16} />}
                        rightSection={<CaretDownIcon aria-hidden="true" size={14} />}
                        variant="white"
                      >
                        Admin
                      </Button>
                    </Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Item component={Link} to="/auth-events">
                        Auth events
                      </Menu.Item>
                      <Menu.Item component={Link} to="/ai-logs">
                        AI logs
                      </Menu.Item>
                      <Menu.Item component={Link} to="/admin/operational-events">
                        Operational events
                      </Menu.Item>
                      {currentUser.role === "super_admin" ? (
                        <>
                          <Menu.Divider />
                          <Menu.Item component={Link} to="/admin/email-events">
                            Email events
                          </Menu.Item>
                          <Menu.Item component={Link} to="/admin/users">
                            Users
                          </Menu.Item>
                        </>
                      ) : null}
                    </Menu.Dropdown>
                  </Menu>
                ) : null}

                <Menu position="bottom-end" width={260} withinPortal>
                  <Menu.Target>
                    <Button
                      className={styles.accountButton}
                      leftSection={<UserCircleIcon aria-hidden="true" size={18} />}
                      rightSection={<CaretDownIcon aria-hidden="true" size={14} />}
                      variant="white"
                    >
                      <span className={styles.accountEmail}>{currentUser.email}</span>
                    </Button>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Label>
                      <Stack gap={4}>
                        <Text className={styles.userMenuEmail} size="sm">
                          {currentUser.email}
                        </Text>
                        <Badge
                          color={currentUser.role === "admin" ? "blue" : "gray"}
                          size="sm"
                        >
                          {currentUser.role}
                        </Badge>
                      </Stack>
                    </Menu.Label>
                    <Menu.Divider />
                    <Menu.Item
                      color="red"
                      disabled={isLoggingOut}
                      leftSection={<SignOutIcon aria-hidden="true" size={16} />}
                      onClick={onLogout}
                    >
                      {isLoggingOut ? "Logging out" : "Logout"}
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              </Group>
            </>
          )}
        </Group>
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

function filterColumnsBySearch(columns: StageColumn[], query: string) {
  const terms = normalizeSearchText(query).split(" ").filter(Boolean);
  if (terms.length === 0) {
    return columns;
  }

  return columns
    .map((column) => ({
      ...column,
      emailGroups: column.emailGroups.filter((group) =>
        group.versions.some((email) => emailMatchesSearch(email, column, terms))
      ),
    }))
    .filter((column) => column.emailGroups.length > 0);
}

function applyReviewStatusToBoardCaches(
  queryClient: QueryClient,
  boardKey: string,
  emailId: string,
  reviewStatus: EmailReviewStatus
) {
  const updateList = (currentEmails: EmailListItem[] | undefined) =>
    currentEmails?.map((currentEmail) =>
      currentEmail.id === emailId
        ? { ...currentEmail, review_status: reviewStatus }
        : currentEmail
    );

  queryClient.setQueryData<EmailListItem[]>(["emails"], updateList);
  queryClient.setQueryData<EmailListItem[]>(["emails", boardKey], updateList);
  queryClient.setQueryData<EmailDetail>(
    ["emails", emailId, "review"],
    (currentEmail) =>
      currentEmail
        ? { ...currentEmail, review_status: reviewStatus }
        : currentEmail
  );
}

function filterColumnsByBoardFilters(
  columns: StageColumn[],
  filters: BoardFilters
) {
  if (getActiveBoardFilterCount(filters) === 0) {
    return columns;
  }

  return columns
    .map((column) => ({
      ...column,
      emailGroups: column.emailGroups
        .map((group) => ({
          ...group,
          versions: group.versions.filter((email) =>
            emailMatchesBoardFilters(email, filters)
          ),
        }))
        .filter((group) => group.versions.length > 0),
    }))
    .filter((column) => column.emailGroups.length > 0);
}

function emailMatchesBoardFilters(email: EmailListItem, filters: BoardFilters) {
  return (
    (filters.comments === "all" || (email.open_comment_count ?? 0) > 0) &&
    (!filters.language || email.language === filters.language) &&
    (!filters.adaptation || email.adaptation_key === filters.adaptation) &&
    (!filters.variant || email.variant === filters.variant) &&
    (!filters.status || email.review_status === filters.status)
  );
}

function getActiveBoardFilterCount(filters: BoardFilters) {
  return [
    filters.comments === "open" ? filters.comments : "",
    filters.language,
    filters.adaptation,
    filters.variant,
    filters.status,
  ].filter(Boolean).length;
}

function getBoardFilterOptions(emails: EmailListItem[]) {
  const adaptationByKey = new Map<string, string>();

  for (const email of emails) {
    if (!adaptationByKey.has(email.adaptation_key)) {
      adaptationByKey.set(email.adaptation_key, email.adaptation_label);
    }
  }

  const variants = uniqueSorted(emails.map((email) => email.variant));

  return {
    languages: uniqueSorted(emails.map((email) => email.language)).map((language) => ({
      label: language.toUpperCase(),
      value: language,
    })),
    adaptations: Array.from(adaptationByKey.entries())
      .map(([value, label]) => ({ label, value }))
      .sort((first, second) => {
        if (first.value === "default") {
          return -1;
        }
        if (second.value === "default") {
          return 1;
        }
        return first.label.localeCompare(second.label);
      }),
    variants: variants.map((variant) => ({
      label: formatVariantOptionLabel(variant, variants),
      value: variant,
    })),
  };
}

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((first, second) =>
    first.localeCompare(second)
  );
}

function formatVariantLabel(variant: string) {
  const normalizedVariant = variant.trim().toLowerCase();
  if (normalizedVariant === "old") {
    return "v0";
  }
  if (normalizedVariant === "new") {
    return "v1";
  }

  return variant;
}

function formatVariantOptionLabel(variant: string, variants: string[]) {
  const label = formatVariantLabel(variant);
  const hasLabelCollision = variants.some(
    (otherVariant) =>
      otherVariant !== variant && formatVariantLabel(otherVariant) === label
  );
  const normalizedVariant = variant.trim().toLowerCase();

  if (
    hasLabelCollision &&
    (normalizedVariant === "old" || normalizedVariant === "new")
  ) {
    return `${label} legacy`;
  }

  return label;
}

function emailMatchesSearch(
  email: EmailListItem,
  column: StageColumn,
  terms: string[]
) {
  const searchableText = normalizeSearchText(
    [
      email.title,
      email.subject,
      email.preheader,
      email.send_timing,
      email.stage,
      column.title,
      formatStageName(email.stage ?? column.stage),
      email.language,
      email.variant,
      email.adaptation_label,
      email.adaptation_key,
      email.review_status,
      formatEmailReviewStatus(email.review_status),
      email.sequence,
    ]
      .filter(Boolean)
      .join(" ")
  );

  return terms.every((term) => searchableText.includes(term));
}

function normalizeSearchText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function CreateBoardModal({
  error,
  isSubmitting,
  sourceBoard,
  onClose,
  onResetError,
  onSubmit,
}: {
  error: Error | null;
  isSubmitting: boolean;
  sourceBoard: Board;
  onClose: () => void;
  onResetError: () => void;
  onSubmit: (payload: CreateBoardPayload) => Promise<Board>;
}) {
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const isConflict = error instanceof ApiError && error.status === 409;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError("Name is required");
      return;
    }

    setNameError(null);
    try {
      await onSubmit({
        key: key.trim() || undefined,
        name: trimmedName,
        source_board_key: sourceBoard.key,
      });
    } catch {
      // React Query stores the error; keep the modal open and show it inline.
    }
  };

  return (
    <Modal centered opened title="New board" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <Stack gap="sm">
          {error ? (
            <Alert color="red" title="Could not create board">
              {isConflict
                ? "A board with this key already exists."
                : "Try again or check that the API server is reachable."}
            </Alert>
          ) : null}
          <Text size="sm" c="dimmed">
            Stages will be copied from {sourceBoard.name}.
          </Text>
          <TextInput
            data-autofocus
            disabled={isSubmitting}
            error={nameError}
            label="Name"
            placeholder="Activation"
            value={name}
            onChange={(event) => {
              onResetError();
              setName(event.currentTarget.value);
              if (nameError) {
                setNameError(null);
              }
            }}
          />
          <TextInput
            disabled={isSubmitting}
            label="Key"
            placeholder="activation"
            value={key}
            onChange={(event) => {
              onResetError();
              setKey(event.currentTarget.value);
            }}
          />
          <Group justify="flex-end" mt="xs">
            <Button
              disabled={isSubmitting}
              type="button"
              variant="default"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button loading={isSubmitting} type="submit">
              Create board
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

function ManageStagesModal({
  board,
  stageCounts,
  onClose,
  onMutated,
}: {
  board: Board;
  stageCounts: Map<string, number>;
  onClose: () => void;
  onMutated: () => void;
}) {
  const [newStageName, setNewStageName] = useState("");
  const [stageNames, setStageNames] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const handleSuccess = (updatedBoard: Board) => {
    setFormError(null);
    setStageNames(
      Object.fromEntries(updatedBoard.stages.map((stage) => [stage, formatStageName(stage)]))
    );
    onMutated();
  };

  const handleError = (error: Error) => {
    if (error instanceof ApiError) {
      if (error.status === 409) {
        setFormError(error.message.includes("not empty")
          ? "Only empty stages can be deleted."
          : "A stage with this name already exists.");
        return;
      }
      if (error.status === 400) {
        setFormError("Stage order must contain the same stages exactly once.");
        return;
      }
    }
    setFormError("Could not update stages. Try again or check the API server.");
  };

  const addStageMutation = useMutation({
    mutationFn: () => createBoardStage(board.key, { name: newStageName.trim() }),
    onSuccess: (updatedBoard) => {
      setNewStageName("");
      handleSuccess(updatedBoard);
    },
    onError: handleError,
  });
  const renameStageMutation = useMutation({
    mutationFn: ({ stage, name }: { stage: string; name: string }) =>
      updateBoardStage(board.key, stage, { name }),
    onSuccess: handleSuccess,
    onError: handleError,
  });
  const deleteStageMutation = useMutation({
    mutationFn: (stage: string) => deleteBoardStage(board.key, stage),
    onSuccess: handleSuccess,
    onError: handleError,
  });
  const reorderStageMutation = useMutation({
    mutationFn: (stages: string[]) => reorderBoardStages(board.key, { stages }),
    onSuccess: handleSuccess,
    onError: handleError,
  });

  const isSubmitting =
    addStageMutation.isPending ||
    renameStageMutation.isPending ||
    deleteStageMutation.isPending ||
    reorderStageMutation.isPending;

  const handleAddStage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newStageName.trim()) {
      setFormError("Stage name is required.");
      return;
    }
    addStageMutation.mutate();
  };

  const moveStage = (stageIndex: number, direction: -1 | 1) => {
    const nextIndex = stageIndex + direction;
    if (nextIndex < 0 || nextIndex >= board.stages.length) {
      return;
    }
    const nextStages = [...board.stages];
    [nextStages[stageIndex], nextStages[nextIndex]] = [
      nextStages[nextIndex],
      nextStages[stageIndex],
    ];
    reorderStageMutation.mutate(nextStages);
  };

  return (
    <Modal centered opened size="lg" title={`Stages for ${board.name}`} onClose={onClose}>
      <Stack gap="md">
        {formError ? (
          <Alert color="red" title="Could not update stages">
            {formError}
          </Alert>
        ) : null}

        <form onSubmit={handleAddStage}>
          <Group align="flex-end" gap="xs" wrap="nowrap">
            <TextInput
              disabled={isSubmitting}
              label="New stage"
              placeholder="Ready for QA"
              value={newStageName}
              onChange={(event) => {
                setFormError(null);
                setNewStageName(event.currentTarget.value);
              }}
            />
            <Button
              disabled={isSubmitting || !newStageName.trim()}
              leftSection={<PlusIcon aria-hidden="true" size={16} />}
              type="submit"
            >
              Add
            </Button>
          </Group>
        </form>

        <Stack gap="xs">
          {board.stages.map((stage, stageIndex) => {
            const stageName = stageNames[stage] ?? formatStageName(stage);
            const emailCount = stageCounts.get(stage) ?? 0;
            const isNameChanged = stageName.trim() !== formatStageName(stage);

            return (
              <Group className={styles.stageManagerRow} gap="xs" key={stage} wrap="nowrap">
                <TextInput
                  className={styles.stageManagerName}
                  disabled={isSubmitting}
                  value={stageName}
                  onChange={(event) => {
                    const nextStageName = event.currentTarget.value;
                    setFormError(null);
                    setStageNames((current) => ({
                      ...current,
                      [stage]: nextStageName,
                    }));
                  }}
                />
                <Badge variant="light">{emailCount}</Badge>
                <Tooltip label="Move stage left">
                  <ActionIcon
                    aria-label="Move stage left"
                    disabled={isSubmitting || stageIndex === 0}
                    variant="default"
                    onClick={() => moveStage(stageIndex, -1)}
                  >
                    <ArrowLeftIcon aria-hidden="true" size={16} />
                  </ActionIcon>
                </Tooltip>
                <Tooltip label="Move stage right">
                  <ActionIcon
                    aria-label="Move stage right"
                    disabled={isSubmitting || stageIndex === board.stages.length - 1}
                    variant="default"
                    onClick={() => moveStage(stageIndex, 1)}
                  >
                    <ArrowRightIcon aria-hidden="true" size={16} />
                  </ActionIcon>
                </Tooltip>
                <Tooltip label="Rename stage">
                  <ActionIcon
                    aria-label="Rename stage"
                    disabled={isSubmitting || !stageName.trim() || !isNameChanged}
                    variant="default"
                    onClick={() =>
                      renameStageMutation.mutate({
                        name: stageName.trim(),
                        stage,
                      })
                    }
                  >
                    <PencilSimpleIcon aria-hidden="true" size={16} />
                  </ActionIcon>
                </Tooltip>
                <Tooltip label={emailCount > 0 ? "Only empty stages can be deleted" : "Delete stage"}>
                  <ActionIcon
                    aria-label="Delete stage"
                    color="red"
                    disabled={isSubmitting || emailCount > 0}
                    variant="light"
                    onClick={() => deleteStageMutation.mutate(stage)}
                  >
                    <TrashIcon aria-hidden="true" size={16} />
                  </ActionIcon>
                </Tooltip>
              </Group>
            );
          })}
        </Stack>

        <Group justify="flex-end">
          <Button disabled={isSubmitting} variant="default" onClick={onClose}>
            Close
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function readStoredSelectedVersions() {
  return readSessionStorageValue<Record<string, string>>(
    boardSelectedVersionsStorageKey,
    {}
  );
}

function readStoredBoardScrollPosition() {
  return readSessionStorageValue<{ x: number; y: number }>(
    boardScrollPositionStorageKey,
    { x: 0, y: 0 }
  );
}

function readStoredBoardFilters(): BoardFilters {
  const storedFilters = readSessionStorageValue<string | Partial<BoardFilters>>(
    boardFilterStorageKey,
    defaultBoardFilters
  );

  if (storedFilters === "open" || storedFilters === "all") {
    return { ...defaultBoardFilters, comments: storedFilters };
  }

  if (typeof storedFilters !== "object" || storedFilters === null) {
    return defaultBoardFilters;
  }

  return {
    ...defaultBoardFilters,
    ...storedFilters,
    comments: storedFilters.comments === "open" ? "open" : "all",
  };
}

function readStoredBoardSearch() {
  return readSessionStorageValue<string>(boardSearchStorageKey, "");
}

function readSessionStorageValue<T>(key: string, fallback: T): T {
  try {
    const storedValue = window.sessionStorage.getItem(key);
    return storedValue ? (JSON.parse(storedValue) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeSessionStorageValue<T>(key: string, value: T) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Session storage may be unavailable in restricted browser contexts.
  }
}
