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
  Textarea,
  TextInput,
  Timeline,
  Tooltip,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { useNavigate } from "react-router-dom";

import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

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
  SparkleIcon,
  StackPlusIcon,
} from "@phosphor-icons/react";

import {
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent,
  type RefCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { AnalysisPanel } from "../emails/AnalysisPanel";
import {
  ApiError,
  archiveEmail,
  createEmailAdaptation,
  createCommentMessage,
  createEmailComment,
  duplicateEmail,
  fetchEmailActivity,
  fetchEmailComments,
  fetchEmailDetail,
  fetchEmails,
  fetchSharedEmailAnalysis,
  resolveComment,
  updateEmailEditableFields,
  updateEmailReviewStatus,
} from "../emails/api";
import {
  formatEmailUpdateChangedFields,
  formatEmailUpdateSummary,
} from "../emails/changeSummary";
import { copyOriginalHTML, downloadOriginalHTML } from "../emails/exportHtml";
import {
  MailPreview,
  type InlineEditUpdate,
  type ReviewTextSelection,
} from "../emails/MailPreview";
import type { ReviewCommentTarget } from "../emails/reviewOverlayTypes";
import {
  emailReviewStatusColor,
  emailReviewStatusOptions,
  formatEmailReviewStatus,
} from "../emails/reviewStatus";
import {
  buildStageColumns,
  getAvailableAdaptations,
  getAvailableVariants,
  getSelectedAdaptation,
  getSelectedVariant,
  getVersionForVariant,
  getVersionsForVariantAndAdaptation,
} from "../emails/stages";
import { buildStreamPreview } from "../emails/streamPreview";
import type {
  AuthUser,
  CreateEmailAdaptationPayload,
  DuplicateEmailPayload,
  EmailActivityItem,
  EmailComment,
  EmailCommentSeverity,
  EmailDetail,
  EmailListItem,
  EmailReviewStatus,
  EmailVariant,
  EmailVersionGroup,
  UpdateEditableFieldsPayload,
} from "../emails/types";
import { useEmailAnalysisStream } from "../emails/useEmailAnalysisStream";
import styles from "./EmailReviewView.module.css";

type EmailReviewViewProps = {
  currentUserRole: AuthUser["role"];
  emailId: string;
};

type ReviewViewport = "desktop" | "mobile";
type ReviewContentTab = "email" | "ai" | "comments" | "activity";
type ReviewPanelTab = "ai" | "comments" | "activity";
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
  const [adaptationModalOpened, setAdaptationModalOpened] = useState(false);
  const [sourceHTMLModalOpened, setSourceHTMLModalOpened] = useState(false);
  const [sourceHTMLDraft, setSourceHTMLDraft] = useState("");
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
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
  });
  const activityQuery = useQuery({
    queryKey: ["email-activity", emailId],
    queryFn: () => fetchEmailActivity(emailId),
    enabled: emailId.trim() !== "",
  });
  const email = emailQuery.data;
  const emailsQuery = useQuery({
    queryKey: ["emails", email?.sequence ?? "all"],
    queryFn: () => fetchEmails(email?.sequence),
    enabled: Boolean(email?.sequence),
  });
  const sharedAnalysisQuery = useQuery({
    queryKey: ["emails", emailId, "ai-analysis"],
    queryFn: () => fetchSharedEmailAnalysis(emailId),
    enabled: emailId.trim() !== "",
  });
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
    : email?.variant ?? "v1";
  const selectedAdaptation = emailGroup
    ? getSelectedAdaptation(emailGroup.versions, emailId)
    : email?.adaptation_key ?? "default";
  const selectedVariantVersions = emailGroup
    ? getVersionsForVariantAndAdaptation(
        emailGroup.versions,
        selectedVariant,
        selectedAdaptation
      )
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
  const availableAdaptations = emailGroup
    ? getAvailableAdaptations(emailGroup.versions, selectedVariant)
    : email
      ? [email]
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
    email?.language,
    selectedAdaptation
  );
  const nextBoardEmail = findNeighborEmail(
    boardEmailGroups.slice(currentBoardGroupIndex + 1),
    selectedVariant,
    email?.language,
    selectedAdaptation
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
    void queryClient.invalidateQueries({ queryKey: ["email-activity", emailId] });
  });
  const isCurrentStream = streamEmailId === email?.id;
  useEffect(() => {
    if (isCurrentStream && (streamStatus === "done" || streamStatus === "error")) {
      void queryClient.invalidateQueries({ queryKey: ["email-activity", emailId] });
    }
  }, [emailId, isCurrentStream, queryClient, streamStatus]);
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
  const openBlockingCommentCount = comments.filter(
    (comment) => comment.status === "open" && comment.severity === "blocking"
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

  useEffect(() => {
    if (!commentsQuery.data) {
      return;
    }

    queryClient.setQueryData<EmailListItem[]>(["emails"], (currentEmails) => {
      if (!currentEmails) {
        return currentEmails;
      }

      return currentEmails.map((currentEmail) =>
        currentEmail.id === emailId
          ? {
              ...currentEmail,
              open_comment_count: openCommentCount,
              open_blocking_comment_count: openBlockingCommentCount,
            }
          : currentEmail
      );
    });
    if (email?.sequence) {
      queryClient.setQueryData<EmailListItem[]>(
        ["emails", email.sequence],
        (currentEmails) => {
          if (!currentEmails) {
            return currentEmails;
          }

          return currentEmails.map((currentEmail) =>
            currentEmail.id === emailId
              ? {
                  ...currentEmail,
                  open_comment_count: openCommentCount,
                  open_blocking_comment_count: openBlockingCommentCount,
                }
              : currentEmail
          );
        }
      );
    }

    queryClient.setQueryData<EmailDetail>(
      ["emails", emailId, "review"],
      (currentEmail) =>
        currentEmail
          ? {
              ...currentEmail,
              open_comment_count: openCommentCount,
              open_blocking_comment_count: openBlockingCommentCount,
            }
          : currentEmail
    );
  }, [
    commentsQuery.data,
    email?.sequence,
    emailId,
    openBlockingCommentCount,
    openCommentCount,
    queryClient,
  ]);

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
      void queryClient.invalidateQueries({ queryKey: ["email-activity", emailId] });
      queryClient.setQueryData(["emails", createdEmail.id, "review"], createdEmail);
      navigate(`/emails/${encodeURIComponent(createdEmail.id)}/review`);
    },
  });
  const createAdaptationMutation = useMutation({
    mutationFn: ({
      sourceEmailId,
      payload,
    }: {
      sourceEmailId: string;
      payload: CreateEmailAdaptationPayload;
    }) => createEmailAdaptation(sourceEmailId, payload),
    onSuccess: (createdEmail) => {
      void queryClient.invalidateQueries({ queryKey: ["emails"] });
      void queryClient.invalidateQueries({ queryKey: ["email-activity", emailId] });
      queryClient.setQueryData(["emails", createdEmail.id, "review"], createdEmail);
      navigate(`/emails/${encodeURIComponent(createdEmail.id)}/review`);
    },
  });
  const archiveEmailMutation = useMutation({
    mutationFn: archiveEmail,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["emails"] });
      void queryClient.invalidateQueries({ queryKey: ["email-activity", emailId] });
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
  const reviewStatusMutation = useMutation({
    mutationFn: ({
      nextStatus,
      targetEmailId,
    }: {
      nextStatus: EmailReviewStatus;
      targetEmailId: string;
    }) =>
      updateEmailReviewStatus(targetEmailId, {
        review_status: nextStatus,
      }),
    onSuccess: (response, variables) => {
      applyReviewStatusToCaches(
        queryClient,
        variables.targetEmailId,
        response.review_status,
        email?.sequence
      );
      void queryClient.invalidateQueries({
        queryKey: ["email-activity", variables.targetEmailId],
      });
      notifications.show({
        color: "green",
        message: `Review status changed to ${formatEmailReviewStatus(response.review_status)}.`,
        title: "Status updated",
      });
    },
    onError: () => {
      notifications.show({
        color: "red",
        message: "Try again or check that you have admin access.",
        title: "Status update failed",
      });
    },
  });
  const createCommentMutation = useMutation({
    mutationFn: ({
      body,
      severity,
      selection,
    }: {
      body: string;
      severity: EmailCommentSeverity;
      selection: ReviewTextSelection;
    }) =>
      createEmailComment(emailId, {
        review_block: selection.reviewBlock,
        selected_text: selection.selectedText,
        start_offset: selection.startOffset,
        end_offset: selection.endOffset,
        body,
        severity,
      }),
    onSuccess: () => {
      setActivePanelTab("comments");
      setActiveContentTab("comments");
      void queryClient.invalidateQueries({
        queryKey: ["email-comments", emailId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["email-activity", emailId],
      });
    },
  });
  const inlineEditMutation = useMutation({
    mutationFn: (payload: UpdateEditableFieldsPayload) =>
      updateEmailEditableFields(emailId, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["emails", emailId, "review"],
      });
      await queryClient.invalidateQueries({ queryKey: ["emails"] });
      if (email?.sequence) {
        await queryClient.invalidateQueries({ queryKey: ["emails", email.sequence] });
      }
      await queryClient.invalidateQueries({ queryKey: ["email-activity", emailId] });
      setSourceHTMLModalOpened(false);
      notifications.show({
        color: "green",
        message: "Email content was updated.",
        title: "Saved",
      });
    },
    onError: () => {
      notifications.show({
        color: "red",
        message: "Try again or check the editable markers.",
        title: "Save failed",
      });
    },
  });
  const resolveMutation = useMutation({
    mutationFn: resolveComment,
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["email-comments", emailId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["email-activity", emailId],
      });
    },
  });
  const createCommentMessageMutation = useMutation({
    mutationFn: ({ body, commentId }: { body: string; commentId: string }) =>
      createCommentMessage(commentId, { body }),
    onSuccess: (message, variables) => {
      queryClient.setQueryData<EmailComment[]>(
        ["email-comments", emailId],
        (currentComments) =>
          currentComments?.map((comment) =>
            comment.id === variables.commentId
              ? {
                  ...comment,
                  messages: [...(comment.messages ?? []), message],
                }
              : comment
          ) ?? currentComments
      );
      void queryClient.invalidateQueries({
        queryKey: ["email-activity", emailId],
      });
    },
    onError: (error) => {
      notifications.show({
        color: "red",
        message:
          error instanceof ApiError && error.status === 409
            ? "This comment is already resolved."
            : "Try again in a moment.",
        title: "Reply failed",
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
    navigate(email?.sequence ? `/boards/${encodeURIComponent(email.sequence)}` : "/");
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
      email.language,
      selectedAdaptation
    );
    if (nextEmail) {
      navigateToReview(nextEmail.id);
    }
  };
  const handleAdaptationSelect = (adaptationKey: string) => {
    if (!emailGroup || !email) {
      return;
    }
    const nextEmail = getVersionForVariant(
      emailGroup.versions,
      selectedVariant,
      email.language,
      adaptationKey
    );
    if (nextEmail) {
      navigateToReview(nextEmail.id);
    }
  };
  const handleAnalyze = () => {
    setActivePanelTab("ai");
    setActiveContentTab("ai");
    analyze();
    void queryClient.invalidateQueries({ queryKey: ["email-activity", emailId] });
  };
  const handleReanalyze = () => {
    setActivePanelTab("ai");
    setActiveContentTab("ai");
    reanalyze();
    void queryClient.invalidateQueries({ queryKey: ["email-activity", emailId] });
  };
  const handleReviewStatusChange = (value: string | null) => {
    if (!email || !value || value === email.review_status) {
      return;
    }

    reviewStatusMutation.mutate({
      nextStatus: value as EmailReviewStatus,
      targetEmailId: email.id,
    });
  };
  const handleCreateReviewComment = (
    selection: ReviewTextSelection,
    body: string,
    severity: EmailCommentSeverity
  ) => {
    createCommentMutation.mutate({ body, severity, selection });
  };
  const handleApplyInlineEdit = (update: InlineEditUpdate) => {
    if (!email) {
      return;
    }

    inlineEditMutation.mutate(buildEditableFieldsPayload(email, update));
  };
  const openSourceHTMLModal = () => {
    if (!email) {
      return;
    }

    setSourceHTMLDraft(email.original_html);
    setSourceHTMLModalOpened(true);
  };
  const saveSourceHTML = () => {
    if (!email) {
      return;
    }

    inlineEditMutation.mutate(
      buildEditableFieldsPayload(email, {}, sourceHTMLDraft)
    );
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
        canEditContent={canManageEmail}
        canEditHTML={currentUserRole === "super_admin"}
        commentTargets={commentTargets}
        createCommentError={createCommentMutation.isError}
        email={email}
        enableReviewSelectionComposer
        hoveredCommentId={hoveredCommentId}
        inlineEditError={inlineEditMutation.isError}
        isApplyingInlineEdit={inlineEditMutation.isPending}
        isCreatingComment={createCommentMutation.isPending}
        isScanning={isAnalyzingCurrentEmail}
        onApplyInlineEdit={handleApplyInlineEdit}
        onCommentBadgeClick={handleSelectCommentIds}
        onCommentBadgeHover={handleHoverCommentIds}
        onCreateReviewComment={handleCreateReviewComment}
        onEditSourceHTML={openSourceHTMLModal}
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
      onReply={(commentId, body) =>
        createCommentMessageMutation.mutate({ body, commentId })
      }
      onResolve={resolveMutation.mutate}
      onSelectComment={handleSelectComment}
      replyingCommentId={
        createCommentMessageMutation.isPending
          ? createCommentMessageMutation.variables?.commentId
          : null
      }
    />
  );
  const activityContent = (
    <ActivityPanel
      activities={activityQuery.data ?? []}
      isError={activityQuery.isError}
      isLoading={activityQuery.isLoading}
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

            {!isCompactReview && email ? (
              <ReviewStatusControl
                canManage={canManageEmail}
                isUpdating={reviewStatusMutation.isPending}
                status={email.review_status}
                onChange={handleReviewStatusChange}
              />
            ) : null}

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
                  <AdaptationSelect
                    adaptations={availableAdaptations}
                    selectedAdaptation={selectedAdaptation}
                    onSelect={handleAdaptationSelect}
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
                  {email ? (
                    <>
                      <Menu.Label>Review status</Menu.Label>
                      <div className={styles.menuControls}>
                        <ReviewStatusControl
                          canManage={canManageEmail}
                          isUpdating={reviewStatusMutation.isPending}
                          status={email.review_status}
                          onChange={handleReviewStatusChange}
                        />
                      </div>
                      <Menu.Divider />
                    </>
                  ) : null}
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
                    <AdaptationSelect
                      adaptations={availableAdaptations}
                      selectedAdaptation={selectedAdaptation}
                      onSelect={handleAdaptationSelect}
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
                          createAdaptationMutation.reset();
                          setAdaptationModalOpened(true);
                        }}
                      >
                        Create adaptation
                      </Menu.Item>
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
                        Duplicate language/version
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
                      <Tooltip label="Create adaptation">
                        <ActionIcon
                          aria-label="Create adaptation"
                          className={styles.headerIconButton}
                          disabled={!email}
                          onClick={() => {
                            createAdaptationMutation.reset();
                            setAdaptationModalOpened(true);
                          }}
                          radius="md"
                          size="lg"
                          variant="light"
                        >
                          <StackPlusIcon aria-hidden="true" size={16} />
                        </ActionIcon>
                      </Tooltip>

                      <Tooltip label="Duplicate language/version">
                        <ActionIcon
                          aria-label="Duplicate language/version"
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
                          <CopyIcon aria-hidden="true" size={16} />
                        </ActionIcon>
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

      {adaptationModalOpened && email ? (
        <CreateAdaptationModal
          email={email}
          error={createAdaptationMutation.error}
          isSubmitting={createAdaptationMutation.isPending}
          onClose={() => {
            createAdaptationMutation.reset();
            setAdaptationModalOpened(false);
          }}
          onResetError={() => createAdaptationMutation.reset()}
          onSubmit={async (sourceEmailId, payload) => {
            await createAdaptationMutation.mutateAsync({ sourceEmailId, payload });
            setAdaptationModalOpened(false);
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

      {email && currentUserRole === "super_admin" ? (
        <Modal
          opened={sourceHTMLModalOpened}
          size="xl"
          title="Edit source HTML"
          onClose={() => setSourceHTMLModalOpened(false)}
        >
          <Stack gap="sm">
            <Textarea
              autosize
              disabled={inlineEditMutation.isPending}
              minRows={18}
              value={sourceHTMLDraft}
              onChange={(event) => setSourceHTMLDraft(event.currentTarget.value)}
            />
            <Group justify="flex-end" gap="xs">
              <Button
                disabled={inlineEditMutation.isPending}
                variant="subtle"
                onClick={() => setSourceHTMLModalOpened(false)}
              >
                Cancel
              </Button>
              <Button
                loading={inlineEditMutation.isPending}
                onClick={saveSourceHTML}
              >
                Save HTML
              </Button>
            </Group>
          </Stack>
        </Modal>
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
              <Tabs.Tab value="activity">Activity</Tabs.Tab>
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
            <Tabs.Panel value="activity" className={styles.mobileTabPanel}>
              {activityContent}
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
                <Tabs.Tab value="activity">Activity</Tabs.Tab>
              </Tabs.List>

              <Tabs.Panel value="ai" className={styles.tabPanel}>
                {analysisContent}
              </Tabs.Panel>

              <Tabs.Panel value="comments" className={styles.tabPanel}>
                {commentsContent}
              </Tabs.Panel>
              <Tabs.Panel value="activity" className={styles.tabPanel}>
                {activityContent}
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
  preferredLanguage: string | undefined,
  preferredAdaptation: string
) {
  for (const group of groups) {
    const email = getVersionForVariant(
      group.versions,
      variant,
      preferredLanguage,
      preferredAdaptation
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

function ReviewStatusControl({
  canManage,
  isUpdating,
  onChange,
  status,
}: {
  canManage: boolean;
  isUpdating: boolean;
  onChange: (value: string | null) => void;
  status: EmailReviewStatus;
}) {
  if (!canManage) {
    return (
      <Badge
        color={emailReviewStatusColor(status)}
        radius="sm"
        variant="light"
      >
        {formatEmailReviewStatus(status)}
      </Badge>
    );
  }

  return (
    <Select
      allowDeselect={false}
      aria-label="Review status"
      className={styles.reviewStatusSelect}
      data={emailReviewStatusOptions}
      disabled={isUpdating}
      size="xs"
      value={status}
      onChange={onChange}
    />
  );
}

function applyReviewStatusToCaches(
  queryClient: QueryClient,
  emailId: string,
  reviewStatus: EmailReviewStatus,
  sequence: string | undefined
) {
  const updateList = (currentEmails: EmailListItem[] | undefined) =>
    currentEmails?.map((currentEmail) =>
      currentEmail.id === emailId
        ? { ...currentEmail, review_status: reviewStatus }
        : currentEmail
    );

  queryClient.setQueryData<EmailListItem[]>(["emails"], updateList);
  if (sequence) {
    queryClient.setQueryData<EmailListItem[]>(["emails", sequence], updateList);
  }
  queryClient.setQueryData<EmailDetail>(
    ["emails", emailId, "review"],
    (currentEmail) =>
      currentEmail
        ? { ...currentEmail, review_status: reviewStatus }
        : currentEmail
  );
}

function buildEditableFieldsPayload(
  email: EmailDetail,
  update: InlineEditUpdate,
  originalHTML?: string
): UpdateEditableFieldsPayload {
  return {
    title: email.title,
    subject: update.subject ?? email.subject ?? "",
    preheader: update.preheader ?? email.preheader ?? "",
    editable_fields: {
      ...email.editable_fields,
      ...(update.editableFields ?? {}),
    },
    ...(originalHTML !== undefined ? { original_html: originalHTML } : {}),
  };
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
    severity: comment.severity,
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
  onReply,
  onResolve,
  onSelectComment,
  replyingCommentId,
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
  onReply: (commentId: string, body: string) => void;
  onResolve: (commentId: string) => void;
  onSelectComment: (comment: EmailComment) => void;
  replyingCommentId: string | null;
}) {
  const commentItemRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => {
    if (!activeCommentId) {
      return;
    }

    const animationFrame = window.requestAnimationFrame(() => {
      commentItemRefs.current.get(activeCommentId)?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, [activeCommentId, filteredComments]);

  const registerCommentItem =
    (commentId: string): RefCallback<HTMLDivElement> =>
    (node) => {
      if (node) {
        commentItemRefs.current.set(commentId, node);
        return;
      }

      commentItemRefs.current.delete(commentId);
    };

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
  const blockingCount = comments.filter(
    (comment) => comment.status === "open" && comment.severity === "blocking"
  ).length;
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
            {blockingCount > 0 ? (
              <Badge color="red" size="sm" variant="light">
                Blocking {blockingCount}
              </Badge>
            ) : null}
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
              isReplying={comment.id === replyingCommentId}
              isResolving={isResolving}
              itemRef={registerCommentItem(comment.id)}
              key={comment.id}
              onHover={onHoverComment}
              onReply={onReply}
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

function ActivityPanel({
  activities,
  isError,
  isLoading,
}: {
  activities: EmailActivityItem[];
  isError: boolean;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <Stack className={styles.emptyState} align="center" justify="center">
        <Loader size="sm" />
        <Text c="dimmed" size="sm">
          Loading activity
        </Text>
      </Stack>
    );
  }

  if (isError) {
    return (
      <Alert color="red" title="Failed to load activity">
        Activity is unavailable right now.
      </Alert>
    );
  }

  if (activities.length === 0) {
    return (
      <Stack className={styles.emptyState} align="center" justify="center" gap="xs">
        <Text fw={600}>No activity yet</Text>
        <Text c="dimmed" ta="center" size="sm">
          Review actions will appear here as this email changes.
        </Text>
      </Stack>
    );
  }

  return (
    <Timeline active={activities.length} bulletSize={24} lineWidth={2}>
      {activities.map((activity) => (
        <Timeline.Item
          color={activityColor(activity.type)}
          key={activity.id}
          title={
            <Group justify="space-between" gap="xs" wrap="nowrap">
              <Stack gap={2}>
                <Text fw={700} size="xs">
                  {activity.actor_email ?? "System"}
                </Text>
                <Text c="dimmed" size="xs">
                  {formatCommentDate(activity.created_at)}
                </Text>
              </Stack>
              <Badge color={activityColor(activity.type)} size="sm" variant="light">
                {formatActivityType(activity)}
              </Badge>
            </Group>
          }
        >
          <Stack className={styles.activityItem} gap={6}>
            <Text size="sm">{activitySummary(activity)}</Text>
            {activityDetail(activity) ? (
              <Text c="dimmed" size="xs">
                {activityDetail(activity)}
              </Text>
            ) : null}
          </Stack>
        </Timeline.Item>
      ))}
    </Timeline>
  );
}

function CommentItem({
  comment,
  isActive,
  isHovered,
  isReplying,
  isResolving,
  itemRef,
  onHover,
  onReply,
  onResolve,
  onSelect,
}: {
  comment: EmailComment;
  isActive: boolean;
  isHovered: boolean;
  isReplying: boolean;
  isResolving: boolean;
  itemRef: RefCallback<HTMLDivElement>;
  onHover: (comment: EmailComment | null) => void;
  onReply: (commentId: string, body: string) => void;
  onResolve: (commentId: string) => void;
  onSelect: (comment: EmailComment) => void;
}) {
  const isResolved = comment.status === "resolved";
  const [isReplyComposerOpen, setIsReplyComposerOpen] = useState(false);
  const [replyDraft, setReplyDraft] = useState("");
  const trimmedReplyDraft = replyDraft.trim();
  const messages =
    (comment.messages?.length ?? 0) > 0
      ? comment.messages
      : [
          {
            author_email: comment.author_email,
            body: comment.body,
            comment_id: comment.id,
            created_at: comment.created_at,
            id: `${comment.id}-legacy-body`,
            updated_at: comment.created_at,
            user_id: comment.user_id,
          },
        ];
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(comment);
    }
  };
  const handleReplySubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!trimmedReplyDraft) {
      return;
    }

    onReply(comment.id, trimmedReplyDraft);
    setReplyDraft("");
    setIsReplyComposerOpen(false);
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
      color={isResolved ? "green" : commentSeverityColor(comment.severity)}
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
            color={isResolved ? "green" : commentSeverityColor(comment.severity)}
            size="sm"
            variant="light"
          >
            {isResolved ? "resolved" : formatCommentSeverity(comment.severity)}
          </Badge>
        </Group>
      }
    >
      <Stack
        className={styles.commentItem}
        data-active={isActive || undefined}
        data-hovered={isHovered || undefined}
        gap={8}
        ref={itemRef}
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

        <Stack className={styles.commentMessages} gap={8}>
          {messages.map((message) => (
            <Stack className={styles.commentMessage} gap={3} key={message.id}>
              <Group gap={6} wrap="nowrap">
                <Text fw={650} size="xs">
                  {message.author_email ?? "Unknown author"}
                </Text>
                <Text c="dimmed" size="xs">
                  {formatCommentDate(message.created_at)}
                </Text>
              </Group>
              <Text size="sm">{message.body}</Text>
            </Stack>
          ))}
        </Stack>

        {isReplyComposerOpen && !isResolved ? (
          <form
            className={styles.commentReplyForm}
            onClick={(event) => event.stopPropagation()}
            onSubmit={handleReplySubmit}
          >
            <Textarea
              autosize
              disabled={isReplying}
              minRows={2}
              placeholder="Reply"
              size="xs"
              value={replyDraft}
              onChange={(event) => setReplyDraft(event.currentTarget.value)}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
            />
            <Group justify="flex-end" gap="xs">
              <Button
                disabled={isReplying}
                size="compact-xs"
                variant="subtle"
                onClick={(event) => {
                  event.stopPropagation();
                  setReplyDraft("");
                  setIsReplyComposerOpen(false);
                }}
              >
                Cancel
              </Button>
              <Button
                disabled={!trimmedReplyDraft}
                loading={isReplying}
                size="compact-xs"
                type="submit"
                onClick={(event) => event.stopPropagation()}
              >
                Send
              </Button>
            </Group>
          </form>
        ) : null}

        <Group justify="space-between" gap="xs">
          <Text c="dimmed" size="xs">
            {formatCommentDate(comment.created_at)}
          </Text>
          {!isResolved ? (
            <Group gap={4}>
              <Button
                disabled={isReplying}
                size="compact-xs"
                variant="subtle"
                onClick={(event) => {
                  event.stopPropagation();
                  setIsReplyComposerOpen(true);
                }}
              >
                Reply
              </Button>
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
            </Group>
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

function formatActivityType(activity: EmailActivityItem) {
  switch (activity.type) {
    case "comment_created":
      return "Comment";
    case "comment_replied":
      return "Reply";
    case "comment_resolved":
      return "Resolved";
    case "email_created":
      return "Created";
    case "email_updated":
      return "Edited";
    case "email_review_status_updated":
      if (isStaleApprovalActivity(activity)) {
        return "Approval stale";
      }
      return "Status";
    case "email_duplicated":
      return "Duplicate";
    case "email_adaptation_created":
      return "Adaptation";
    case "email_archived":
      return "Archive";
    case "ai_analysis_run":
      return "AI";
  }
}

function activityColor(type: EmailActivityItem["type"]) {
  switch (type) {
    case "comment_created":
    case "email_updated":
      return "yellow";
    case "comment_replied":
    case "email_duplicated":
      return "blue";
    case "comment_resolved":
    case "email_created":
      return "green";
    case "email_review_status_updated":
      return "violet";
    case "email_adaptation_created":
      return "teal";
    case "email_archived":
      return "red";
    case "ai_analysis_run":
      return "grape";
  }
}

function activityDetail(activity: EmailActivityItem) {
  switch (activity.type) {
    case "comment_created":
    case "comment_resolved":
      return joinActivityParts([
        metadataText(activity, "severity"),
        metadataText(activity, "review_block"),
      ]);
    case "comment_replied":
      return metadataText(activity, "review_block");
    case "email_review_status_updated":
      return formatReviewStatusChange(activity);
    case "email_updated":
      return formatActivityChangedFields(activity.changes);
    case "email_adaptation_created":
      return metadataText(activity, "adaptation_label");
    case "ai_analysis_run":
      return joinActivityParts([
        metadataText(activity, "status"),
        metadataText(activity, "model"),
        metadataNumber(activity, "latency_ms"),
      ]);
    default:
      return "";
  }
}

function activitySummary(activity: EmailActivityItem) {
  if (isStaleApprovalActivity(activity)) {
    return "Approval became stale after edit";
  }
  if (activity.type === "email_updated") {
    return formatEmailUpdateSummary(activity.changes);
  }
  return activity.summary;
}

function formatReviewStatusChange(activity: EmailActivityItem) {
  const reviewStatus = activity.changes.review_status;
  if (!isRecord(reviewStatus)) {
    return "";
  }
  const before =
    typeof reviewStatus.before === "string"
      ? formatEmailReviewStatus(reviewStatus.before as EmailReviewStatus)
      : "";
  const after =
    typeof reviewStatus.after === "string"
      ? formatEmailReviewStatus(reviewStatus.after as EmailReviewStatus)
      : "";
  return joinActivityParts([before, after ? `to ${after}` : ""]);
}

function isStaleApprovalActivity(activity: EmailActivityItem) {
  return (
    activity.type === "email_review_status_updated" &&
    metadataText(activity, "reason") === "approval_stale_after_edit"
  );
}

function formatActivityChangedFields(changes: Record<string, unknown>) {
  return formatEmailUpdateChangedFields(changes);
}

function metadataText(activity: EmailActivityItem, key: string) {
  const value = activity.metadata[key];
  return typeof value === "string" ? value : "";
}

function metadataNumber(activity: EmailActivityItem, key: string) {
  const value = activity.metadata[key];
  return typeof value === "number" ? `${value}ms` : "";
}

function joinActivityParts(parts: string[]) {
  return parts.filter(Boolean).join(" · ");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function formatCommentSeverity(severity: EmailCommentSeverity) {
  switch (severity) {
    case "suggestion":
      return "Suggestion";
    case "blocking":
      return "Blocking";
    case "issue":
      return "Issue";
  }
}

function commentSeverityColor(severity: EmailCommentSeverity) {
  switch (severity) {
    case "suggestion":
      return "blue";
    case "blocking":
      return "red";
    case "issue":
      return "yellow";
  }
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
    <Modal centered opened title="Duplicate language/version" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <Stack gap="sm">
          {error ? (
            <Alert color="red" title="Could not duplicate language/version">
              {isConflict
                ? "This language and version already exist for the selected email."
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

          <TextInput
            disabled={isSubmitting}
            label="Version"
            placeholder="v2"
            value={variant}
            onChange={(event) => {
              onResetError();
              setVariant(event.currentTarget.value);
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

function CreateAdaptationModal({
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
  onSubmit: (
    emailId: string,
    payload: CreateEmailAdaptationPayload
  ) => Promise<void>;
}) {
  const [label, setLabel] = useState("");
  const [labelError, setLabelError] = useState<string | null>(null);
  const isConflict = error instanceof ApiError && error.status === 409;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedLabel = label.trim();
    if (!normalizedLabel) {
      setLabelError("Name is required");
      return;
    }
    setLabelError(null);
    try {
      await onSubmit(email.id, { label: normalizedLabel });
    } catch {
      // React Query stores the error; keep the modal open and show it inline.
    }
  };

  return (
    <Modal centered opened title="Create adaptation" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <Stack gap="sm">
          {error ? (
            <Alert color="red" title="Could not create adaptation">
              {isConflict
                ? "This adaptation already exists for the selected language and version."
                : "Try again or check that the API server is reachable."}
            </Alert>
          ) : null}
          <Text size="sm" c="dimmed">
            Create an independent copy of {email.language.toUpperCase()}{" "}
            {email.variant} for a specific audience or use case.
          </Text>
          <TextInput
            data-autofocus
            disabled={isSubmitting}
            error={labelError}
            label="Name"
            placeholder="UAE"
            value={label}
            onChange={(event) => {
              onResetError();
              setLabel(event.currentTarget.value);
              if (labelError) {
                setLabelError(null);
              }
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
              Create adaptation
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

function AdaptationSelect({
  adaptations,
  onSelect,
  selectedAdaptation,
}: {
  adaptations: Array<{ adaptation_key: string; adaptation_label: string }>;
  onSelect: (adaptationKey: string) => void;
  selectedAdaptation: string;
}) {
  return (
    <label className={styles.selectWrap}>
      <select
        aria-label="Email adaptation"
        className={styles.select}
        value={selectedAdaptation}
        onChange={(event) => onSelect(event.currentTarget.value)}
      >
        {adaptations.map((adaptation) => (
          <option
            key={adaptation.adaptation_key}
            value={adaptation.adaptation_key}
          >
            {adaptation.adaptation_label}
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
      {availableVariants.map((variant) => (
        <button
          aria-label={`${variant} email version`}
          className={styles.segmentedButton}
          data-active={variant === selectedVariant || undefined}
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
