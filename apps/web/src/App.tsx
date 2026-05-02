import { useMemo, useState } from "react";
import {
  Alert,
  AppShell,
  Badge,
  Box,
  Group,
  Loader,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { useQuery } from "@tanstack/react-query";

import { fetchEmailDetail, fetchEmails } from "./features/emails/api";
import { EmailBoard } from "./features/emails/EmailBoard";
import { EmailPreviewDrawer } from "./features/emails/EmailPreviewDrawer";
import {
  buildStageColumns,
  getDefaultVersion,
} from "./features/emails/stages";
import styles from "./App.module.css";

export default function App() {
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
              <Badge variant="light">MVP</Badge>
            </Group>
            <Text size="xs" c="dimmed">
              Onboarding sequence review
            </Text>
          </Stack>

          <Text className={styles.headerCount} size="sm" c="dimmed">
            {emailsQuery.data?.length ?? 0} emails
          </Text>
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
              Check that the API server is running on port 8080.
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
