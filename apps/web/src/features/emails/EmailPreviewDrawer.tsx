import { useEffect } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Drawer,
  Group,
  List,
  Loader,
  Stack,
  Text,
} from "@mantine/core";
import { useMutation } from "@tanstack/react-query";

import { analyzeEmail } from "./api";
import { formatStageName } from "./stages";
import type { EmailDetail } from "./types";
import styles from "./EmailPreviewDrawer.module.css";

type EmailPreviewDrawerProps = {
  email: EmailDetail | undefined;
  isError: boolean;
  isLoading: boolean;
  isMobile: boolean | undefined;
  onClose: () => void;
  opened: boolean;
};

export function EmailPreviewDrawer({
  email,
  isError,
  isLoading,
  isMobile,
  onClose,
  opened,
}: EmailPreviewDrawerProps) {
  const analysisMutation = useMutation({
    mutationFn: analyzeEmail,
  });
  const resetAnalysis = analysisMutation.reset;

  useEffect(() => {
    resetAnalysis();
  }, [email?.id, opened, resetAnalysis]);

  const handleAnalyze = () => {
    if (!email) {
      return;
    }

    analysisMutation.mutate(email.id);
  };

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size={isMobile ? "100%" : "min(900px, 90vw)"}
      title={email?.title ?? "Email preview"}
      padding="md"
    >
      {isLoading ? (
        <Stack align="center" justify="center" h={320}>
          <Loader />
          <Text c="dimmed">Loading preview</Text>
        </Stack>
      ) : null}

      {isError ? (
        <Alert color="red" title="Failed to load preview">
          Try closing the preview and opening the email again.
        </Alert>
      ) : null}

      {email ? (
        <Stack gap="md">
          <Group className={styles.previewToolbar} justify="space-between">
            <Group gap="xs">
              <Badge variant="light" radius="sm">
                {email.language}
              </Badge>
              <Badge variant="outline" radius="sm">
                {formatStageName(email.stage || "uncategorized")}
              </Badge>
            </Group>

            <Group gap="xs">
              <Button
                loading={analysisMutation.isPending}
                onClick={handleAnalyze}
              >
                Analyze
              </Button>
            </Group>
          </Group>

          {analysisMutation.isError ? (
            <Alert color="red" title="Failed to analyze email">
              Check that the API has OpenAI configured and try again.
            </Alert>
          ) : null}

          {analysisMutation.data ? (
            <Card className={styles.analysisCard} withBorder padding="md">
              <Stack gap="sm">
                <Group justify="space-between" align="flex-start">
                  <Stack gap={2}>
                    <Text fw={600}>AI analysis</Text>
                    <Text size="sm" c="dimmed">
                      {analysisMutation.data.summary}
                    </Text>
                  </Stack>
                  <Badge size="lg" radius="sm" variant="light">
                    {analysisMutation.data.score}/10
                  </Badge>
                </Group>

                <List spacing="xs" size="sm">
                  {analysisMutation.data.recommendations.map(
                    (recommendation, index) => (
                      <List.Item key={`${recommendation.title}-${index}`}>
                        <Text span fw={600}>
                          {recommendation.title}
                        </Text>{" "}
                        <Text span c="dimmed">
                          {recommendation.details}
                        </Text>
                      </List.Item>
                    )
                  )}
                </List>
              </Stack>
            </Card>
          ) : null}

          <iframe
            className={styles.emailPreviewFrame}
            title={email.title}
            sandbox=""
            srcDoc={email.original_html}
          />
        </Stack>
      ) : null}
    </Drawer>
  );
}
