import { useEffect, useRef, useState } from "react";
import {
  ActionIcon,
  Alert,
  Badge,
  Card,
  Drawer,
  Group,
  Loader,
  ScrollArea,
  SimpleGrid,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import { ChevronDown, Columns2, Monitor, Smartphone } from "lucide-react";

import { analyzeEmailStream } from "./api";
import type {
  EmailAnalysis,
  EmailAnalysisCheckStatus,
  EmailAnalysisVerdict,
  EmailDetail,
  EmailRecommendation,
  EmailVersionGroup,
} from "./types";
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

const streamCheckOrder = [
  "subject",
  "preheader",
  "focus",
  "cta",
  "stage_alignment",
  "readability",
] as const;

type StreamPreview = {
  summary: string | null;
  score: number | null;
  verdict: EmailAnalysisVerdict | null;
  checks: Partial<Record<(typeof streamCheckOrder)[number], EmailAnalysisCheckStatus>>;
  recommendations: Partial<EmailRecommendation>[];
};

type PreviewMode = "desktop" | "mobile" | "both";
type PreviewViewport = "desktop" | "mobile";

type EmailPreviewDrawerProps = {
  email: EmailDetail | undefined;
  emailGroup: EmailVersionGroup | undefined;
  isError: boolean;
  isLoading: boolean;
  isMobile: boolean | undefined;
  onClose: () => void;
  onSelectVersion: (groupKey: string, emailId: string) => void;
  opened: boolean;
  selectedEmailId: string | null;
};

export function EmailPreviewDrawer({
  email,
  emailGroup,
  isError,
  isLoading,
  isMobile,
  onClose,
  onSelectVersion,
  opened,
  selectedEmailId,
}: EmailPreviewDrawerProps) {
  const stopStreamRef = useRef<(() => void) | null>(null);
  const [streamEmailId, setStreamEmailId] = useState<string | null>(null);
  const [streamStatus, setStreamStatus] = useState<
    "idle" | "streaming" | "done" | "error"
  >("idle");
  const [previewMode, setPreviewMode] = useState<PreviewMode>("desktop");
  const [streamText, setStreamText] = useState("");
  const [streamError, setStreamError] = useState<string | null>(null);
  const [streamAnalysis, setStreamAnalysis] = useState<EmailAnalysis | null>(null);

  useEffect(() => {
    stopStreamRef.current?.();
    stopStreamRef.current = null;
  }, [email?.id, opened]);

  useEffect(() => {
    return () => {
      stopStreamRef.current?.();
    };
  }, []);

  const handleAnalyzeStream = () => {
    if (!email) {
      return;
    }

    stopStreamRef.current?.();
    setStreamEmailId(email.id);
    setStreamStatus("streaming");
    setStreamText("");
    setStreamError(null);
    setStreamAnalysis(null);

    stopStreamRef.current = analyzeEmailStream(email.id, {
      onDelta: (text) => {
        setStreamText((current) => current + text);
      },
      onResult: (analysis) => {
        setStreamAnalysis(analysis);
      },
      onDone: () => {
        setStreamStatus("done");
        stopStreamRef.current = null;
      },
      onError: (error) => {
        setStreamStatus("error");
        setStreamError(error);
        stopStreamRef.current = null;
      },
    });
  };

  const isCurrentStream = streamEmailId === email?.id;
  const displayedAnalysis = streamAnalysis && isCurrentStream ? streamAnalysis : null;
  const streamPreview = buildStreamPreview(streamText);
  const shouldShowAnalysisPanel =
    isCurrentStream && (streamStatus !== "idle" || Boolean(displayedAnalysis));
  const activePreviewMode = isMobile
    ? "mobile"
    : shouldShowAnalysisPanel && previewMode === "both"
      ? "desktop"
      : previewMode;
  const selectedVersion = emailGroup?.versions.find(
    (version) => version.id === selectedEmailId
  );
  const headerTitle = email
    ? `${email.title}${email.send_timing ? ` (${formatTimingLabel(email.send_timing)})` : ""}`
    : "";

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size={
        isMobile
          ? "100%"
          : activePreviewMode === "both"
            ? "min(1680px, 98vw)"
            : "min(1180px, 96vw)"
      }
      title={
        <div className={styles.drawerTitleBar}>
          <Text className={styles.drawerTitleText}>
            {headerTitle || "Email preview"}
          </Text>

          {email ? (
            <Group className={styles.drawerHeaderControls} gap="xs">
              {emailGroup && emailGroup.versions.length > 1 ? (
                <label className={styles.versionSelectWrap}>
                  <select
                    aria-label="Email version"
                    className={styles.versionSelect}
                    value={selectedEmailId ?? selectedVersion?.id ?? ""}
                    onChange={(event) =>
                      onSelectVersion(emailGroup.key, event.currentTarget.value)
                    }
                  >
                    {emailGroup.versions.map((version) => (
                      <option key={version.id} value={version.id}>
                        {version.language.toUpperCase()}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    aria-hidden="true"
                    className={styles.versionSelectIcon}
                    size={14}
                    strokeWidth={2.2}
                  />
                </label>
              ) : null}

              {!isMobile ? (
                <Group className={styles.viewportSwitch} gap={0}>
                  <Tooltip label="Desktop preview">
                    <button
                      aria-label="Desktop preview"
                      className={styles.viewportButton}
                      data-active={activePreviewMode === "desktop" || undefined}
                      type="button"
                      onClick={() => setPreviewMode("desktop")}
                    >
                      <Monitor aria-hidden="true" size={16} strokeWidth={2.2} />
                    </button>
                  </Tooltip>
                  <Tooltip label="Mobile preview">
                    <button
                      aria-label="Mobile preview"
                      className={styles.viewportButton}
                      data-active={activePreviewMode === "mobile" || undefined}
                      type="button"
                      onClick={() => setPreviewMode("mobile")}
                    >
                      <Smartphone aria-hidden="true" size={16} strokeWidth={2.2} />
                    </button>
                  </Tooltip>
                  {!shouldShowAnalysisPanel ? (
                    <Tooltip label="Compare desktop and mobile">
                      <button
                        aria-label="Compare desktop and mobile"
                        className={styles.viewportButton}
                        data-active={activePreviewMode === "both" || undefined}
                        type="button"
                        onClick={() => setPreviewMode("both")}
                      >
                        <Columns2 aria-hidden="true" size={16} strokeWidth={2.2} />
                      </button>
                    </Tooltip>
                  ) : null}
                </Group>
              ) : null}

              <Tooltip label="Analyze with AI">
                <ActionIcon
                  aria-label="Analyze with AI"
                  className={styles.aiAction}
                  loading={streamStatus === "streaming" && isCurrentStream}
                  onClick={handleAnalyzeStream}
                  radius="md"
                  size="lg"
                  variant="light"
                >
                  <AISparkleIcon />
                </ActionIcon>
              </Tooltip>
            </Group>
          ) : null}
        </div>
      }
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
          <div
            className={
              shouldShowAnalysisPanel
                ? styles.previewWithAnalysis
                : styles.previewOnly
            }
            data-preview-mode={activePreviewMode}
          >
            {activePreviewMode === "both" ? (
              <div className={styles.previewCompareGrid}>
                <MailPreview
                  email={email}
                  isScanning={streamStatus === "streaming" && isCurrentStream}
                  viewport="desktop"
                />
                <MailPreview
                  email={email}
                  isScanning={streamStatus === "streaming" && isCurrentStream}
                  viewport="mobile"
                />
              </div>
            ) : (
              <MailPreview
                email={email}
                isScanning={streamStatus === "streaming" && isCurrentStream}
                viewport={activePreviewMode}
              />
            )}

            {shouldShowAnalysisPanel ? (
              <aside className={styles.analysisPanel}>
                <AnalysisPanel
                  analysis={displayedAnalysis}
                  error={streamError}
                  isStreaming={streamStatus === "streaming"}
                  preview={streamPreview}
                  showError={streamStatus === "error"}
                />
              </aside>
            ) : null}
          </div>
        </Stack>
      ) : null}
    </Drawer>
  );
}

function MailPreview({
  email,
  isScanning,
  viewport,
}: {
  email: EmailDetail;
  isScanning: boolean;
  viewport: PreviewViewport;
}) {
  return (
    <div className={styles.emailPreviewWrap} data-viewport={viewport}>
      <div className={styles.mailClient}>
        <article className={styles.mailReadPane}>
          <header className={styles.mailHeader}>
            <Group className={styles.mailMetaRow} justify="space-between" gap="sm">
              <Group gap="sm" wrap="nowrap">
                <div className={styles.mailAvatar}>B</div>
                <Stack gap={0}>
                  <Text size="sm" fw={600}>
                    Bitrix24 Partners
                  </Text>
                  <Text size="sm">{email.subject ?? email.title}</Text>
                  {email.subject ? (
                    <Text size="xs" c="dimmed">
                      {email.subject}
                    </Text>
                  ) : null}
                  {email.preheader ? (
                    <Text size="xs" c="dimmed">
                      {email.preheader}
                    </Text>
                  ) : null}
                  <Text size="xs" c="dimmed">
                    Reply-To: partners@bitrix24.com
                  </Text>
                </Stack>
              </Group>
            </Group>
          </header>

          <iframe
            className={styles.emailPreviewFrame}
            title={email.title}
            sandbox=""
            srcDoc={email.original_html}
          />
        </article>
      </div>
      {isScanning ? (
        <div className={styles.emailScanOverlay} aria-hidden="true" />
      ) : null}
    </div>
  );
}

function AISparkleIcon() {
  return (
    <svg
      aria-hidden="true"
      className={styles.aiIcon}
      focusable="false"
      viewBox="0 0 24 24"
    >
      <path
        d="M5.7 4.5h6.1M4.5 12.1V7.2c0-1.5 1.2-2.7 2.7-2.7M4.5 12.1v4.7c0 1.5 1.2 2.7 2.7 2.7h9.6c1.5 0 2.7-1.2 2.7-2.7v-4.2"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2.2"
      />
      <path
        d="M15.2 2.8c.5 2.9 2.1 4.6 5 5-2.9.5-4.6 2.1-5 5-.5-2.9-2.1-4.6-5-5 2.9-.5 4.6-2.1 5-5Z"
        fill="currentColor"
      />
      <path
        d="M9 10.7c.35 2 1.5 3.15 3.5 3.5-2 .35-3.15 1.5-3.5 3.5-.35-2-1.5-3.15-3.5-3.5 2-.35 3.15-1.5 3.5-3.5Z"
        fill="currentColor"
      />
      <path
        d="M20 3.4c.18 1 .75 1.57 1.75 1.75-1 .18-1.57.75-1.75 1.75-.18-1-.75-1.57-1.75-1.75 1-.18 1.57-.75 1.75-1.75Z"
        fill="currentColor"
      />
    </svg>
  );
}

function formatTimingLabel(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

function AnalysisPanel({
  analysis,
  error,
  isStreaming,
  preview,
  showError,
}: {
  analysis: EmailAnalysis | null;
  error: string | null;
  isStreaming: boolean;
  preview: StreamPreview;
  showError: boolean;
}) {
  if (showError) {
    return (
      <Alert color="red" title="Failed to stream AI analysis">
        {error ?? "Check that the API has OpenAI configured and try again."}
      </Alert>
    );
  }

  if (!analysis) {
    return (
      <Card className={styles.analysisCard} withBorder padding="md">
        <Stack gap="md">
          <Group justify="space-between" align="flex-start">
            <Stack gap={2}>
              <Group gap="xs">
                <Text fw={600}>AI analysis</Text>
                <span className={styles.streamPulse} />
              </Group>
              <Text size="sm" c="dimmed">
                Building structured review
              </Text>
            </Stack>
            <Badge radius="sm" variant="light" color="blue">
              {isStreaming ? "Streaming" : "Finalizing"}
            </Badge>
          </Group>

          <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="xs">
            <div className={styles.streamStep}>
              <Text size="xs" fw={600}>
                Copy
              </Text>
              <Text size="xs" c="dimmed">
                Subject and body
              </Text>
            </div>
            <div className={styles.streamStep}>
              <Text size="xs" fw={600}>
                Checks
              </Text>
              <Text size="xs" c="dimmed">
                CTA and stage
              </Text>
            </div>
            <div className={styles.streamStep}>
              <Text size="xs" fw={600}>
                Result
              </Text>
              <Text size="xs" c="dimmed">
                Fixes
              </Text>
            </div>
          </SimpleGrid>

          <ScrollArea.Autosize mah={520} className={styles.streamOutput}>
            <StreamPreviewContent preview={preview} isStreaming={isStreaming} />
          </ScrollArea.Autosize>
        </Stack>
      </Card>
    );
  }

  return (
    <Card className={styles.analysisCard} withBorder padding="md">
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start">
          <Stack gap={2}>
            <Text fw={600}>AI analysis</Text>
            <Text size="sm" c="dimmed">
              {analysis.summary}
            </Text>
          </Stack>
          <Group gap="xs">
            <Badge
              size="lg"
              radius="sm"
              variant="light"
              color={verdictMeta[analysis.verdict].color}
            >
              {verdictMeta[analysis.verdict].label}
            </Badge>
            <Badge size="lg" radius="sm" variant="light">
              {analysis.score}/10
            </Badge>
          </Group>
        </Group>

        <SimpleGrid cols={{ base: 2, sm: 2 }} spacing="xs">
          {Object.entries(analysis.checks).map(([check, status]) => (
            <Group
              key={check}
              className={styles.analysisCheck}
              justify="space-between"
              gap="xs"
            >
              <Text size="xs" c="dimmed">
                {analysisCheckLabels[check as keyof typeof analysisCheckLabels]}
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
          ))}
        </SimpleGrid>

        <Stack gap="xs">
          {analysis.recommendations.map((recommendation, index) => (
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
          ))}
        </Stack>
      </Stack>
    </Card>
  );
}

function StreamPreviewContent({
  isStreaming,
  preview,
}: {
  isStreaming: boolean;
  preview: StreamPreview;
}) {
  const hasContent =
    preview.summary ||
    preview.score !== null ||
    preview.verdict ||
    Object.keys(preview.checks).length > 0 ||
    preview.recommendations.length > 0;

  if (!hasContent) {
    return (
      <Stack gap={4} className={styles.streamHumanOutput}>
        <Text size="sm" fw={600}>
          Preparing the review
          {isStreaming ? <span className={styles.streamCursor}>...</span> : null}
        </Text>
        <Text size="sm" c="dimmed">
          The model is reading the email and separating copy, CTA, stage fit, and recommendations.
        </Text>
      </Stack>
    );
  }

  return (
    <Stack gap="sm" className={styles.streamHumanOutput}>
      {preview.summary ? (
        <Stack gap={2}>
          <Text size="xs" c="dimmed">
            Summary
          </Text>
          <Text size="sm">{preview.summary}</Text>
        </Stack>
      ) : null}

      <Group gap="xs">
        {preview.verdict ? (
          <Badge radius="sm" variant="light" color={verdictMeta[preview.verdict].color}>
            {verdictMeta[preview.verdict].label}
          </Badge>
        ) : null}
        {preview.score !== null ? (
          <Badge radius="sm" variant="light">
            {preview.score}/10
          </Badge>
        ) : null}
        {isStreaming ? (
          <Badge radius="sm" variant="dot" color="blue">
            Writing
          </Badge>
        ) : null}
      </Group>

      {Object.keys(preview.checks).length > 0 ? (
        <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="xs">
          {streamCheckOrder.map((check) => {
            const status = preview.checks[check];
            if (!status) {
              return null;
            }

            return (
              <Group
                key={check}
                className={styles.analysisCheck}
                justify="space-between"
                gap="xs"
              >
                <Text size="xs" c="dimmed">
                  {analysisCheckLabels[check]}
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
            );
          })}
        </SimpleGrid>
      ) : null}

      {preview.recommendations.length > 0 ? (
        <Stack gap="xs">
          <Text size="xs" c="dimmed">
            Recommendations
          </Text>
          {preview.recommendations.map((recommendation, index) => (
            <Stack key={`${recommendation.title ?? "draft"}-${index}`} gap={3}>
              <Group gap="xs">
                {recommendation.priority ? (
                  <Badge
                    size="xs"
                    radius="sm"
                    variant="light"
                    color={priorityMeta[recommendation.priority].color}
                  >
                    {priorityMeta[recommendation.priority].label}
                  </Badge>
                ) : null}
                <Text size="sm" fw={600}>
                  {recommendation.title ?? "Draft recommendation"}
                </Text>
              </Group>
              {recommendation.details ? (
                <Text size="sm" c="dimmed">
                  {recommendation.details}
                </Text>
              ) : null}
            </Stack>
          ))}
        </Stack>
      ) : null}
    </Stack>
  );
}

function buildStreamPreview(text: string): StreamPreview {
  const checks: StreamPreview["checks"] = {};
  setPreviewCheck(checks, "subject", extractEnumField(text, "subject", ["good", "weak", "bad"]));
  setPreviewCheck(checks, "preheader", extractEnumField(text, "preheader", ["good", "weak", "bad"]));
  setPreviewCheck(checks, "focus", extractEnumField(text, "focus", ["good", "weak", "bad"]));
  setPreviewCheck(checks, "cta", extractEnumField(text, "cta", ["good", "weak", "bad"]));
  setPreviewCheck(
    checks,
    "stage_alignment",
    extractEnumField(text, "stage_alignment", ["good", "weak", "bad"])
  );
  setPreviewCheck(
    checks,
    "readability",
    extractEnumField(text, "readability", ["good", "weak", "bad"])
  );

  return {
    summary: extractStringField(text, "summary"),
    score: extractNumberField(text, "score"),
    verdict: extractEnumField(text, "verdict", [
      "ready",
      "minor_fixes",
      "needs_work",
    ]),
    checks,
    recommendations: extractRecommendationPreviews(text),
  };
}

function setPreviewCheck(
  checks: StreamPreview["checks"],
  check: (typeof streamCheckOrder)[number],
  status: EmailAnalysisCheckStatus | null
) {
  if (status) {
    checks[check] = status;
  }
}

function extractStringField(text: string, field: string) {
  const pattern = new RegExp(`"${field}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)`);
  const match = text.match(pattern);
  if (!match) {
    return null;
  }

  return decodeJSONFragment(match[1]);
}

function extractNumberField(text: string, field: string) {
  const pattern = new RegExp(`"${field}"\\s*:\\s*(\\d+)`);
  const match = text.match(pattern);
  if (!match) {
    return null;
  }

  return Number(match[1]);
}

function extractEnumField<T extends string>(
  text: string,
  field: string,
  values: readonly T[]
) {
  const value = extractStringField(text, field);
  if (!value) {
    return null;
  }

  return values.includes(value as T) ? (value as T) : null;
}

function extractRecommendationPreviews(text: string) {
  const recommendations: Partial<EmailRecommendation>[] = [];
  const itemPattern = /\{[^{}]*"priority"\s*:\s*"(high|medium|low)"[^{}]*/g;
  const matches = text.matchAll(itemPattern);

  for (const match of matches) {
    const chunk = match[0];
    recommendations.push({
      priority: match[1] as EmailRecommendation["priority"],
      title: extractStringField(chunk, "title") ?? undefined,
      details: extractStringField(chunk, "details") ?? undefined,
    });
  }

  return recommendations.slice(0, 3);
}

function decodeJSONFragment(value: string) {
  try {
    return JSON.parse(`"${value}"`) as string;
  } catch {
    return value.replace(/\\"/g, '"');
  }
}
