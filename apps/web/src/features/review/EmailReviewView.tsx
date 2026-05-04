import {
  ActionIcon,
  Alert,
  Badge,
  Group,
  Loader,
  Stack,
  Tabs,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ChevronDown,
  Copy,
  Download,
  MessageSquareText,
  Monitor,
  RefreshCcw,
  Smartphone,
} from "lucide-react";
import { type CSSProperties, type PointerEvent, useMemo, useRef, useState } from "react";

import { AISparkleIcon } from "../emails/AISparkleIcon";
import { AnalysisPanel } from "../emails/AnalysisPanel";
import { fetchEmailDetail, fetchEmails } from "../emails/api";
import { copyOriginalHTML, downloadOriginalHTML } from "../emails/exportHtml";
import { MailPreview } from "../emails/MailPreview";
import {
  buildStageColumns,
  getAvailableVariants,
  getSelectedVariant,
  getVersionForVariant,
  getVersionsForVariant,
} from "../emails/stages";
import { buildStreamPreview } from "../emails/streamPreview";
import type { EmailVariant } from "../emails/types";
import { useEmailAnalysisStream } from "../emails/useEmailAnalysisStream";
import styles from "./EmailReviewView.module.css";

type EmailReviewViewProps = {
  emailId: string;
};

type ReviewViewport = "desktop" | "mobile";
type ReviewPanelTab = "ai" | "comments";

const minRightPanelPercent = 24;
const maxRightPanelPercent = 48;

export function EmailReviewView({ emailId }: EmailReviewViewProps) {
  const [viewport, setViewport] = useState<ReviewViewport>("desktop");
  const [rightPanelPercent, setRightPanelPercent] = useState(30);
  const [activePanelTab, setActivePanelTab] =
    useState<ReviewPanelTab>("comments");
  const contentRef = useRef<HTMLElement | null>(null);
  const isResizingRef = useRef(false);
  const [isResizing, setIsResizing] = useState(false);
  const emailQuery = useQuery({
    queryKey: ["emails", emailId, "review"],
    queryFn: () => fetchEmailDetail(emailId),
    enabled: emailId.trim() !== "",
  });
  const emailsQuery = useQuery({
    queryKey: ["emails"],
    queryFn: fetchEmails,
  });
  const email = emailQuery.data;
  const emailGroup = useMemo(() => {
    const columns = buildStageColumns(emailsQuery.data ?? []);
    return columns
      .flatMap((column) => column.emailGroups)
      .find((group) => group.versions.some((version) => version.id === emailId));
  }, [emailId, emailsQuery.data]);
  const selectedVariant = emailGroup
    ? getSelectedVariant(emailGroup.versions, emailId)
    : email?.variant ?? "new";
  const selectedVariantVersions = emailGroup
    ? getVersionsForVariant(emailGroup.versions, selectedVariant)
    : [];
  const languageVersions =
    selectedVariantVersions.length > 0 || !email
      ? selectedVariantVersions
      : [{ id: email.id, language: email.language }];
  const availableVariants = emailGroup
    ? getAvailableVariants(emailGroup.versions)
    : email
      ? [email.variant as EmailVariant]
      : [];
  const {
    analyze,
    reanalyze,
    streamAnalysis,
    streamEmailId,
    streamError,
    streamStatus,
    streamText,
  } = useEmailAnalysisStream(email, true);
  const isCurrentStream = streamEmailId === email?.id;
  const displayedAnalysis = streamAnalysis && isCurrentStream ? streamAnalysis : null;
  const streamPreview = buildStreamPreview(streamText);
  const shouldShowAnalysisPanel =
    isCurrentStream && (streamStatus !== "idle" || Boolean(displayedAnalysis));
  const isAnalyzingCurrentEmail = streamStatus === "streaming" && isCurrentStream;

  if (emailQuery.isLoading) {
    return (
      <Stack className={styles.centerState} align="center" justify="center">
        <Loader />
        <Text c="dimmed">Loading review</Text>
      </Stack>
    );
  }

  if (emailQuery.isError || !email) {
    return (
      <Stack className={styles.centerState} align="center" justify="center" p="md">
        <Alert color="red" title="Failed to load review">
          The email may not exist, or the API server may be unreachable.
        </Alert>
      </Stack>
    );
  }

  const handleBack = () => {
    window.location.href = "/";
  };

  const navigateToReview = (nextEmailId: string) => {
    if (nextEmailId !== email.id) {
      window.location.href = `/emails/${encodeURIComponent(nextEmailId)}/review`;
    }
  };

  const handleVariantClick = (variant: EmailVariant) => {
    if (!emailGroup) {
      return;
    }

    const nextEmail = getVersionForVariant(
      emailGroup.versions,
      variant,
      email.language
    );
    if (nextEmail) {
      navigateToReview(nextEmail.id);
    }
  };
  const handleAnalyze = () => {
    setActivePanelTab("ai");
    analyze();
  };
  const handleReanalyze = () => {
    setActivePanelTab("ai");
    reanalyze();
  };
  const updatePanelWidth = (clientX: number) => {
    const contentElement = contentRef.current;
    if (!contentElement) {
      return;
    }

    const rect = contentElement.getBoundingClientRect();
    const nextRightPanelPercent = ((rect.right - clientX) / rect.width) * 100;
    setRightPanelPercent(
      clampPercent(
        nextRightPanelPercent,
        minRightPanelPercent,
        maxRightPanelPercent
      )
    );
  };
  const handleResizeStart = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    isResizingRef.current = true;
    setIsResizing(true);
    updatePanelWidth(event.clientX);
  };
  const handleResizeMove = (event: PointerEvent<HTMLDivElement>) => {
    if (isResizingRef.current) {
      updatePanelWidth(event.clientX);
    }
  };
  const handleResizeEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    isResizingRef.current = false;
    setIsResizing(false);
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Group className={styles.headerMain} gap="sm" wrap="nowrap">
            <Tooltip label="Back">
              <ActionIcon
                aria-label="Back"
                onClick={handleBack}
                radius="md"
                size="lg"
                variant="subtle"
              >
                <ArrowLeft aria-hidden="true" size={18} strokeWidth={2.2} />
              </ActionIcon>
            </Tooltip>

            <Stack className={styles.titleBlock} gap={4}>
              <Group gap="xs" wrap="nowrap">
                <Title className={styles.titleText} order={3}>
                  {email.title}
                </Title>
                <Badge size="sm" variant="light">
                  {email.language.toUpperCase()}
                </Badge>
                <Badge color="gray" size="sm" variant="light">
                  {email.variant}
                </Badge>
              </Group>

              <Stack gap={0}>
                <Text size="sm" lineClamp={1}>
                  {email.subject ?? "No subject"}
                </Text>
                {email.preheader ? (
                  <Text c="dimmed" size="xs" lineClamp={1}>
                    {email.preheader}
                  </Text>
                ) : null}
              </Stack>
            </Stack>
          </Group>

          <Group className={styles.headerActions} gap="xs">
            <LanguageSelect
              selectedEmailId={email.id}
              versions={languageVersions}
              onSelect={navigateToReview}
            />

            <VariantSwitch
              availableVariants={availableVariants}
              selectedVariant={selectedVariant}
              onSelect={handleVariantClick}
            />

            <ViewportSwitch viewport={viewport} onChange={setViewport} />

            <Tooltip label="Copy original HTML">
              <ActionIcon
                aria-label="Copy original HTML"
                onClick={() => copyOriginalHTML(email)}
                radius="md"
                size="lg"
                variant="light"
              >
                <Copy aria-hidden="true" size={16} strokeWidth={2.2} />
              </ActionIcon>
            </Tooltip>

            <Tooltip label="Download original HTML">
              <ActionIcon
                aria-label="Download original HTML"
                onClick={() => downloadOriginalHTML(email)}
                radius="md"
                size="lg"
                variant="light"
              >
                <Download aria-hidden="true" size={16} strokeWidth={2.2} />
              </ActionIcon>
            </Tooltip>

            <Tooltip label="Analyze with AI">
              <ActionIcon
                aria-label="Analyze with AI"
                loading={isAnalyzingCurrentEmail}
                onClick={handleAnalyze}
                radius="md"
                size="lg"
                variant="light"
              >
                <AISparkleIcon />
              </ActionIcon>
            </Tooltip>

            <Tooltip label="Generate a new AI analysis. This will make a new AI request and may use tokens/cost.">
              <ActionIcon
                aria-label="Generate a new AI analysis"
                disabled={isAnalyzingCurrentEmail}
                onClick={handleReanalyze}
                radius="md"
                size="lg"
                variant="light"
              >
                <RefreshCcw aria-hidden="true" size={16} strokeWidth={2.2} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </div>
      </header>

      <main
        className={styles.content}
        ref={contentRef}
        style={
          {
            "--review-panel-width": `${rightPanelPercent}%`,
          } as CSSProperties
        }
      >
        <section className={styles.previewColumn}>
          <MailPreview
            email={email}
            isScanning={isAnalyzingCurrentEmail}
            viewport={viewport}
          />
        </section>

        <div
          aria-label="Resize review panel"
          className={styles.splitter}
          data-active={isResizing || undefined}
          onPointerCancel={handleResizeEnd}
          onPointerDown={handleResizeStart}
          onPointerMove={handleResizeMove}
          onPointerUp={handleResizeEnd}
          role="separator"
        />

        <aside className={styles.reviewPanel}>
          <Tabs
            value={activePanelTab}
            onChange={(value) =>
              setActivePanelTab((value as ReviewPanelTab | null) ?? "comments")
            }
          >
            <Tabs.List grow>
              <Tabs.Tab value="ai">AI</Tabs.Tab>
              <Tabs.Tab
                value="comments"
                leftSection={
                  <MessageSquareText
                    aria-hidden="true"
                    size={15}
                    strokeWidth={2.1}
                  />
                }
              >
                Comments
              </Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="ai" className={styles.tabPanel}>
              {shouldShowAnalysisPanel ? (
                <AnalysisPanel
                  analysis={displayedAnalysis}
                  error={streamError}
                  isStreaming={streamStatus === "streaming"}
                  preview={streamPreview}
                  showError={streamStatus === "error"}
                />
              ) : (
                <Stack
                  className={styles.emptyState}
                  align="center"
                  justify="center"
                  gap="xs"
                >
                  <Text fw={600}>No AI analysis yet</Text>
                  <Text c="dimmed" ta="center" size="sm">
                    Run an AI analysis from the header controls to review this email.
                  </Text>
                </Stack>
              )}
            </Tabs.Panel>

            <Tabs.Panel value="comments" className={styles.tabPanel}>
              <Stack
                className={styles.emptyState}
                align="center"
                justify="center"
                gap="xs"
              >
                <Text fw={600}>No comments yet</Text>
                <Text c="dimmed" ta="center" size="sm">
                  Comments will appear here when comment mode is added.
                </Text>
              </Stack>
            </Tabs.Panel>
          </Tabs>
        </aside>
      </main>
    </div>
  );
}

function clampPercent(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function LanguageSelect({
  onSelect,
  selectedEmailId,
  versions,
}: {
  onSelect: (emailId: string) => void;
  selectedEmailId: string;
  versions: Array<{ id: string; language: string }>;
}) {
  return (
    <label className={styles.selectWrap}>
      <select
        aria-label="Email language"
        className={styles.select}
        disabled={versions.length <= 1}
        value={selectedEmailId}
        onChange={(event) => onSelect(event.currentTarget.value)}
      >
        {versions.map((version) => (
          <option key={version.id} value={version.id}>
            {version.language.toUpperCase()}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden="true"
        className={styles.selectIcon}
        size={14}
        strokeWidth={2.2}
      />
    </label>
  );
}

function VariantSwitch({
  availableVariants,
  onSelect,
  selectedVariant,
}: {
  availableVariants: EmailVariant[];
  onSelect: (variant: EmailVariant) => void;
  selectedVariant: EmailVariant;
}) {
  return (
    <Group className={styles.segmentedControl} gap={0}>
      {(["new", "old"] as const).map((variant) => (
        <button
          aria-label={`${variant} email variant`}
          className={styles.segmentedButton}
          data-active={variant === selectedVariant || undefined}
          disabled={!availableVariants.includes(variant)}
          key={variant}
          type="button"
          onClick={() => onSelect(variant)}
        >
          {variant}
        </button>
      ))}
    </Group>
  );
}

function ViewportSwitch({
  onChange,
  viewport,
}: {
  onChange: (viewport: ReviewViewport) => void;
  viewport: ReviewViewport;
}) {
  return (
    <Group className={styles.segmentedControl} gap={0}>
      <Tooltip label="Desktop preview">
        <button
          aria-label="Desktop preview"
          className={styles.iconSegmentedButton}
          data-active={viewport === "desktop" || undefined}
          type="button"
          onClick={() => onChange("desktop")}
        >
          <Monitor aria-hidden="true" size={16} strokeWidth={2.2} />
        </button>
      </Tooltip>

      <Tooltip label="Mobile preview">
        <button
          aria-label="Mobile preview"
          className={styles.iconSegmentedButton}
          data-active={viewport === "mobile" || undefined}
          type="button"
          onClick={() => onChange("mobile")}
        >
          <Smartphone aria-hidden="true" size={16} strokeWidth={2.2} />
        </button>
      </Tooltip>
    </Group>
  );
}
