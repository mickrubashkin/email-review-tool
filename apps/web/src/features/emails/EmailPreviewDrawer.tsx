import { useEffect } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Drawer,
  Group,
  Loader,
  SimpleGrid,
  Stack,
  Text,
} from "@mantine/core";
import { useMutation } from "@tanstack/react-query";

import { analyzeEmail } from "./api";
import { formatStageName } from "./stages";
import type { EmailDetail } from "./types";
import styles from "./EmailPreviewDrawer.module.css";

const verdictMeta = {
  ready: { color: "green", label: "Ready" },
  minor_fixes: { color: "yellow", label: "Minor fixes" },
  needs_work: { color: "red", label: "Needs work" },
} as const;

const checkStatusMeta = {
  good: { color: "green", label: "Good" },
  weak: { color: "yellow", label: "Weak" },
  bad: { color: "red", label: "Bad" },
} as const;

const priorityMeta = {
  high: { color: "red", label: "High" },
  medium: { color: "yellow", label: "Medium" },
  low: { color: "gray", label: "Low" },
} as const;

const analysisCheckLabels = {
  subject: "Subject",
  preheader: "Preheader",
  focus: "Focus",
  cta: "CTA",
  stage_alignment: "Stage",
  readability: "Readability",
} as const;

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
                  <Group gap="xs">
                    <Badge
                      size="lg"
                      radius="sm"
                      variant="light"
                      color={verdictMeta[analysisMutation.data.verdict].color}
                    >
                      {verdictMeta[analysisMutation.data.verdict].label}
                    </Badge>
                    <Badge size="lg" radius="sm" variant="light">
                      {analysisMutation.data.score}/10
                    </Badge>
                  </Group>
                </Group>

                <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="xs">
                  {Object.entries(analysisMutation.data.checks).map(
                    ([check, status]) => (
                      <Group
                        key={check}
                        className={styles.analysisCheck}
                        justify="space-between"
                        gap="xs"
                      >
                        <Text size="xs" c="dimmed">
                          {
                            analysisCheckLabels[
                              check as keyof typeof analysisCheckLabels
                            ]
                          }
                        </Text>
                        <Badge
                          size="xs"
                          radius="sm"
                          variant="light"
                          color={checkStatusMeta[status].color}
                        >
                          {checkStatusMeta[status].label}
                        </Badge>
                      </Group>
                    )
                  )}
                </SimpleGrid>

                <Stack gap="xs">
                  {analysisMutation.data.recommendations.map(
                    (recommendation, index) => (
                      <Stack
                        key={`${recommendation.title}-${index}`}
                        className={styles.recommendationItem}
                        gap={4}
                      >
                        <Group gap="xs">
                          <Badge
                            size="xs"
                            radius="sm"
                            variant="light"
                            color={priorityMeta[recommendation.priority].color}
                          >
                            {priorityMeta[recommendation.priority].label}
                          </Badge>
                          <Text size="sm" fw={600}>
                            {recommendation.title}
                          </Text>
                        </Group>
                        <Text size="sm" c="dimmed">
                          {recommendation.details}
                        </Text>
                      </Stack>
                    )
                  )}
                </Stack>
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
