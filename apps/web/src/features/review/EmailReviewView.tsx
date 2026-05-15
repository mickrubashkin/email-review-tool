import {
  ActionIcon,
  Alert,
  Badge,
  Burger,
  Button,
  Group,
  Loader,
  Menu,
  Modal,
  SegmentedControl,
  Select,
  Skeleton,
  Stack,
  Tabs,
  Text,
  TextInput,
  Timeline,
  Tooltip,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { Link, useNavigate } from "react-router-dom";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  ArchiveIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowsClockwiseIcon,
  CaretDownIcon,
  ChatTextIcon,
  CheckIcon,
  CopyIcon,
  DeviceMobileIcon,
  DownloadSimpleIcon,
  HouseIcon,
  MonitorIcon,
  PencilSimpleIcon,
  SparkleIcon,
  StackPlusIcon,
} from "@phosphor-icons/react";

import {
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { AnalysisPanel } from "../emails/AnalysisPanel";
import {
  ApiError,
  archiveEmail,
  createEmailComment,
  duplicateEmail,
  fetchEmailComments,
  fetchEmailDetail,
  fetchEmails,
  fetchSharedEmailAnalysis,
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
import type {
  AuthUser,
  DuplicateEmailPayload,
  EmailComment,
  EmailDetail,
  EmailListItem,
  EmailVariant,
  EmailVersionGroup,
} from "../emails/types";
import { useEmailAnalysisStream } from "../emails/useEmailAnalysisStream";
import styles from "./EmailReviewView.module.css";

type EmailReviewViewProps = {
  currentUserRole: AuthUser["role"];
  emailId: string;
};

type ReviewViewport = "desktop" | "mobile";
type ReviewContentTab = "email" | "ai" | "comments";
type ReviewPanelTab = "ai" | "comments";
type CommentStatusFilter = "open" | "all";

const minRightPanelPercent = 24;
const maxRightPanelPercent = 48;

export function EmailReviewView({
  currentUserRole,
  emailId,
}: EmailReviewViewProps) {
  const navigate = useNavigate();
  const [viewport, setViewport] = useState<ReviewViewport>("desktop");
  const [actionMenuOpened, setActionMenuOpened] = useState(false);
  const [activeContentTab, setActiveContentTab] =
    useState<ReviewContentTab>("email");
  const [archiveModalOpened, setArchiveModalOpened] = useState(false);
  const [duplicateModalOpened, setDuplicateModalOpened] = useState(false);
  const [rightPanelPercent, setRightPanelPercent] = useState(30);
  const [activePanelTab, setActivePanelTab] =
    useState<ReviewPanelTab>("comments");
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [commentStatusFilter, setCommentStatusFilter] =
    useState<CommentStatusFilter>("open");
  const [hoveredCommentId, setHoveredCommentId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const contentRef = useRef<HTMLElement | null>(null);
  const activeCommentTimeoutRef = useRef<number | null>(null);
  const isResizingRef = useRef(false);
  const [isResizing, setIsResizing] = useState(false);
  const isCompactReview = useMediaQuery("(max-width: 64em)");
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
  const sharedAnalysisQuery = useQuery({
    queryKey: ["emails", emailId, "ai-analysis"],
    queryFn: () => fetchSharedEmailAnalysis(emailId),
    enabled: emailId.trim() !== "",
  });
  const email = emailQuery.data;
  const stageColumns = useMemo(
    () => buildStageColumns(emailsQuery.data ?? []),
    [emailsQuery.data]
  );
  const emailGroup = useMemo(() => {
    return stageColumns
      .flatMap((column) => column.emailGroups)
      .find((group) => group.versions.some((version) => version.id === emailId));
  }, [emailId, stageColumns]);
  const nextEmailWithOpenComments = useMemo(() => {
    const orderedEmails = stageColumns.flatMap(
      (column) => column.emailGroups.flatMap((group) => group.versions)
    );
    const currentEmailIndex = orderedEmails.findIndex(
      (orderedEmail) => orderedEmail.id === emailId
    );

    if (currentEmailIndex === -1) {
      return null;
    }

    return (
      orderedEmails
        .slice(currentEmailIndex + 1)
        .find((orderedEmail) => (orderedEmail.open_comment_count ?? 0) > 0) ??
      null
    );
  }, [emailId, stageColumns]);
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
  const boardEmailGroups = useMemo(
    () => stageColumns.flatMap((column) => column.emailGroups),
    [stageColumns]
  );
  const currentBoardGroupIndex = emailGroup
    ? boardEmailGroups.findIndex((group) => group.key === emailGroup.key)
    : -1;
  const previousBoardEmail = findNeighborEmail(
    [...boardEmailGroups.slice(0, Math.max(currentBoardGroupIndex, 0))].reverse(),
    selectedVariant,
    email?.language
  );
  const nextBoardEmail = findNeighborEmail(
    boardEmailGroups.slice(currentBoardGroupIndex + 1),
    selectedVariant,
    email?.language
  );
  const currentStage = stageColumns.find((column) =>
    column.emailGroups.some((group) => group.key === emailGroup?.key)
  );
  const {
    analyze,
    reanalyze,
    streamAnalysis,
    streamEmailId,
    streamError,
    streamStatus,
    streamText,
  } = useEmailAnalysisStream(email, true, (analysis) => {
    queryClient.setQueryData(["emails", emailId, "ai-analysis"], analysis);
  });
  const isCurrentStream = streamEmailId === email?.id;
  const displayedAnalysis =
    streamAnalysis && isCurrentStream
      ? streamAnalysis
      : sharedAnalysisQuery.data ?? null;
  const streamPreview = buildStreamPreview(streamText);
  const shouldShowAnalysisPanel =
    (isCurrentStream && streamStatus !== "idle") || Boolean(displayedAnalysis);
  const isAnalyzingCurrentEmail = streamStatus === "streaming" && isCurrentStream;
  const comments = useMemo(
    () => commentsQuery.data ?? [],
    [commentsQuery.data]
  );
  const openCommentCount = comments.filter(
    (comment) => comment.status === "open"
  ).length;
  const filteredComments = useMemo(
    () =>
      commentStatusFilter === "open"
        ? comments.filter((comment) => comment.status === "open")
        : comments,
    [commentStatusFilter, comments]
  );
  const commentTargets = useMemo(
    () => filteredComments.map(commentToTarget),
    [filteredComments]
  );
  const canManageEmail =
    currentUserRole === "admin" || currentUserRole === "super_admin";
  const duplicateEmailMutation = useMutation({
    mutationFn: ({
      sourceEmailId,
      payload,
    }: {
      sourceEmailId: string;
      payload: DuplicateEmailPayload;
    }) => duplicateEmail(sourceEmailId, payload),
    onSuccess: (createdEmail) => {
      void queryClient.invalidateQueries({ queryKey: ["emails"] });
      queryClient.setQueryData(["emails", createdEmail.id, "review"], createdEmail);
      navigate(`/emails/${encodeURIComponent(createdEmail.id)}/review`);
    },
  });
  const archiveEmailMutation = useMutation({
    mutationFn: archiveEmail,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["emails"] });
      notifications.show({
        color: "green",
        message: "Email was removed from the active board.",
        title: "Email archived",
      });
      navigate("/");
    },
    onError: () => {
      notifications.show({
        color: "red",
        message: "Try again or check that you have admin access.",
        title: "Archive failed",
      });
    },
  });
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
      setActiveContentTab("comments");
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

  useEffect(() => {
    for (const neighbor of [previousBoardEmail, nextBoardEmail]) {
      if (!neighbor) {
        continue;
      }

      void queryClient.prefetchQuery({
        queryKey: ["emails", neighbor.id, "review"],
        queryFn: () => fetchEmailDetail(neighbor.id),
      });
      void queryClient.prefetchQuery({
        queryKey: ["email-comments", neighbor.id],
        queryFn: () => fetchEmailComments(neighbor.id),
      });
    }
  }, [nextBoardEmail, previousBoardEmail, queryClient]);

  if (emailQuery.isError) {
    return (
      <Stack className={styles.centerState} align="center" justify="center" p="md">
        <Alert color="red" title="Failed to load review">
          The email may not exist, or the API server may be unreachable.
        </Alert>
      </Stack>
    );
  }

  const handleBackToBoard = () => {
    navigate("/");
  };

  const navigateToReview = (nextEmailId: string) => {
    if (nextEmailId !== email?.id) {
      navigate(`/emails/${encodeURIComponent(nextEmailId)}/review`);
    }
  };

  const handleVariantClick = (variant: EmailVariant) => {
    if (!emailGroup || !email) {
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
    setActiveContentTab("ai");
    analyze();
  };
  const handleReanalyze = () => {
    setActivePanelTab("ai");
    setActiveContentTab("ai");
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
    setActiveContentTab("comments");
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
  const previewContent = (
    email ? (
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
        viewport={isCompactReview ? "mobile" : viewport}
      />
    ) : (
      <ReviewPreviewSkeleton />
    )
  );
  const analysisContent = shouldShowAnalysisPanel ? (
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
      {sharedAnalysisQuery.isLoading ? (
        <>
          <Loader size="sm" />
          <Text c="dimmed" size="sm">
            Loading shared AI analysis
          </Text>
        </>
      ) : (
        <>
          <Text fw={600}>No AI analysis yet</Text>
          <Text c="dimmed" ta="center" size="sm">
            View or generate the shared AI analysis from the header controls.
          </Text>
        </>
      )}
    </Stack>
  );
  const commentsContent = (
    <CommentsPanel
      activeCommentId={activeCommentId}
      comments={comments}
      filteredComments={filteredComments}
      filter={commentStatusFilter}
      hoveredCommentId={hoveredCommentId}
      isError={commentsQuery.isError}
      isLoading={commentsQuery.isLoading}
      isResolving={resolveMutation.isPending}
      nextEmailWithOpenComments={nextEmailWithOpenComments}
      onFilterChange={setCommentStatusFilter}
      onHoverComment={handleHoverComment}
      onNextEmailWithOpenComments={() => {
        if (nextEmailWithOpenComments) {
          navigateToReview(nextEmailWithOpenComments.id);
        }
      }}
      onResolve={resolveMutation.mutate}
      onSelectComment={handleSelectComment}
    />
  );

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Group className={styles.headerMain} gap="sm" wrap="nowrap">
            <Tooltip label="Back to board">
              <ActionIcon
                aria-label="Back to board"
                className={styles.headerIconButton}
                onClick={handleBackToBoard}
                radius="md"
                size="lg"
                variant="subtle"
              >
                <HouseIcon aria-hidden="true" size={18} />
              </ActionIcon>
            </Tooltip>

            <Group className={styles.boardNavigation} gap={4} wrap="nowrap">
              <Tooltip label="Previous email on board">
                <ActionIcon
                  aria-label="Previous email on board"
                  className={styles.headerIconButton}
                  disabled={!previousBoardEmail}
                  onClick={() => {
                    if (previousBoardEmail) {
                      navigateToReview(previousBoardEmail.id);
                    }
                  }}
                  radius="md"
                  size="lg"
                  variant="subtle"
                >
                  <ArrowLeftIcon aria-hidden="true" size={17} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Next email on board">
                <ActionIcon
                  aria-label="Next email on board"
                  className={styles.headerIconButton}
                  disabled={!nextBoardEmail}
                  onClick={() => {
                    if (nextBoardEmail) {
                      navigateToReview(nextBoardEmail.id);
                    }
                  }}
                  radius="md"
                  size="lg"
                  variant="subtle"
                >
                  <ArrowRightIcon aria-hidden="true" size={17} />
                </ActionIcon>
              </Tooltip>
            </Group>

            <Group className={styles.breadcrumbs} gap={6} wrap="nowrap">
              <Text className={styles.breadcrumbText} size="sm" fw={600}>
                {currentStage?.title ?? <Skeleton h={14} w={84} />}
              </Text>
              <Text c="dimmed" size="sm">
                /
              </Text>
              <Text className={styles.titleText} size="sm" fw={600}>
                {email ? formatEmailTitle(email.title) : <Skeleton h={14} w={120} />}
              </Text>
            </Group>

            {!isCompactReview ? (
              <>
                <div className={styles.actionDivider} aria-hidden="true" />

                <Group className={styles.actionGroup} gap="xs" wrap="nowrap">
                  <ViewportSwitch viewport={viewport} onChange={setViewport} />
                </Group>

                <div className={styles.actionDivider} aria-hidden="true" />

                <Group className={styles.actionGroup} gap="xs" wrap="nowrap">
                  <LanguageSelect
                    selectedEmailId={email?.id ?? ""}
                    versions={languageVersions}
                    onSelect={navigateToReview}
                  />

                  <VariantSwitch
                    availableVariants={availableVariants}
                    selectedVariant={selectedVariant}
                    onSelect={handleVariantClick}
                  />
                </Group>
              </>
            ) : null}
          </Group>

          <Group className={styles.headerActions} gap="xs" wrap="nowrap">
            {isCompactReview ? (
              <Menu
                opened={actionMenuOpened}
                position="bottom-end"
                width={260}
                withinPortal
                onChange={setActionMenuOpened}
              >
                <Menu.Target>
                  <Burger
                    aria-label="Open actions menu"
                    opened={actionMenuOpened}
                    size="sm"
                  />
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Label>Email version</Menu.Label>
                  <div className={styles.menuControls}>
                    <LanguageSelect
                      selectedEmailId={email?.id ?? ""}
                      versions={languageVersions}
                      onSelect={navigateToReview}
                    />

                    <VariantSwitch
                      availableVariants={availableVariants}
                      selectedVariant={selectedVariant}
                      onSelect={handleVariantClick}
                    />
                  </div>
                  <Menu.Divider />

                  {canManageEmail ? (
                    <>
                      <Menu.Item
                        disabled={!email}
                        leftSection={
                          <StackPlusIcon aria-hidden="true" size={15} />
                        }
                        onClick={() => {
                          duplicateEmailMutation.reset();
                          setDuplicateModalOpened(true);
                        }}
                      >
                        Duplicate email
                      </Menu.Item>
                      <Menu.Item
                        component={Link}
                        disabled={!email}
                        to={email ? `/emails/${encodeURIComponent(email.id)}/edit` : "#"}
                        leftSection={
                          <PencilSimpleIcon aria-hidden="true" size={15} />
                        }
                      >
                        Edit fields
                      </Menu.Item>
                      <Menu.Item
                        color="red"
                        disabled={!email}
                        leftSection={
                          <ArchiveIcon aria-hidden="true" size={15} />
                        }
                        onClick={() => setArchiveModalOpened(true)}
                      >
                        {archiveEmailMutation.isPending
                          ? "Archiving"
                          : "Archive email"}
                      </Menu.Item>
                      <Menu.Divider />
                    </>
                  ) : null}
                  <Menu.Item
                    disabled={!email}
                    leftSection={
                      <CopyIcon aria-hidden="true" size={15} />
                    }
                    onClick={() => {
                      if (email) {
                        copyOriginalHTML(email);
                      }
                    }}
                  >
                    Copy original HTML
                  </Menu.Item>
                  <Menu.Item
                    disabled={!email}
                    leftSection={
                      <DownloadSimpleIcon aria-hidden="true" size={15} />
                    }
                    onClick={() => {
                      if (email) {
                        downloadOriginalHTML(email);
                      }
                    }}
                  >
                    Download original HTML
                  </Menu.Item>
                  <Menu.Divider />
                  <Menu.Item
                    disabled={!email}
                    leftSection={<SparkleIcon aria-hidden="true" size={15} />}
                    onClick={handleAnalyze}
                  >
                    {isAnalyzingCurrentEmail ? "Analyzing" : "View shared AI analysis"}
                  </Menu.Item>
                  <Menu.Item
                    disabled={!email || isAnalyzingCurrentEmail}
                    leftSection={
                      <ArrowsClockwiseIcon aria-hidden="true" size={15} />
                    }
                    onClick={handleReanalyze}
                  >
                    Generate new shared AI analysis
                  </Menu.Item>
                  <Menu.Divider />
                  <Menu.Item
                    disabled={!nextEmailWithOpenComments}
                    leftSection={<ArrowRightIcon aria-hidden="true" size={15} />}
                    onClick={() => {
                      if (nextEmailWithOpenComments) {
                        navigateToReview(nextEmailWithOpenComments.id);
                      }
                    }}
                  >
                    Next with open comments
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            ) : (
              <>
                {canManageEmail ? (
                  <>
                    <Group className={styles.actionGroup} gap="xs" wrap="nowrap">
                      <Tooltip label="Duplicate email">
                        <ActionIcon
                          aria-label="Duplicate email"
                          className={styles.headerIconButton}
                          disabled={!email}
                          onClick={() => {
                            duplicateEmailMutation.reset();
                            setDuplicateModalOpened(true);
                          }}
                          radius="md"
                          size="lg"
                          variant="light"
                        >
                          <StackPlusIcon aria-hidden="true" size={16} />
                        </ActionIcon>
                      </Tooltip>

                      <Tooltip label="Edit fields">
                        {email ? (
                          <ActionIcon
                            aria-label="Edit fields"
                            className={styles.headerIconButton}
                            component={Link}
                            to={`/emails/${encodeURIComponent(email.id)}/edit`}
                            radius="md"
                            size="lg"
                            variant="light"
                          >
                            <PencilSimpleIcon aria-hidden="true" size={16} />
                          </ActionIcon>
                        ) : (
                          <ActionIcon
                            aria-label="Edit fields"
                            className={styles.headerIconButton}
                            disabled
                            radius="md"
                            size="lg"
                            variant="light"
                          >
                            <PencilSimpleIcon aria-hidden="true" size={16} />
                          </ActionIcon>
                        )}
                      </Tooltip>

                      <Tooltip label="Archive email">
                        <ActionIcon
                          aria-label="Archive email"
                          className={styles.headerIconButton}
                          color="red"
                          loading={archiveEmailMutation.isPending}
                          onClick={() => setArchiveModalOpened(true)}
                          radius="md"
                          size="lg"
                          variant="light"
                        >
                          <ArchiveIcon aria-hidden="true" size={16} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>

                    <div className={styles.actionDivider} aria-hidden="true" />
                  </>
                ) : null}

                <Group className={styles.actionGroup} gap="xs" wrap="nowrap">
                  <Tooltip label="Copy original HTML">
                    <ActionIcon
                      aria-label="Copy original HTML"
                      className={styles.headerIconButton}
                      disabled={!email}
                      onClick={() => {
                        if (email) {
                          copyOriginalHTML(email);
                        }
                      }}
                      radius="md"
                      size="lg"
                      variant="light"
                    >
                      <CopyIcon aria-hidden="true" size={16} />
                    </ActionIcon>
                  </Tooltip>

                  <Tooltip label="Download original HTML">
                    <ActionIcon
                      aria-label="Download original HTML"
                      className={styles.headerIconButton}
                      disabled={!email}
                      onClick={() => {
                        if (email) {
                          downloadOriginalHTML(email);
                        }
                      }}
                      radius="md"
                      size="lg"
                      variant="light"
                    >
                      <DownloadSimpleIcon aria-hidden="true" size={16} />
                    </ActionIcon>
                  </Tooltip>
                </Group>

                <div className={styles.actionDivider} aria-hidden="true" />

                <Group className={styles.actionGroup} gap="xs" wrap="nowrap">
                  <Tooltip label="View the shared AI analysis for this email">
                    <ActionIcon
                      aria-label="View shared AI analysis"
                      className={styles.headerIconButton}
                      loading={isAnalyzingCurrentEmail}
                      onClick={handleAnalyze}
                      radius="md"
                      size="lg"
                      variant="light"
                    >
                      <SparkleIcon aria-hidden="true" size={16} />
                    </ActionIcon>
                  </Tooltip>

                  <Tooltip label="Creates a new shared analysis for this email and replaces the current one for everyone. Limited to 10 per day per email.">
                    <ActionIcon
                      aria-label="Generate new shared AI analysis"
                      className={styles.headerIconButton}
                      disabled={isAnalyzingCurrentEmail}
                      onClick={handleReanalyze}
                      radius="md"
                      size="lg"
                      variant="light"
                    >
                      <ArrowsClockwiseIcon aria-hidden="true" size={16} />
                    </ActionIcon>
                  </Tooltip>
                </Group>

                <div className={styles.actionDivider} aria-hidden="true" />

                <Group className={styles.actionGroup} gap="xs" wrap="nowrap">
                  <Tooltip
                    label={
                      nextEmailWithOpenComments
                        ? "Next email with open comments"
                        : "No later emails with open comments"
                    }
                  >
                    <ActionIcon
                      aria-label="Next email with open comments"
                      className={styles.headerIconButton}
                      disabled={!nextEmailWithOpenComments}
                      onClick={() => {
                        if (nextEmailWithOpenComments) {
                          navigateToReview(nextEmailWithOpenComments.id);
                        }
                      }}
                      radius="md"
                      size="lg"
                      variant="light"
                    >
                      <ArrowRightIcon aria-hidden="true" size={16} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              </>
            )}
          </Group>
        </div>
      </header>

      {duplicateModalOpened && email ? (
        <DuplicateEmailModal
          email={email}
          error={duplicateEmailMutation.error}
          isSubmitting={duplicateEmailMutation.isPending}
          onClose={() => {
            duplicateEmailMutation.reset();
            setDuplicateModalOpened(false);
          }}
          onResetError={() => duplicateEmailMutation.reset()}
          onSubmit={async (sourceEmailId, payload) => {
            await duplicateEmailMutation.mutateAsync({ sourceEmailId, payload });
            setDuplicateModalOpened(false);
          }}
        />
      ) : null}

      {email ? (
        <ArchiveEmailModal
          email={email}
          isSubmitting={archiveEmailMutation.isPending}
          opened={archiveModalOpened}
          onClose={() => setArchiveModalOpened(false)}
          onSubmit={async (archiveEmailId) => {
            await archiveEmailMutation.mutateAsync(archiveEmailId);
            setArchiveModalOpened(false);
          }}
        />
      ) : null}

      {isCompactReview ? (
        <main className={styles.mobileContent}>
          <Tabs
            value={activeContentTab}
            onChange={(value) =>
              setActiveContentTab((value as ReviewContentTab | null) ?? "email")
            }
          >
            <Tabs.List className={styles.mobileTabsList} grow>
              <Tabs.Tab value="email">Email</Tabs.Tab>
              <Tabs.Tab value="ai">AI</Tabs.Tab>
              <Tabs.Tab
                value="comments"
                leftSection={
                  <ChatTextIcon aria-hidden="true" size={15} />
                }
              >
                {openCommentCount > 0
                  ? `Comments ${openCommentCount}`
                  : "Comments"}
              </Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="email" className={styles.mobileTabPanel}>
              {previewContent}
            </Tabs.Panel>

            <Tabs.Panel value="ai" className={styles.mobileTabPanel}>
              {analysisContent}
            </Tabs.Panel>

            <Tabs.Panel value="comments" className={styles.mobileTabPanel}>
              {commentsContent}
            </Tabs.Panel>
          </Tabs>
        </main>
      ) : (
        <main
          className={styles.content}
          ref={contentRef}
          style={
            {
              "--review-panel-width": `${rightPanelPercent}%`,
            } as CSSProperties
          }
        >
          <section className={styles.previewColumn}>{previewContent}</section>

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
                    <ChatTextIcon aria-hidden="true" size={15} />
                  }
                >
                  {openCommentCount > 0
                    ? `Comments ${openCommentCount}`
                    : "Comments"}
                </Tabs.Tab>
              </Tabs.List>

              <Tabs.Panel value="ai" className={styles.tabPanel}>
                {analysisContent}
              </Tabs.Panel>

              <Tabs.Panel value="comments" className={styles.tabPanel}>
                {commentsContent}
              </Tabs.Panel>
            </Tabs>
          </aside>
        </main>
      )}
    </div>
  );
}

function clampPercent(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function ReviewPreviewSkeleton() {
  return (
    <div className={styles.previewSkeleton}>
      <Stack gap="md">
        <Group gap="sm" wrap="nowrap">
          <Skeleton circle h={40} w={40} />
          <Stack gap={6} flex={1}>
            <Skeleton h={12} w={140} />
            <Skeleton h={12} w="60%" />
            <Skeleton h={10} w={180} />
          </Stack>
        </Group>
        <Skeleton h={220} radius="md" />
        <Stack gap="sm">
          <Skeleton h={14} w="42%" />
          <Skeleton h={14} w="72%" />
          <Skeleton h={14} w="68%" />
          <Skeleton h={14} w="58%" />
        </Stack>
      </Stack>
    </div>
  );
}

function findNeighborEmail(
  groups: EmailVersionGroup[],
  variant: EmailVariant,
  preferredLanguage: string | undefined
) {
  for (const group of groups) {
    const email = getVersionForVariant(
      group.versions,
      variant,
      preferredLanguage
    );
    if (email) {
      return email;
    }
  }

  return undefined;
}

function formatEmailTitle(title: string) {
  switch (title) {
    case "Follow Up 1":
      return "First Follow-up";
    case "Follow Up 2":
      return "Second Follow-up";
    default:
      return title;
  }
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
  filteredComments,
  filter,
  hoveredCommentId,
  isError,
  isLoading,
  isResolving,
  nextEmailWithOpenComments,
  onFilterChange,
  onHoverComment,
  onNextEmailWithOpenComments,
  onResolve,
  onSelectComment,
}: {
  activeCommentId: string | null;
  comments: EmailComment[];
  filteredComments: EmailComment[];
  filter: CommentStatusFilter;
  hoveredCommentId: string | null;
  isError: boolean;
  isLoading: boolean;
  isResolving: boolean;
  nextEmailWithOpenComments: EmailListItem | null;
  onFilterChange: (filter: CommentStatusFilter) => void;
  onHoverComment: (comment: EmailComment | null) => void;
  onNextEmailWithOpenComments: () => void;
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

  const openCount = comments.filter((comment) => comment.status === "open").length;
  const resolvedCount = comments.filter(
    (comment) => comment.status === "resolved"
  ).length;

  return (
    <Stack gap="sm">
      {comments.length > 0 ? (
        <Group className={styles.commentFilterBar} justify="space-between" gap="xs">
          <Group gap={6} wrap="nowrap">
            <Badge color="yellow" size="sm" variant="light">
              Open {openCount}
            </Badge>
            <Badge color="green" size="sm" variant="light">
              Resolved {resolvedCount}
            </Badge>
            <Badge color="gray" size="sm" variant="light">
              All {comments.length}
            </Badge>
          </Group>

          <SegmentedControl
            aria-label="Comment status filter"
            className={styles.commentFilterControl}
            data={[
              { label: "Open", value: "open" },
              { label: "All", value: "all" },
            ]}
            size="xs"
            value={filter}
            onChange={(value) => onFilterChange(value as CommentStatusFilter)}
          />
        </Group>
      ) : null}

      {filteredComments.length > 0 ? (
        <Timeline active={filteredComments.length} bulletSize={24} lineWidth={2}>
          {filteredComments.map((comment) => (
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
      ) : comments.length > 0 ? (
        <Stack
          className={styles.emptyState}
          align="center"
          justify="center"
          gap="xs"
        >
          <Text fw={600}>No open comments</Text>
          <Text c="dimmed" ta="center" size="sm">
            Resolved comments are hidden. Switch to All to review them.
          </Text>
          {nextEmailWithOpenComments ? (
            <Button
              rightSection={<ArrowRightIcon aria-hidden="true" size={15} />}
              size="xs"
              variant="light"
              onClick={onNextEmailWithOpenComments}
            >
              Next with open comments
            </Button>
          ) : null}
        </Stack>
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
          <CheckIcon aria-hidden="true" size={13} weight="bold" />
        ) : (
          <ChatTextIcon aria-hidden="true" size={13} />
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

function ArchiveEmailModal({
  email,
  isSubmitting,
  onClose,
  onSubmit,
  opened,
}: {
  email: EmailDetail;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (emailId: string) => Promise<void>;
  opened: boolean;
}) {
  const handleArchive = async () => {
    try {
      await onSubmit(email.id);
    } catch {
      // The parent mutation shows the notification; keep the modal open.
    }
  };

  return (
    <Modal centered opened={opened} title="Archive email" onClose={onClose}>
      <Stack gap="sm">
        <Text size="sm">
          Archive "{email.title}"? It will be hidden from the active board, but
          comments and history will stay in the database.
        </Text>
        <Group justify="flex-end" mt="xs">
          <Button
            disabled={isSubmitting}
            type="button"
            variant="default"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            color="red"
            loading={isSubmitting}
            onClick={handleArchive}
          >
            Archive email
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function DuplicateEmailModal({
  email,
  error,
  isSubmitting,
  onClose,
  onResetError,
  onSubmit,
}: {
  email: EmailDetail;
  error: Error | null;
  isSubmitting: boolean;
  onClose: () => void;
  onResetError: () => void;
  onSubmit: (emailId: string, payload: DuplicateEmailPayload) => Promise<void>;
}) {
  const [language, setLanguage] = useState("");
  const [variant, setVariant] = useState<EmailVariant>(email.variant);
  const [title, setTitle] = useState(email.title);
  const [subject, setSubject] = useState(email.subject ?? "");
  const [preheader, setPreheader] = useState(email.preheader ?? "");
  const [languageError, setLanguageError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedLanguage = language.trim().toLowerCase();
    if (!normalizedLanguage) {
      setLanguageError("Language is required");
      return;
    }

    setLanguageError(null);
    try {
      await onSubmit(email.id, {
        language: normalizedLanguage,
        variant,
        ...buildOptionalTextPayload("title", title, email.title),
        ...buildOptionalTextPayload("subject", subject, email.subject),
        ...buildOptionalTextPayload("preheader", preheader, email.preheader),
      });
    } catch {
      // React Query stores the error; keep the modal open and show it inline.
    }
  };

  const isConflict = error instanceof ApiError && error.status === 409;

  return (
    <Modal centered opened title="Duplicate email" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <Stack gap="sm">
          {error ? (
            <Alert color="red" title="Could not duplicate email">
              {isConflict
                ? "This language and variant already exist for the selected email."
                : "Try again or check that the API server is reachable."}
            </Alert>
          ) : null}

          <TextInput
            data-autofocus
            disabled={isSubmitting}
            error={languageError}
            label="Language"
            placeholder="es"
            value={language}
            onChange={(event) => {
              onResetError();
              setLanguage(event.currentTarget.value);
              if (languageError) {
                setLanguageError(null);
              }
            }}
          />

          <Select
            allowDeselect={false}
            data={[
              { label: "New", value: "new" },
              { label: "Old", value: "old" },
            ]}
            disabled={isSubmitting}
            label="Variant"
            value={variant}
            onChange={(value) => {
              onResetError();
              setVariant((value as EmailVariant) ?? "new");
            }}
          />

          <TextInput
            disabled={isSubmitting}
            label="Title"
            value={title}
            onChange={(event) => {
              onResetError();
              setTitle(event.currentTarget.value);
            }}
          />

          <TextInput
            disabled={isSubmitting}
            label="Subject"
            value={subject}
            onChange={(event) => {
              onResetError();
              setSubject(event.currentTarget.value);
            }}
          />

          <TextInput
            disabled={isSubmitting}
            label="Preheader"
            value={preheader}
            onChange={(event) => {
              onResetError();
              setPreheader(event.currentTarget.value);
            }}
          />

          <Group justify="flex-end" mt="xs">
            <Button
              disabled={isSubmitting}
              type="button"
              variant="default"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button loading={isSubmitting} type="submit">
              Create duplicate
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

function buildOptionalTextPayload<Key extends "title" | "subject" | "preheader">(
  key: Key,
  value: string,
  originalValue: string | null
): Partial<Record<Key, string>> {
  if (value === "" && originalValue === null) {
    return {};
  }

  if (key === "title" && value.trim() === "") {
    return {};
  }

  return {
    [key]: key === "title" ? value.trim() : value,
  } as Partial<Record<Key, string>>;
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
      <CaretDownIcon
        aria-hidden="true"
        className={styles.selectIcon}
        size={14}
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
          <MonitorIcon aria-hidden="true" size={16} />
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
          <DeviceMobileIcon aria-hidden="true" size={16} />
        </button>
      </Tooltip>
    </Group>
  );
}
