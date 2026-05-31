import { useMediaQuery } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { useNavigate } from "react-router-dom";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  Alert,
  Button,
  Loader,
  Stack,
  Text,
} from "@mantine/core";

import { SparkleIcon } from "@phosphor-icons/react";

import {
  type PointerEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { AnalysisPanel } from "../../emails/AnalysisPanel";

import {
  ApiError,
  archiveEmail,
  createCommentMessage,
  createEmailComment,
  duplicateEmail,
  fetchAdminUsers,
  fetchEmailActivity,
  listEmailAreaApprovals,
  fetchEmailComments,
  fetchEmailDetail,
  fetchEmails,
  fetchRenderedEmail,
  fetchSharedEmailAnalysis,
  resolveComment,
  updateEmailAreaApproval,
  updateEmailEditableFields,
  updateEmailPlanningFields,
  updateEmailReviewStatus,
} from "../../emails/api";

import {
  MailPreview,
} from "../../emails/MailPreview";
import type {
  InlineEditUpdate,
  ReviewTextSelection,
} from "../../emails/MailPreview.types";

import { formatEmailReviewStatus } from "../../emails/reviewStatus";

import {
  buildStageColumns,
  getAvailableAdaptations,
  getAvailableVariants,
  getSelectedAdaptation,
  getSelectedVariant,
  getVersionForVariant,
  getVersionsForVariantAndAdaptation,
} from "../../emails/stages";

import { buildStreamPreview } from "../../emails/streamPreview";

import type {
  DuplicateEmailPayload,
  EmailComment,
  EmailCommentSeverity,
  EmailDetail,
  EmailListItem,
  EmailReviewStatus,
  EmailVariant,
  UpdateEditableFieldsPayload,
  UpdateEmailPlanningFieldsPayload,
} from "../../emails/types";

import { useEmailAnalysisStream } from "../../emails/useEmailAnalysisStream";

import { CommentsPanel } from "./CommentsPanel";
import styles from "./EmailReview.module.css";
import { ReviewHeader } from "./ReviewHeader";
import { ReviewLayout } from "./ReviewLayout";
import {
  ArchiveEmailModal,
  DuplicateEmailModal,
  SourceHTMLModal,
} from "./ReviewModals";
import {
  ActivityPanel,
  AreaApprovalsPanel,
  HandoffPanel,
  PlanningPanel,
  ReviewPreviewSkeleton,
} from "./ReviewPanels";
import type {
  CommentStatusFilter,
  EmailReviewProps,
  ReviewContentTab,
  ReviewPanelTab,
  ReviewUtilityPanel,
  ReviewViewport,
} from "./EmailReview.types";
import {
  applyPlanningFieldsToCaches,
  applyReviewStatusToCaches,
  buildApprovalBlockedMessage,
  buildChangedBlockTargets,
  buildCommentBlockOptions,
  buildEditableFieldsPayload,
  buildReviewBlockFreshness,
  clampPercent,
  commentToTarget,
  findNeighborEmail,
  latestApprovalActivity,
} from "./EmailReview.helpers";

const minRightPanelPercent = 24;
const maxRightPanelPercent = 48;

export function EmailReview({
  currentUserRole,
  emailId,
}: EmailReviewProps) {
  const navigate = useNavigate();
  const [viewport, setViewport] = useState<ReviewViewport>("desktop");
  const [actionMenuOpened, setActionMenuOpened] = useState(false);
  const [activeContentTab, setActiveContentTab] =
    useState<ReviewContentTab>("email");
  const [activeUtilityPanel, setActiveUtilityPanel] =
    useState<ReviewUtilityPanel | null>(null);
  const [archiveModalOpened, setArchiveModalOpened] = useState(false);
  const [duplicateModalOpened, setDuplicateModalOpened] = useState(false);
  const [sourceHTMLModalOpened, setSourceHTMLModalOpened] = useState(false);
  const [sourceHTMLDraft, setSourceHTMLDraft] = useState("");
  const [isInlineEditPreviewRefreshing, setIsInlineEditPreviewRefreshing] =
    useState(false);
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
  const inlineEditPreviewNeedsFrameRef = useRef(false);
  const isResizingRef = useRef(false);
  const [isResizing, setIsResizing] = useState(false);
  const isCompactReview = useMediaQuery("(max-width: 64em)");
  const canManageEmail =
    currentUserRole === "admin" || currentUserRole === "super_admin";
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
  const areaApprovalsQuery = useQuery({
    queryKey: ["email-area-approvals", emailId],
    queryFn: () => listEmailAreaApprovals(emailId),
    enabled: emailId.trim() !== "",
  });
  const renderedEmailQuery = useQuery({
    queryKey: ["emails", emailId, "rendered"],
    queryFn: () => fetchRenderedEmail(emailId),
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
  const adminUsersQuery = useQuery({
    queryKey: ["admin", "users"],
    queryFn: fetchAdminUsers,
    enabled: canManageEmail,
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
  const hasLanguageOptions = languageVersions.length > 1;
  const hasVariantOptions = availableVariants.length > 1;
  const hasAdaptationOptions = availableAdaptations.length > 1;
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
  const effectiveOpenBlockingCommentCount = Math.max(
    openBlockingCommentCount,
    email?.open_blocking_comment_count ?? 0
  );
  const incompleteRequiredApprovalCount = (areaApprovalsQuery.data ?? []).filter(
    (approval) => approval.required && approval.status !== "approved"
  ).length;
  const approvalBlockedCount =
    effectiveOpenBlockingCommentCount + incompleteRequiredApprovalCount;
  const approvalBlockedMessage = buildApprovalBlockedMessage(
    effectiveOpenBlockingCommentCount,
    incompleteRequiredApprovalCount
  );
  const filteredComments = useMemo(
    () =>
      commentStatusFilter === "open"
        ? comments.filter((comment) => comment.status === "open")
        : comments,
    [commentStatusFilter, comments]
  );
  const reviewBlockFreshness = useMemo(
    () => buildReviewBlockFreshness(comments, activityQuery.data ?? []),
    [activityQuery.data, comments]
  );
  const commentTargets = useMemo(
    () =>
      filteredComments.map((comment) =>
        commentToTarget(
          comment,
          reviewBlockFreshness.changedAfterCommentCommentIds.has(comment.id)
        )
      ),
    [filteredComments, reviewBlockFreshness.changedAfterCommentCommentIds]
  );
  const changedBlockTargets = useMemo(
    () => buildChangedBlockTargets(reviewBlockFreshness),
    [reviewBlockFreshness]
  );
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
    onError: (error) => {
      const conflictMessage =
        error instanceof ApiError && error.status === 409
          ? error.message.trim() || approvalBlockedMessage
          : null;
      notifications.show({
        color: "red",
        message: conflictMessage ?? "Try again or check that you have admin access.",
        title: conflictMessage ? "Approval blocked" : "Status update failed",
      });
    },
  });
  const planningFieldsMutation = useMutation({
    mutationFn: ({
      payload,
      targetEmailId,
    }: {
      payload: UpdateEmailPlanningFieldsPayload;
      targetEmailId: string;
    }) => updateEmailPlanningFields(targetEmailId, payload),
    onSuccess: (response, variables) => {
      applyPlanningFieldsToCaches(
        queryClient,
        variables.targetEmailId,
        response,
        email?.sequence
      );
      void queryClient.invalidateQueries({
        queryKey: ["email-activity", variables.targetEmailId],
      });
      notifications.show({
        color: "green",
        message: "Planning fields updated.",
        title: "Planning updated",
      });
    },
    onError: () => {
      notifications.show({
        color: "red",
        message: "Try again or check that you have admin access.",
        title: "Planning update failed",
      });
    },
  });
  const areaApprovalMutation = useMutation({
    mutationFn: ({
      area,
      decisionNote,
      status,
    }: {
      area: string;
      decisionNote: string | null;
      status: "approved" | "changes_requested";
    }) =>
      updateEmailAreaApproval(emailId, area, {
        decision_note: decisionNote,
        status,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["email-area-approvals", emailId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["email-activity", emailId],
      });
      notifications.show({
        color: "green",
        message: "Approval area updated.",
        title: "Approval updated",
      });
    },
    onError: () => {
      notifications.show({
        color: "red",
        message: "Try again or check that you have admin access.",
        title: "Approval update failed",
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
    onMutate: () => {
      setIsInlineEditPreviewRefreshing(true);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["emails", emailId, "review"],
      });
      await queryClient.invalidateQueries({
        queryKey: ["emails", emailId, "rendered"],
      });
      await queryClient.invalidateQueries({ queryKey: ["emails"] });
      if (email?.sequence) {
        await queryClient.invalidateQueries({ queryKey: ["emails", email.sequence] });
      }
      await queryClient.invalidateQueries({ queryKey: ["email-activity", emailId] });
      if (!inlineEditPreviewNeedsFrameRef.current) {
        setIsInlineEditPreviewRefreshing(false);
      }
      setSourceHTMLModalOpened(false);
      notifications.show({
        color: "green",
        message: "Email content was updated.",
        title: "Saved",
      });
    },
    onError: () => {
      inlineEditPreviewNeedsFrameRef.current = false;
      setIsInlineEditPreviewRefreshing(false);
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
    if (value === "approved" && approvalBlockedCount > 0) {
      notifications.show({
        color: "red",
        message: approvalBlockedMessage,
        title: "Approval blocked",
      });
      return;
    }

    reviewStatusMutation.mutate({
      nextStatus: value as EmailReviewStatus,
      targetEmailId: email.id,
    });
  };
  const handlePlanningFieldsSubmit = (
    payload: UpdateEmailPlanningFieldsPayload
  ) => {
    if (!email) {
      return;
    }

    planningFieldsMutation.mutate({
      payload,
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
    if (!email || isInlineEditPreviewRefreshing || inlineEditMutation.isPending) {
      return;
    }

    inlineEditPreviewNeedsFrameRef.current =
      Object.keys(update.editableFields ?? {}).length > 0;
    inlineEditMutation.mutate(buildEditableFieldsPayload(email, update));
  };
  const openSourceHTMLModal = () => {
    if (!email || isInlineEditPreviewRefreshing || inlineEditMutation.isPending) {
      return;
    }

    setSourceHTMLDraft(email.original_html);
    setSourceHTMLModalOpened(true);
  };
  const saveSourceHTML = () => {
    if (!email || isInlineEditPreviewRefreshing || inlineEditMutation.isPending) {
      return;
    }

    inlineEditPreviewNeedsFrameRef.current = true;
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
  const isApplyingInlineEdit =
    inlineEditMutation.isPending || isInlineEditPreviewRefreshing;
  const previewContent = (
    email ? (
      <MailPreview
        activeCommentId={activeCommentId}
        canEditContent={canManageEmail}
        canEditHTML={currentUserRole === "super_admin"}
        changedBlockTargets={changedBlockTargets}
        commentTargets={commentTargets}
        createCommentError={createCommentMutation.isError}
        email={email}
        enableReviewSelectionComposer
        hoveredCommentId={hoveredCommentId}
        inlineEditError={inlineEditMutation.isError}
        isApplyingInlineEdit={isApplyingInlineEdit}
        isCreatingComment={createCommentMutation.isPending}
        isScanning={isAnalyzingCurrentEmail}
        onApplyInlineEdit={handleApplyInlineEdit}
        onCommentBadgeClick={handleSelectCommentIds}
        onCommentBadgeHover={handleHoverCommentIds}
        onCreateReviewComment={handleCreateReviewComment}
        onEditSourceHTML={openSourceHTMLModal}
        onInlineEditPreviewReady={() => {
          if (!inlineEditMutation.isPending) {
            inlineEditPreviewNeedsFrameRef.current = false;
            setIsInlineEditPreviewRefreshing(false);
          }
        }}
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
            Generate a shared review for this email.
          </Text>
          <Button
            disabled={!email}
            leftSection={<SparkleIcon aria-hidden="true" size={15} />}
            loading={isAnalyzingCurrentEmail}
            size="xs"
            variant="light"
            onClick={handleAnalyze}
          >
            Generate AI analysis
          </Button>
        </>
      )}
    </Stack>
  );
  const commentBlockOptions = buildCommentBlockOptions(email);
  const commentsContent = (
    <CommentsPanel
      activeCommentId={activeCommentId}
      blockOptions={commentBlockOptions}
      comments={comments}
      createCommentError={createCommentMutation.isError}
      filteredComments={filteredComments}
      filter={commentStatusFilter}
      hoveredCommentId={hoveredCommentId}
      staleCommentIds={reviewBlockFreshness.changedAfterCommentCommentIds}
      isCreatingComment={createCommentMutation.isPending}
      isError={commentsQuery.isError}
      isLoading={commentsQuery.isLoading}
      isResolving={resolveMutation.isPending}
      nextEmailWithOpenComments={nextEmailWithOpenComments}
      onCreateComment={handleCreateReviewComment}
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
  const planningContent = (
    <PlanningPanel
      adminUsers={adminUsersQuery.data ?? []}
      canManage={canManageEmail}
      email={email}
      isLoadingUsers={adminUsersQuery.isLoading}
      isSaving={planningFieldsMutation.isPending}
      key={email?.id ?? "loading"}
      onSubmit={handlePlanningFieldsSubmit}
    />
  );
  const approvalsContent = (
    <AreaApprovalsPanel
      approvals={areaApprovalsQuery.data ?? []}
      canManage={canManageEmail}
      isError={areaApprovalsQuery.isError}
      isLoading={areaApprovalsQuery.isLoading}
      pendingArea={
        areaApprovalMutation.isPending
          ? areaApprovalMutation.variables?.area ?? null
          : null
      }
      onSubmit={(area, status, decisionNote) =>
        areaApprovalMutation.mutate({ area, decisionNote, status })
      }
    />
  );
  const handoffContent = (
    <HandoffPanel
      approvalActivity={latestApprovalActivity(activityQuery.data ?? [])}
      areaApprovals={areaApprovalsQuery.data ?? []}
      email={email}
      isLoadingRenderedHTML={renderedEmailQuery.isLoading}
      openBlockingCommentCount={effectiveOpenBlockingCommentCount}
      openCommentCount={openCommentCount}
      renderedHTML={renderedEmailQuery.data?.html ?? ""}
      renderedHTMLError={renderedEmailQuery.isError}
    />
  );
  const activityContent = (
    <ActivityPanel
      activities={activityQuery.data ?? []}
      isError={activityQuery.isError}
      isLoading={activityQuery.isLoading}
    />
  );
  const selectedUtilityPanel = activeUtilityPanel ?? "planning";
  const utilityContentByPanel: Record<ReviewUtilityPanel, ReactNode> = {
    activity: activityContent,
    approvals: approvalsContent,
    handoff: handoffContent,
    planning: planningContent,
  };
  const utilityPanelContent = utilityContentByPanel[selectedUtilityPanel];
  const handleUtilityPanelSelect = (panel: ReviewUtilityPanel) => {
    setActiveUtilityPanel(panel);
    if (isCompactReview) {
      setActiveContentTab("more");
    }
  };
  const handleEmailPanelSelect = () => {
    setActiveUtilityPanel(null);
    setActiveContentTab("email");
  };

  return (
    <div className={styles.page}>
      <ReviewHeader
        actionMenuOpened={actionMenuOpened}
        activeUtilityPanel={activeUtilityPanel}
        approvalBlockedCount={approvalBlockedCount}
        approvalBlockedMessage={approvalBlockedMessage}
        archiveEmailIsPending={archiveEmailMutation.isPending}
        availableAdaptations={availableAdaptations}
        availableVariants={availableVariants}
        canManageEmail={canManageEmail}
        currentStageTitle={currentStage?.title}
        email={email}
        hasAdaptationOptions={hasAdaptationOptions}
        hasLanguageOptions={hasLanguageOptions}
        hasVariantOptions={hasVariantOptions}
        isAnalyzingCurrentEmail={isAnalyzingCurrentEmail}
        isCompactReview={isCompactReview}
        languageVersions={languageVersions}
        nextBoardEmail={nextBoardEmail}
        nextEmailWithOpenComments={nextEmailWithOpenComments}
        previousBoardEmail={previousBoardEmail}
        reviewStatusIsPending={reviewStatusMutation.isPending}
        selectedAdaptation={selectedAdaptation}
        selectedVariant={selectedVariant}
        viewport={viewport}
        onActionMenuChange={setActionMenuOpened}
        onAdaptationSelect={handleAdaptationSelect}
        onAnalyze={handleAnalyze}
        onArchiveClick={() => setArchiveModalOpened(true)}
        onBackToBoard={handleBackToBoard}
        onDuplicateClick={() => {
          duplicateEmailMutation.reset();
          setDuplicateModalOpened(true);
        }}
        onEmailPanelSelect={handleEmailPanelSelect}
        onNavigateToReview={navigateToReview}
        onReanalyze={handleReanalyze}
        onReviewStatusChange={handleReviewStatusChange}
        onUtilityPanelSelect={handleUtilityPanelSelect}
        onVariantSelect={handleVariantClick}
        onViewportChange={setViewport}
      />

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

      {email && currentUserRole === "super_admin" ? (
        <SourceHTMLModal
          draft={sourceHTMLDraft}
          isSubmitting={isApplyingInlineEdit}
          opened={sourceHTMLModalOpened}
          onChange={setSourceHTMLDraft}
          onClose={() => setSourceHTMLModalOpened(false)}
          onSubmit={saveSourceHTML}
        />
      ) : null}

      <ReviewLayout
        activeContentTab={activeContentTab}
        activePanelTab={activePanelTab}
        activeUtilityPanel={activeUtilityPanel}
        analysisContent={analysisContent}
        commentsContent={commentsContent}
        contentRef={contentRef}
        isCompactReview={isCompactReview}
        isResizing={isResizing}
        openCommentCount={openCommentCount}
        previewContent={previewContent}
        rightPanelPercent={rightPanelPercent}
        selectedUtilityPanel={selectedUtilityPanel}
        utilityContentByPanel={utilityContentByPanel}
        utilityPanelContent={utilityPanelContent}
        onActiveContentTabChange={setActiveContentTab}
        onActivePanelTabChange={setActivePanelTab}
        onResizeEnd={handleResizeEnd}
        onResizeMove={handleResizeMove}
        onResizeStart={handleResizeStart}
        onUtilityPanelChange={setActiveUtilityPanel}
        onUtilityPanelSelect={handleUtilityPanelSelect}
      />
    </div>
  );
}

export default EmailReview;
