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
  PencilSimpleIcon,
  PlusIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";

import { AIAnalysisLogsView } from "./features/ai-logs/AIAnalysisLogsView";
import { AdminUsersView } from "./features/admin-users/AdminUsersView";
import { AuthEventsView } from "./features/auth-events/AuthEventsView";
import { LoginView } from "./features/auth/LoginView";
import { EmailEventsView } from "./features/email-events/EmailEventsView";
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
  updateBoardStage,
} from "./features/emails/api";
import { EmailBoard } from "./features/emails/EmailBoard";
import { EmailCreateView } from "./features/emails/EmailCreateView";
import { EmailFieldsEditorView } from "./features/emails/EmailFieldsEditorView";
import { buildStageColumns, formatStageName } from "./features/emails/stages";
import type { AuthUser, Board, CreateBoardPayload } from "./features/emails/types";
import { EmailReviewView } from "./features/review/EmailReviewView";
import styles from "./App.module.css";

const boardSelectedVersionsStorageKey = "reviewdesk.board.selectedVersions";
const boardScrollPositionStorageKey = "reviewdesk.board.scrollPosition";
const boardFilterStorageKey = "reviewdesk.board.filter";

type BoardFilter = "all" | "open";

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
  const [boardFilter, setBoardFilter] = useState<BoardFilter>(
    readStoredBoardFilter
  );
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
    writeSessionStorageValue(boardFilterStorageKey, boardFilter);
  }, [boardFilter]);
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
      <Route
        path="/emails/new"
        element={<EmailCreateView currentUserRole={currentUserQuery.data.role} />}
      />
      <Route
        path="/emails/:emailId/edit"
        element={<EmailFieldsEditorRoute currentUserRole={currentUserQuery.data.role} />}
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
            boardFilter={boardFilter}
            boardScrollPosition={boardScrollPosition}
            currentUser={currentUserQuery.data}
            isLoggingOut={logoutMutation.isPending}
            selectedVersionByGroup={selectedVersionByGroup}
            onLogout={() => logoutMutation.mutate()}
            onBoardScrollPositionChange={setBoardScrollPosition}
            onBoardFilterChange={setBoardFilter}
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

function EmailFieldsEditorRoute({
  currentUserRole,
}: {
  currentUserRole: AuthUser["role"];
}) {
  const { emailId } = useParams();
  return emailId ? (
    <EmailFieldsEditorView currentUserRole={currentUserRole} emailId={emailId} />
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
  boardFilter,
  boardScrollPosition,
  currentUser,
  isLoggingOut,
  selectedVersionByGroup,
  onLogout,
  onBoardScrollPositionChange,
  onBoardFilterChange,
  onSelectedVersionByGroupChange,
}: {
  boardFilter: BoardFilter;
  boardScrollPosition: { x: number; y: number };
  currentUser: AuthUser;
  isLoggingOut: boolean;
  selectedVersionByGroup: Record<string, string>;
  onLogout: () => void;
  onBoardScrollPositionChange: (position: { x: number; y: number }) => void;
  onBoardFilterChange: (filter: BoardFilter) => void;
  onSelectedVersionByGroupChange: Dispatch<
    SetStateAction<Record<string, string>>
  >;
}) {
  const { boardKey } = useParams();
  return boardKey ? (
    <EmailBoardApp
      boardFilter={boardFilter}
      boardKey={boardKey}
      boardScrollPosition={boardScrollPosition}
      currentUser={currentUser}
      isLoggingOut={isLoggingOut}
      selectedVersionByGroup={selectedVersionByGroup}
      onLogout={onLogout}
      onBoardScrollPositionChange={onBoardScrollPositionChange}
      onBoardFilterChange={onBoardFilterChange}
      onSelectedVersionByGroupChange={onSelectedVersionByGroupChange}
    />
  ) : (
    <Navigate replace to="/" />
  );
}

function EmailBoardApp({
  boardFilter,
  boardKey,
  boardScrollPosition,
  currentUser,
  isLoggingOut,
  selectedVersionByGroup,
  onLogout,
  onBoardScrollPositionChange,
  onBoardFilterChange,
  onSelectedVersionByGroupChange,
}: {
  boardFilter: BoardFilter;
  boardKey: string;
  boardScrollPosition: { x: number; y: number };
  currentUser: AuthUser;
  isLoggingOut: boolean;
  selectedVersionByGroup: Record<string, string>;
  onLogout: () => void;
  onBoardScrollPositionChange: (position: { x: number; y: number }) => void;
  onBoardFilterChange: (filter: BoardFilter) => void;
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
  const openCommentEmailCount = useMemo(
    () =>
      (emailsQuery.data ?? []).filter(
        (email) => (email.open_comment_count ?? 0) > 0
      ).length,
    [emailsQuery.data]
  );
  const visibleColumns = useMemo(
    () =>
      boardFilter === "all"
        ? columns
        : columns
            .map((column) => ({
              ...column,
              emailGroups: column.emailGroups.filter((group) =>
                group.versions.some(
                  (version) => (version.open_comment_count ?? 0) > 0
                )
              ),
            }))
            .filter((column) => column.emailGroups.length > 0),
    [boardFilter, columns]
  );
  const preferredBoard =
    boards.find((board) => board.key === "onboarding") ?? boards[0];
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
  const handleBoardChange = (value: string | null) => {
    if (value) {
      navigate(`/boards/${encodeURIComponent(value)}`);
    }
  };

  return (
    <AppShell header={{ height: 56 }} padding={0}>
      <AppShell.Header className={styles.appHeader}>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Stack gap={0}>
            <Group gap="xs">
              <Title order={4}>ReviewDesk</Title>
            </Group>
            <Text size="xs" c="dimmed">
              {activeBoard?.name ?? "Board review"}
            </Text>
          </Stack>

          <Group gap="sm" wrap="nowrap">
            <Text className={styles.headerCount} size="sm" c="dimmed">
              {emailsQuery.data?.length ?? 0} emails
            </Text>
            {isCompactHeader ? (
              <Menu
                opened={userMenuOpened}
                position="bottom-end"
                width={240}
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
                  <Menu.Label>Board</Menu.Label>
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
                  <Menu.Label>Board filter</Menu.Label>
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
                      value={boardFilter}
                      onChange={(value) =>
                        onBoardFilterChange(value as BoardFilter)
                      }
                    />
                  </div>
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
                      <Menu.Item onClick={() => setCreateBoardModalOpened(true)}>
                        New board
                      </Menu.Item>
                      <Menu.Item onClick={() => setManageStagesModalOpened(true)}>
                        Stages
                      </Menu.Item>
                      <Menu.Item component={Link} to="/emails/new">
                        New email
                      </Menu.Item>
                      <Menu.Item component={Link} to="/auth-events">
                        Auth events
                      </Menu.Item>
                      <Menu.Item component={Link} to="/ai-logs">
                        AI logs
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
                  <Menu.Item color="red" onClick={onLogout}>
                    {isLoggingOut ? "Logging out" : "Logout"}
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            ) : (
              <>
                <Select
                  allowDeselect={false}
                  data={boards.map((board) => ({
                    label: board.name,
                    value: board.key,
                  }))}
                  disabled={boardsQuery.isLoading}
                  size="xs"
                  value={activeBoard?.key ?? null}
                  w={180}
                  onChange={handleBoardChange}
                />
                <SegmentedControl
                  data={[
                    { label: "All", value: "all" },
                    {
                      label: `Open comments ${openCommentEmailCount}`,
                      value: "open",
                    },
                  ]}
                  size="xs"
                  value={boardFilter}
                  onChange={(value) => onBoardFilterChange(value as BoardFilter)}
                />
                {isAdmin ? (
                  <>
                    <Button
                      size="xs"
                      variant="white"
                      onClick={() => setCreateBoardModalOpened(true)}
                    >
                      New board
                    </Button>
                    <Button
                      size="xs"
                      variant="white"
                      onClick={() => setManageStagesModalOpened(true)}
                    >
                      Stages
                    </Button>
                    <Button
                      component={Link}
                      to="/emails/new"
                      size="xs"
                      variant="white"
                    >
                      New email
                    </Button>
                  </>
                ) : null}
                <Group gap={6} wrap="nowrap">
                  <Text className={styles.headerUser} size="sm" c="dimmed">
                    {currentUser.email}
                  </Text>
                  <Badge color={currentUser.role === "admin" ? "blue" : "gray"}>
                    {currentUser.role}
                  </Badge>
                </Group>
                {isAdmin ? (
                  <>
                    <Button
                      component={Link}
                      to="/auth-events"
                      size="xs"
                      variant="white"
                    >
                      Auth events
                    </Button>
                    <Button
                      component={Link}
                      to="/ai-logs"
                      size="xs"
                      variant="white"
                    >
                      AI logs
                    </Button>
                  </>
                ) : null}
                {currentUser.role === "super_admin" ? (
                  <>
                    <Button
                      component={Link}
                      to="/admin/email-events"
                      size="xs"
                      variant="white"
                    >
                      Email events
                    </Button>
                    <Button
                      component={Link}
                      to="/admin/users"
                      size="xs"
                      variant="white"
                    >
                      Users
                    </Button>
                  </>
                ) : null}
                <Button
                  color="gray"
                  loading={isLoggingOut}
                  size="xs"
                  variant="white"
                  onClick={onLogout}
                >
                  Logout
                </Button>
              </>
            )}
          </Group>
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
                onSelectVersion={handleSelectVersion}
              />
            ) : (
              <Stack align="center" justify="center" h="100%">
                <Text fw={600}>No emails with open comments</Text>
                <Text c="rgba(255, 255, 255, 0.72)" size="sm">
                  Switch back to All to browse the full sequence.
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
                    setFormError(null);
                    setStageNames((current) => ({
                      ...current,
                      [stage]: event.currentTarget.value,
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

function readStoredBoardFilter(): BoardFilter {
  const storedFilter = readSessionStorageValue<string>(boardFilterStorageKey, "all");
  return storedFilter === "open" ? "open" : "all";
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
