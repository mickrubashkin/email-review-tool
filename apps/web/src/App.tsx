import { useMemo, useState } from "react";
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
import { notifications } from "@mantine/notifications";

import { AIAnalysisLogsView } from "./features/ai-logs/AIAnalysisLogsView";
import { AdminUsersView } from "./features/admin-users/AdminUsersView";
import { AuthEventsView } from "./features/auth-events/AuthEventsView";
import { LoginView } from "./features/auth/LoginView";
import {
  archiveEmail,
  duplicateEmail,
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
import type {
  AuthUser,
  DuplicateEmailPayload,
  EmailDetail,
  EmailListItem,
} from "./features/emails/types";
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
  const queryClient = useQueryClient();
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
  const duplicateEmailMutation = useMutation({
    mutationFn: ({
      emailId,
      payload,
    }: {
      emailId: string;
      payload: DuplicateEmailPayload;
    }) => duplicateEmail(emailId, payload),
    onSuccess: (createdEmail) => {
      queryClient.setQueryData(["emails", createdEmail.id], createdEmail);
      setSelectedVersionByGroup((current) => ({
        ...current,
        [getEmailGroupKey(createdEmail)]: createdEmail.id,
      }));
      setSelectedEmailId(createdEmail.id);
      void queryClient.invalidateQueries({ queryKey: ["emails"] });
    },
  });
  const archiveEmailMutation = useMutation({
    mutationFn: archiveEmail,
    onSuccess: () => {
      setSelectedEmailId(null);
      void queryClient.invalidateQueries({ queryKey: ["emails"] });
      notifications.show({
        color: "green",
        message: "Email was removed from the active board.",
        title: "Email archived",
      });
    },
    onError: () => {
      notifications.show({
        color: "red",
        message: "Try again or check that you have admin access.",
        title: "Archive failed",
      });
    },
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
            <Group gap={6} wrap="nowrap">
              <Text className={styles.headerUser} size="sm" c="dimmed">
                {currentUser.email}
              </Text>
              <Badge color={currentUser.role === "admin" ? "blue" : "gray"}>
                {currentUser.role}
              </Badge>
            </Group>
            {currentUser.role === "super_admin" ? (
              <Button
                component="a"
                href="/admin/users"
                size="xs"
                variant="white"
              >
                Users
              </Button>
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
        currentUserRole={currentUser.role}
        duplicateEmailError={duplicateEmailMutation.error}
        email={selectedEmail}
        emailGroup={selectedEmailGroup}
        isArchivingEmail={archiveEmailMutation.isPending}
        isDuplicatingEmail={duplicateEmailMutation.isPending}
        isError={emailDetailQuery.isError}
        isLoading={emailDetailQuery.isLoading}
        isMobile={isMobile}
        opened={selectedEmailId !== null}
        onClose={() => setSelectedEmailId(null)}
        onArchiveEmail={(emailId) => archiveEmailMutation.mutateAsync(emailId)}
        onDuplicateEmail={(emailId, payload) =>
          duplicateEmailMutation.mutateAsync({ emailId, payload })
        }
        onResetDuplicateEmail={() => duplicateEmailMutation.reset()}
        onSelectVersion={(groupKey, emailId) => {
          handleSelectVersion(groupKey, emailId);
          setSelectedEmailId(emailId);
        }}
        selectedEmailId={selectedEmailId}
      />
    </AppShell>
  );
}

function getEmailGroupKey(email: EmailListItem | EmailDetail) {
  return [email.sequence, email.stage || "uncategorized", email.sort_order].join("/");
}
