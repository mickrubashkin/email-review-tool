import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  AppShell,
  Badge,
  Box,
  Button,
  Group,
  Loader,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AIAnalysisLogsView } from "./features/ai-logs/AIAnalysisLogsView";
import { AuthEventsView } from "./features/auth-events/AuthEventsView";
import { LoginView } from "./features/auth/LoginView";
import {
  fetchCurrentUser,
  fetchEmailDetail,
  fetchEmails,
  logout,
} from "./features/emails/api";
import { EmailBoard } from "./features/emails/EmailBoard";
import { EmailPreviewDrawer } from "./features/emails/EmailPreviewDrawer";
import {
  buildStageColumns,
  getDefaultVersion,
} from "./features/emails/stages";
import type { AuthUser } from "./features/emails/types";
import { EmailReviewView } from "./features/review/EmailReviewView";
import styles from "./App.module.css";

export default function App() {
  if (window.location.pathname === "/auth/callback") {
    return <AuthCallbackView />;
  }

  return <AuthenticatedApp />;
}

function AuthCallbackView() {
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    const query = token ? `?token=${encodeURIComponent(token)}` : "";
    window.location.replace(`/api/auth/callback${query}`);
  }, []);

  return (
    <Stack align="center" justify="center" h="100dvh">
      <Loader />
      <Text c="dimmed">Signing in</Text>
    </Stack>
  );
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

  const reviewEmailId = getReviewEmailId(window.location.pathname);
  if (reviewEmailId) {
    return <EmailReviewView emailId={reviewEmailId} />;
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

function EmailBoardApp({
  currentUser,
  isLoggingOut,
  onLogout,
}: {
  currentUser: AuthUser;
  isLoggingOut: boolean;
  onLogout: () => void;
}) {
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [selectedVersionByGroup, setSelectedVersionByGroup] = useState<
    Record<string, string>
  >({});
  const isMobile = useMediaQuery("(max-width: 48em)");

  const emailsQuery = useQuery({
    queryKey: ["emails"],
    queryFn: fetchEmails,
  });

  const emailDetailQuery = useQuery({
    queryKey: ["emails", selectedEmailId],
    queryFn: () => fetchEmailDetail(selectedEmailId ?? ""),
    enabled: selectedEmailId !== null,
  });

  const columns = useMemo(
    () => buildStageColumns(emailsQuery.data ?? []),
    [emailsQuery.data]
  );

  const selectedEmail = emailDetailQuery.data;
  const selectedEmailGroup =
    selectedEmailId === null
      ? undefined
      : columns
        .flatMap((column) => column.emailGroups)
        .find((group) =>
          group.versions.some((version) => version.id === selectedEmailId)
        );

  const handleSelectVersion = (groupKey: string, emailId: string) => {
    setSelectedVersionByGroup((current) => ({
      ...current,
      [groupKey]: emailId,
    }));
  };

  const handleOpenVersionGroup = (groupKey: string) => {
    const emailGroup = columns
      .flatMap((column) => column.emailGroups)
      .find((group) => group.key === groupKey);
    if (!emailGroup) {
      return;
    }

    setSelectedEmailId(
      selectedVersionByGroup[groupKey] ?? getDefaultVersion(emailGroup.versions).id
    );
  };

  return (
    <AppShell header={{ height: 56 }} padding={0}>
      <AppShell.Header className={styles.appHeader}>
        <Group h="100%" px="md" justify="space-between">
          <Stack gap={0}>
            <Group gap="xs">
              <Title order={4}>Email Review Tool</Title>
              {/* <Badge variant="light">MVP</Badge> */}
            </Group>
            <Text size="xs" c="dimmed">
              Onboarding sequence review
            </Text>
          </Stack>

          <Group gap="sm" wrap="nowrap">
            <Text className={styles.headerCount} size="sm" c="dimmed">
              {emailsQuery.data?.length ?? 0} emails
            </Text>
            <Group gap={6} wrap="nowrap">
              <Text className={styles.headerUser} size="sm" c="dimmed">
                {currentUser.email}
              </Text>
              <Badge color={currentUser.role === "admin" ? "blue" : "gray"}>
                {currentUser.role}
              </Badge>
            </Group>
            <Button
              color="gray"
              loading={isLoggingOut}
              size="xs"
              variant="white"
              onClick={onLogout}
            >
              Logout
            </Button>
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

      <EmailPreviewDrawer
        email={selectedEmail}
        emailGroup={selectedEmailGroup}
        isError={emailDetailQuery.isError}
        isLoading={emailDetailQuery.isLoading}
        isMobile={isMobile}
        opened={selectedEmailId !== null}
        onClose={() => setSelectedEmailId(null)}
        onSelectVersion={(groupKey, emailId) => {
          handleSelectVersion(groupKey, emailId);
          setSelectedEmailId(emailId);
        }}
        selectedEmailId={selectedEmailId}
      />
    </AppShell>
  );
}
