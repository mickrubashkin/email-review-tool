import { useMemo, useState } from "react";
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

export default function App() {
  return <AuthenticatedApp />;
}

function AuthenticatedApp() {
  const queryClient = useQueryClient();
  const currentUserQuery = useQuery({
    queryKey: ["auth", "me"],
    queryFn: fetchCurrentUser,
    retry: false,
  });
  const logoutMutation = useMutation({
    mutationFn: logout,
    onSettled: () => {
      queryClient.removeQueries();
      window.location.href = "/";
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

  if (window.location.pathname === "/ai-logs") {
    return <AIAnalysisLogsView />;
  }

  if (window.location.pathname === "/auth-events") {
    return <AuthEventsView />;
  }

  if (window.location.pathname === "/admin/users") {
    return <AdminUsersView />;
  }

  if (window.location.pathname === "/admin/email-events") {
    return <EmailEventsView />;
  }

  const editEmailId = getEditEmailId(window.location.pathname);
  if (editEmailId) {
    return (
      <EmailFieldsEditorView
        currentUserRole={currentUserQuery.data.role}
        emailId={editEmailId}
      />
    );
  }

  const reviewEmailId = getReviewEmailId(window.location.pathname);
  if (reviewEmailId) {
    return (
      <EmailReviewView
        currentUserRole={currentUserQuery.data.role}
        emailId={reviewEmailId}
      />
    );
  }

  return (
    <EmailBoardApp
      currentUser={currentUserQuery.data}
      isLoggingOut={logoutMutation.isPending}
      onLogout={() => logoutMutation.mutate()}
    />
  );
}

function getReviewEmailId(pathname: string) {
  const match = pathname.match(/^\/emails\/([^/]+)\/review\/?$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function getEditEmailId(pathname: string) {
  const match = pathname.match(/^\/emails\/([^/]+)\/edit\/?$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function EmailBoardApp({
  currentUser,
  isLoggingOut,
  onLogout,
}: {
  currentUser: AuthUser;
  isLoggingOut: boolean;
  onLogout: () => void;
}) {
  const [selectedVersionByGroup, setSelectedVersionByGroup] = useState<
    Record<string, string>
  >({});
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
    setSelectedVersionByGroup((current) => ({
      ...current,
      [groupKey]: emailId,
    }));
  };

  const handleOpenVersionGroup = (_groupKey: string, emailId: string) => {
    window.location.href = `/emails/${encodeURIComponent(emailId)}/review`;
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
                      <Menu.Item component="a" href="/auth-events">
                        Auth events
                      </Menu.Item>
                      <Menu.Item component="a" href="/ai-logs">
                        AI logs
                      </Menu.Item>
                    </>
                  ) : null}
                  {currentUser.role === "super_admin" ? (
                    <>
                      <Menu.Item component="a" href="/admin/email-events">
                        Email events
                      </Menu.Item>
                      <Menu.Item component="a" href="/admin/users">
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
                      component="a"
                      href="/auth-events"
                      size="xs"
                      variant="white"
                    >
                      Auth events
                    </Button>
                    <Button
                      component="a"
                      href="/ai-logs"
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
                      component="a"
                      href="/admin/email-events"
                      size="xs"
                      variant="white"
                    >
                      Email events
                    </Button>
                    <Button
                      component="a"
                      href="/admin/users"
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
              columns={columns}
              selectedVersionByGroup={selectedVersionByGroup}
              onOpenVersionGroup={handleOpenVersionGroup}
              onSelectVersion={handleSelectVersion}
            />
          ) : null}
        </Box>
      </AppShell.Main>

    </AppShell>
  );
}
