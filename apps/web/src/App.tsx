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
  Badge,
  Box,
  Burger,
  Button,
  Group,
  Loader,
  Menu,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";

import { AIAnalysisLogsView } from "./features/ai-logs/AIAnalysisLogsView";
import { AdminUsersView } from "./features/admin-users/AdminUsersView";
import { AuthEventsView } from "./features/auth-events/AuthEventsView";
import { LoginView } from "./features/auth/LoginView";
import { EmailEventsView } from "./features/email-events/EmailEventsView";
import { fetchCurrentUser, fetchEmails, logout } from "./features/emails/api";
import { EmailBoard } from "./features/emails/EmailBoard";
import { EmailFieldsEditorView } from "./features/emails/EmailFieldsEditorView";
import { buildStageColumns } from "./features/emails/stages";
import type { AuthUser } from "./features/emails/types";
import { EmailReviewView } from "./features/review/EmailReviewView";
import styles from "./App.module.css";

const boardSelectedVersionsStorageKey = "reviewdesk.board.selectedVersions";
const boardScrollPositionStorageKey = "reviewdesk.board.scrollPosition";

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
  useEffect(() => {
    writeSessionStorageValue(
      boardSelectedVersionsStorageKey,
      selectedVersionByGroup
    );
  }, [selectedVersionByGroup]);
  useEffect(() => {
    writeSessionStorageValue(boardScrollPositionStorageKey, boardScrollPosition);
  }, [boardScrollPosition]);
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
        path="/emails/:emailId/edit"
        element={<EmailFieldsEditorRoute currentUserRole={currentUserQuery.data.role} />}
      />
      <Route
        path="/emails/:emailId/review"
        element={<EmailReviewRoute currentUserRole={currentUserQuery.data.role} />}
      />
      <Route
        path="/"
        element={
          <EmailBoardApp
            boardScrollPosition={boardScrollPosition}
            currentUser={currentUserQuery.data}
            isLoggingOut={logoutMutation.isPending}
            selectedVersionByGroup={selectedVersionByGroup}
            onLogout={() => logoutMutation.mutate()}
            onBoardScrollPositionChange={setBoardScrollPosition}
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

function EmailBoardApp({
  boardScrollPosition,
  currentUser,
  isLoggingOut,
  selectedVersionByGroup,
  onLogout,
  onBoardScrollPositionChange,
  onSelectedVersionByGroupChange,
}: {
  boardScrollPosition: { x: number; y: number };
  currentUser: AuthUser;
  isLoggingOut: boolean;
  selectedVersionByGroup: Record<string, string>;
  onLogout: () => void;
  onBoardScrollPositionChange: (position: { x: number; y: number }) => void;
  onSelectedVersionByGroupChange: Dispatch<
    SetStateAction<Record<string, string>>
  >;
}) {
  const navigate = useNavigate();
  const [userMenuOpened, setUserMenuOpened] = useState(false);
  const isCompactHeader = useMediaQuery("(max-width: 64em)");
  const isAdmin =
    currentUser.role === "admin" || currentUser.role === "super_admin";

  const emailsQuery = useQuery({
    queryKey: ["emails"],
    queryFn: fetchEmails,
  });

  const columns = useMemo(
    () => buildStageColumns(emailsQuery.data ?? []),
    [emailsQuery.data]
  );

  const handleSelectVersion = (groupKey: string, emailId: string) => {
    onSelectedVersionByGroupChange((current) => ({
      ...current,
      [groupKey]: emailId,
    }));
  };

  const handleOpenVersionGroup = (_groupKey: string, emailId: string) => {
    navigate(`/emails/${encodeURIComponent(emailId)}/review`);
  };

  return (
    <AppShell header={{ height: 56 }} padding={0}>
      <AppShell.Header className={styles.appHeader}>
        <Group h="100%" px="md" justify="space-between">
          <Stack gap={0}>
            <Group gap="xs">
              <Title order={4}>ReviewDesk</Title>
            </Group>
            <Text size="xs" c="dimmed">
              Onboarding sequence review
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
          {emailsQuery.isLoading ? (
            <Stack align="center" justify="center" h="100%">
              <Loader />
              <Text c="dimmed">Loading emails</Text>
            </Stack>
          ) : null}

          {emailsQuery.isError ? (
            <Alert color="red" title="Failed to load emails">
              Check that the API server is reachable.
            </Alert>
          ) : null}

          {emailsQuery.isSuccess ? (
            <EmailBoard
              scrollPosition={boardScrollPosition}
              columns={columns}
              selectedVersionByGroup={selectedVersionByGroup}
              onScrollPositionChange={onBoardScrollPositionChange}
              onOpenVersionGroup={handleOpenVersionGroup}
              onSelectVersion={handleSelectVersion}
            />
          ) : null}
        </Box>
      </AppShell.Main>

    </AppShell>
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
