import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Stack,
  Tabs,
  Text,
  Timeline,
  Title,
  Tooltip,
} from "@mantine/core";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  ArrowLeft,
  ChevronDown,
  Check,
  Copy,
  Download,
  MessageSquareText,
  Monitor,
  RefreshCcw,
  Smartphone,
} from "lucide-react";

import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { AISparkleIcon } from "../emails/AISparkleIcon";
import { AnalysisPanel } from "../emails/AnalysisPanel";
import {
  createEmailComment,
  fetchEmailComments,
  fetchEmailDetail,
  fetchEmails,
  resolveComment,
} from "../emails/api";
import { copyOriginalHTML, downloadOriginalHTML } from "../emails/exportHtml";
import {
  MailPreview,
  type ReviewTextSelection,
} from "../emails/MailPreview";
import type { ReviewCommentTarget } from "../emails/reviewOverlayTypes";
import {
  buildStageColumns,
  getAvailableVariants,
  getSelectedVariant,
  getVersionForVariant,
  getVersionsForVariant,
} from "../emails/stages";
import { buildStreamPreview } from "../emails/streamPreview";
import type { EmailComment, EmailVariant } from "../emails/types";
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
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [hoveredCommentId, setHoveredCommentId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const contentRef = useRef<HTMLElement | null>(null);
  const activeCommentTimeoutRef = useRef<number | null>(null);
  const isResizingRef = useRef(false);
  const [isResizing, setIsResizing] = useState(false);
  const emailQuery = useQuery({
    queryKey: ["emails", emailId, "review"],
    queryFn: () => fetchEmailDetail(emailId),
    enabled: emailId.trim() !== "",
  });
  const commentsQuery = useQuery({
    queryKey: ["email-comments", emailId],
    queryFn: () => fetchEmailComments(emailId),
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
  const commentTargets = useMemo(
    () => (commentsQuery.data ?? []).map(commentToTarget),
    [commentsQuery.data]
  );
  const createCommentMutation = useMutation({
    mutationFn: ({
      body,
      selection,
    }: {
      body: string;
      selection: ReviewTextSelection;
    }) =>
      createEmailComment(emailId, {
        review_block: selection.reviewBlock,
        selected_text: selection.selectedText,
        start_offset: selection.startOffset,
        end_offset: selection.endOffset,
        body,
      }),
    onSuccess: () => {
      setActivePanelTab("comments");
      void queryClient.invalidateQueries({
        queryKey: ["email-comments", emailId],
      });
    },
  });
  const resolveMutation = useMutation({
    mutationFn: resolveComment,
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["email-comments", emailId],
      });
    },
  });

  useEffect(
    () => () => {
      if (activeCommentTimeoutRef.current !== null) {
        window.clearTimeout(activeCommentTimeoutRef.current);
      }
    },
    []
  );

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
  const handleCreateReviewComment = (
    selection: ReviewTextSelection,
    body: string
  ) => {
    createCommentMutation.mutate({ body, selection });
  };
  const handleHoverComment = (comment: EmailComment | null) => {
    setHoveredCommentId(comment?.id ?? null);
  };
  const handleHoverCommentIds = (commentIds: string[] | null) => {
    setHoveredCommentId(commentIds?.[0] ?? null);
  };
  const handleSelectComment = (comment: EmailComment) => {
    setActivePanelTab("comments");
    setActiveCommentId(comment.id);

    if (activeCommentTimeoutRef.current !== null) {
      window.clearTimeout(activeCommentTimeoutRef.current);
    }
    activeCommentTimeoutRef.current = window.setTimeout(() => {
      setActiveCommentId(null);
      activeCommentTimeoutRef.current = null;
    }, 2400);
  };
  const handleSelectCommentIds = (commentIds: string[]) => {
    const comment = (commentsQuery.data ?? []).find(
      (commentItem) => commentItem.id === commentIds[0]
    );
    if (comment) {
      handleSelectComment(comment);
    }
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
            activeCommentId={activeCommentId}
            commentTargets={commentTargets}
            createCommentError={createCommentMutation.isError}
            email={email}
            enableReviewSelectionComposer
            hoveredCommentId={hoveredCommentId}
            isCreatingComment={createCommentMutation.isPending}
            isScanning={isAnalyzingCurrentEmail}
            onCommentBadgeClick={handleSelectCommentIds}
            onCommentBadgeHover={handleHoverCommentIds}
            onCreateReviewComment={handleCreateReviewComment}
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
              <CommentsPanel
                comments={commentsQuery.data ?? []}
                isError={commentsQuery.isError}
                isLoading={commentsQuery.isLoading}
                isResolving={resolveMutation.isPending}
                activeCommentId={activeCommentId}
                hoveredCommentId={hoveredCommentId}
                onHoverComment={handleHoverComment}
                onResolve={resolveMutation.mutate}
                onSelectComment={handleSelectComment}
              />
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

function commentToTarget(comment: EmailComment): ReviewCommentTarget {
  return {
    authorKey: comment.author_email ?? comment.user_id ?? "unknown",
    id: comment.id,
    reviewBlock: comment.review_block,
    selectedText: comment.selected_text,
    startOffset: comment.start_offset,
    endOffset: comment.end_offset,
    status: comment.status,
  };
}

function CommentsPanel({
  activeCommentId,
  comments,
  hoveredCommentId,
  isError,
  isLoading,
  isResolving,
  onHoverComment,
  onResolve,
  onSelectComment,
}: {
  activeCommentId: string | null;
  comments: EmailComment[];
  hoveredCommentId: string | null;
  isError: boolean;
  isLoading: boolean;
  isResolving: boolean;
  onHoverComment: (comment: EmailComment | null) => void;
  onResolve: (commentId: string) => void;
  onSelectComment: (comment: EmailComment) => void;
}) {
  if (isLoading) {
    return (
      <Stack className={styles.emptyState} align="center" justify="center">
        <Loader size="sm" />
        <Text c="dimmed" size="sm">
          Loading comments
        </Text>
      </Stack>
    );
  }

  if (isError) {
    return (
      <Alert color="red" title="Failed to load comments">
        Comments are unavailable right now.
      </Alert>
    );
  }

  return (
    <Stack gap="sm">
      {comments.length > 0 ? (
        <Timeline active={comments.length} bulletSize={24} lineWidth={2}>
          {comments.map((comment) => (
            <CommentItem
              isActive={comment.id === activeCommentId}
              isHovered={comment.id === hoveredCommentId}
              comment={comment}
              isResolving={isResolving}
              key={comment.id}
              onHover={onHoverComment}
              onResolve={onResolve}
              onSelect={onSelectComment}
            />
          ))}
        </Timeline>
      ) : (
        <Stack
          className={styles.emptyState}
          align="center"
          justify="center"
          gap="xs"
        >
          <Text fw={600}>No comments yet</Text>
          <Text c="dimmed" ta="center" size="sm">
            Add the first comment to start reviewing this email.
          </Text>
        </Stack>
      )}
    </Stack>
  );
}

function CommentItem({
  comment,
  isActive,
  isHovered,
  isResolving,
  onHover,
  onResolve,
  onSelect,
}: {
  comment: EmailComment;
  isActive: boolean;
  isHovered: boolean;
  isResolving: boolean;
  onHover: (comment: EmailComment | null) => void;
  onResolve: (commentId: string) => void;
  onSelect: (comment: EmailComment) => void;
}) {
  const isResolved = comment.status === "resolved";
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(comment);
    }
  };

  return (
    <Timeline.Item
      bullet={
        isResolved ? (
          <Check aria-hidden="true" size={13} strokeWidth={2.4} />
        ) : (
          <MessageSquareText aria-hidden="true" size={13} strokeWidth={2.2} />
        )
      }
      color={isResolved ? "green" : "yellow"}
      title={
        <Group justify="space-between" gap="xs" wrap="nowrap">
          <Stack gap={2}>
            <Text fw={700} size="xs">
              {comment.author_email ?? "Unknown author"}
            </Text>
            <Text c="dimmed" size="xs">
              {getReviewTargetLabel(comment)}
            </Text>
          </Stack>
          <Badge
            color={isResolved ? "green" : "yellow"}
            size="sm"
            variant="light"
          >
            {comment.status}
          </Badge>
        </Group>
      }
    >
      <Stack
        className={styles.commentItem}
        data-active={isActive || undefined}
        data-hovered={isHovered || undefined}
        gap={8}
        role="button"
        tabIndex={0}
        onClick={() => onSelect(comment)}
        onKeyDown={handleKeyDown}
        onMouseEnter={() => onHover(comment)}
        onMouseLeave={() => onHover(null)}
      >
        <Text className={styles.commentQuote} size="sm">
          {comment.selected_text}
        </Text>
        <Text size="sm">{comment.body}</Text>

        <Group justify="space-between" gap="xs">
          <Text c="dimmed" size="xs">
            {formatCommentDate(comment.created_at)}
          </Text>
          {!isResolved ? (
            <Button
              loading={isResolving}
              size="compact-xs"
              variant="subtle"
              onClick={(event) => {
                event.stopPropagation();
                onResolve(comment.id);
              }}
            >
              Resolve
            </Button>
          ) : null}
        </Group>
      </Stack>
    </Timeline.Item>
  );
}

function formatCommentDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function getReviewTargetLabel(comment: EmailComment) {
  const reviewBlock = comment.review_block;
  if (reviewBlock === "subject") {
    return "Subject";
  }

  if (reviewBlock === "preheader") {
    return "Preheader";
  }

  if (reviewBlock.startsWith("banner")) {
    return "Banner";
  }

  if (reviewBlock.startsWith("headline")) {
    return "Headline";
  }

  if (reviewBlock.startsWith("body")) {
    return isWholeBlockComment(comment) ? "Body block" : "Body text";
  }

  if (reviewBlock.startsWith("cta") || reviewBlock.startsWith("button")) {
    return "CTA";
  }

  if (reviewBlock.startsWith("footer")) {
    return "Footer";
  }

  return formatReviewBlockLabel(reviewBlock);
}

function isWholeBlockComment(comment: EmailComment) {
  return comment.start_offset === 0 && comment.end_offset >= comment.selected_text.length;
}

function formatReviewBlockLabel(reviewBlock: string) {
  return reviewBlock
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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
