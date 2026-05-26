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
  ActionIcon,
  Alert,
  Badge,
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

import {
  ArchiveIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowsClockwiseIcon,
  CaretDownIcon,
  ChatTextIcon,
  CheckIcon,
  ChecksIcon,
  ClockCounterClockwiseIcon,
  CopyIcon,
  DeviceMobileIcon,
  DownloadSimpleIcon,
  EnvelopeSimpleIcon,
  HandshakeIcon,
  HouseIcon,
  ListChecksIcon,
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
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { AnalysisPanel } from "../emails/AnalysisPanel";

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
} from "../emails/api";

import {
  formatEmailUpdateChangedFields,
  formatEmailUpdateChangedReviewBlocks,
  formatEmailUpdateSummary,
} from "../emails/changeSummary";

import {
  copyRenderedHTML,
  downloadRenderedHTML,
} from "../emails/exportHtml";

import {
  MailPreview,
  type InlineEditUpdate,
  type ReviewTextSelection,
} from "../emails/MailPreview";

import type {
  ReviewChangedBlockReason,
  ReviewChangedBlockTarget,
  ReviewCommentTarget,
} from "../emails/reviewOverlayTypes";

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
  DuplicateEmailPayload,
  EmailAreaApproval,
  EmailActivityItem,
  EmailComment,
  EmailCommentSeverity,
  EmailDetail,
  EmailListItem,
  EmailReviewStatus,
  EmailVariant,
  EmailVersionGroup,
  UserAdminItem,
  UserRole,
  UpdateEditableFieldsPayload,
  UpdateEmailPlanningFieldsPayload,
} from "../emails/types";

import { useEmailAnalysisStream } from "../emails/useEmailAnalysisStream";

import styles from "./EmailReviewView.module.css";

type EmailReviewViewProps = {
  currentUserRole: AuthUser["role"];
  emailId: string;
};

type ReviewViewport = "desktop" | "mobile";

type ReviewContentTab =
  | "email"
  | "ai"
  | "comments"
  | "more";

type ReviewPanelTab = "ai" | "comments";
type ReviewUtilityPanel = "planning" | "approvals" | "handoff" | "activity";
type CommentStatusFilter = "open" | "all";
type CommentBlockOption = {
  label: string;
  reviewBlock: string;
  selectedText: string;
  value: string;
};

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
  const [activeUtilityPanel, setActiveUtilityPanel] =
    useState<ReviewUtilityPanel | null>(null);
  const [archiveModalOpened, setArchiveModalOpened] = useState(false);
  const [duplicateModalOpened, setDuplicateModalOpened] = useState(false);
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
        changedBlockTargets={changedBlockTargets}
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
  const desktopPrimaryContent = activeUtilityPanel ? (
    <UtilityPanelFrame title={formatUtilityPanelLabel(activeUtilityPanel)}>
      {utilityContentByPanel[activeUtilityPanel]}
    </UtilityPanelFrame>
  ) : (
    previewContent
  );

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Group className={styles.headerMain} gap="sm" wrap="nowrap">
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

            <Group className={styles.boardNavigation} gap={4} wrap="nowrap">
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
            </Group>

            <Group className={styles.breadcrumbs} gap={6} wrap="nowrap">
              {currentStage?.title ? (
                <Text className={styles.breadcrumbText} size="sm" fw={650}>
                  {currentStage.title}
                </Text>
              ) : (
                <Skeleton className={styles.breadcrumbText} h={14} w={84} />
              )}
              <Text c="dimmed" size="sm">
                /
              </Text>
              {email ? (
                <Text className={styles.titleText} size="sm" fw={650}>
                  {formatEmailTitle(email.title)}
                </Text>
              ) : (
                <Skeleton className={styles.titleText} h={14} w={120} />
              )}
            </Group>

            {!isCompactReview ? (
              <>
                <div className={styles.actionDivider} aria-hidden="true" />

                <Group className={styles.actionGroup} gap="xs" wrap="nowrap">
                  <ViewportSwitch viewport={viewport} onChange={setViewport} />
                </Group>

                <div className={styles.actionDivider} aria-hidden="true" />

                <Group className={styles.actionGroup} gap="xs" wrap="nowrap">
                  {hasLanguageOptions ? (
                    <LanguageSelect
                      selectedEmailId={email?.id ?? ""}
                      versions={languageVersions}
                      onSelect={navigateToReview}
                    />
                  ) : (
                    <ReadOnlyVersionValue
                      label="Email language"
                      value={email?.language.toUpperCase() ?? ""}
                    />
                  )}

                  {hasVariantOptions ? (
                    <VariantSelect
                      availableVariants={availableVariants}
                      selectedVariant={selectedVariant}
                      onSelect={handleVariantClick}
                    />
                  ) : (
                    <ReadOnlyVersionValue
                      label="Email version"
                      value={selectedVariant}
                    />
                  )}
                  {hasAdaptationOptions ? (
                    <AdaptationSelect
                      adaptations={availableAdaptations}
                      selectedAdaptation={selectedAdaptation}
                      onSelect={handleAdaptationSelect}
                    />
                  ) : (
                    <ReadOnlyVersionValue
                      label="Email adaptation"
                      value={email?.adaptation_label ?? ""}
                    />
                  )}
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
                  <Button
                    aria-label="Open actions menu"
                    className={styles.moreMenuButton}
                    data-expanded={actionMenuOpened || undefined}
                    rightSection={<CaretDownIcon aria-hidden="true" size={12} />}
                    size="xs"
                    variant="subtle"
                  >
                    More
                  </Button>
                </Menu.Target>
                <Menu.Dropdown>
                  {email ? (
                    <>
                      <Menu.Label>Review status</Menu.Label>
                      <div className={styles.menuControls}>
                        <ReviewStatusControl
                          approvalBlockedCount={approvalBlockedCount}
                          approvalBlockedMessage={approvalBlockedMessage}
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
                    {hasLanguageOptions ? (
                      <LanguageSelect
                        selectedEmailId={email?.id ?? ""}
                        versions={languageVersions}
                        onSelect={navigateToReview}
                      />
                    ) : (
                      <ReadOnlyVersionValue
                        label="Email language"
                        value={email?.language.toUpperCase() ?? ""}
                      />
                    )}

                    {hasVariantOptions ? (
                      <VariantSelect
                        availableVariants={availableVariants}
                        selectedVariant={selectedVariant}
                        onSelect={handleVariantClick}
                      />
                    ) : (
                      <ReadOnlyVersionValue
                        label="Email version"
                        value={selectedVariant}
                      />
                    )}
                    {hasAdaptationOptions ? (
                      <AdaptationSelect
                        adaptations={availableAdaptations}
                        selectedAdaptation={selectedAdaptation}
                        onSelect={handleAdaptationSelect}
                      />
                    ) : (
                      <ReadOnlyVersionValue
                        label="Email adaptation"
                        value={email?.adaptation_label ?? ""}
                      />
                    )}
                  </div>
                  <Menu.Divider />

                  <Menu.Label>Sections</Menu.Label>
                  <Menu.Item
                    className={styles.sectionMenuItem}
                    data-active={!activeUtilityPanel || undefined}
                    leftSection={<EnvelopeSimpleIcon aria-hidden="true" size={15} />}
                    onClick={handleEmailPanelSelect}
                  >
                    Email
                  </Menu.Item>
                  <Menu.Item
                    className={styles.sectionMenuItem}
                    data-active={activeUtilityPanel === "planning" || undefined}
                    leftSection={<ListChecksIcon aria-hidden="true" size={15} />}
                    onClick={() => handleUtilityPanelSelect("planning")}
                  >
                    Plan
                  </Menu.Item>
                  <Menu.Item
                    className={styles.sectionMenuItem}
                    data-active={activeUtilityPanel === "approvals" || undefined}
                    leftSection={<ChecksIcon aria-hidden="true" size={15} />}
                    onClick={() => handleUtilityPanelSelect("approvals")}
                  >
                    Approvals
                  </Menu.Item>
                  <Menu.Item
                    className={styles.sectionMenuItem}
                    data-active={activeUtilityPanel === "handoff" || undefined}
                    leftSection={<HandshakeIcon aria-hidden="true" size={15} />}
                    onClick={() => handleUtilityPanelSelect("handoff")}
                  >
                    Handoff
                  </Menu.Item>
                  <Menu.Item
                    className={styles.sectionMenuItem}
                    data-active={activeUtilityPanel === "activity" || undefined}
                    leftSection={
                      <ClockCounterClockwiseIcon aria-hidden="true" size={15} />
                    }
                    onClick={() => handleUtilityPanelSelect("activity")}
                  >
                    Activity
                  </Menu.Item>
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
                        Duplicate as...
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
              <Menu
                opened={actionMenuOpened}
                position="bottom-end"
                width={240}
                withinPortal
                onChange={setActionMenuOpened}
              >
                <Menu.Target>
                  <Button
                    aria-label="Open actions menu"
                    className={styles.moreMenuButton}
                    data-expanded={actionMenuOpened || undefined}
                    rightSection={<CaretDownIcon aria-hidden="true" size={12} />}
                    size="xs"
                    variant="subtle"
                  >
                    More
                  </Button>
                </Menu.Target>
                <Menu.Dropdown>
                  {email ? (
                    <>
                      <Menu.Label>Review status</Menu.Label>
                      <div className={styles.menuControls}>
                        <ReviewStatusControl
                          approvalBlockedCount={approvalBlockedCount}
                          approvalBlockedMessage={approvalBlockedMessage}
                          canManage={canManageEmail}
                          isUpdating={reviewStatusMutation.isPending}
                          status={email.review_status}
                          onChange={handleReviewStatusChange}
                        />
                      </div>
                      <Menu.Divider />
                    </>
                  ) : null}
                  <Menu.Label>Sections</Menu.Label>
                  <Menu.Item
                    className={styles.sectionMenuItem}
                    data-active={!activeUtilityPanel || undefined}
                    leftSection={<EnvelopeSimpleIcon aria-hidden="true" size={15} />}
                    onClick={handleEmailPanelSelect}
                  >
                    Email
                  </Menu.Item>
                  <Menu.Item
                    className={styles.sectionMenuItem}
                    data-active={activeUtilityPanel === "planning" || undefined}
                    leftSection={<ListChecksIcon aria-hidden="true" size={15} />}
                    onClick={() => handleUtilityPanelSelect("planning")}
                  >
                    Plan
                  </Menu.Item>
                  <Menu.Item
                    className={styles.sectionMenuItem}
                    data-active={activeUtilityPanel === "approvals" || undefined}
                    leftSection={<ChecksIcon aria-hidden="true" size={15} />}
                    onClick={() => handleUtilityPanelSelect("approvals")}
                  >
                    Approvals
                  </Menu.Item>
                  <Menu.Item
                    className={styles.sectionMenuItem}
                    data-active={activeUtilityPanel === "handoff" || undefined}
                    leftSection={<HandshakeIcon aria-hidden="true" size={15} />}
                    onClick={() => handleUtilityPanelSelect("handoff")}
                  >
                    Handoff
                  </Menu.Item>
                  <Menu.Item
                    className={styles.sectionMenuItem}
                    data-active={activeUtilityPanel === "activity" || undefined}
                    leftSection={
                      <ClockCounterClockwiseIcon aria-hidden="true" size={15} />
                    }
                    onClick={() => handleUtilityPanelSelect("activity")}
                  >
                    Activity
                  </Menu.Item>
                  <Menu.Divider />
                  <Menu.Label>Actions</Menu.Label>
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
                        Duplicate as...
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
                    leftSection={<SparkleIcon aria-hidden="true" size={15} />}
                    onClick={handleAnalyze}
                  >
                    {isAnalyzingCurrentEmail
                      ? "Analyzing"
                      : "View shared AI analysis"}
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
            onChange={(value) => {
              const nextValue = (value as ReviewContentTab | null) ?? "email";
              setActiveContentTab(nextValue);
              if (nextValue === "email") {
                setActiveUtilityPanel(null);
              }
              if (nextValue === "more" && !activeUtilityPanel) {
                setActiveUtilityPanel("planning");
              }
            }}
          >
            <Tabs.List className={styles.mobileTabsList} grow>
              <Tabs.Tab
                value="email"
                leftSection={<EnvelopeSimpleIcon aria-hidden="true" size={15} />}
              >
                Email
              </Tabs.Tab>
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
              <Tabs.Tab
                value="ai"
                leftSection={<SparkleIcon aria-hidden="true" size={15} />}
              >
                AI
              </Tabs.Tab>
              <Tabs.Tab
                value="more"
                leftSection={<CaretDownIcon aria-hidden="true" size={15} />}
              >
                More
              </Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="email" className={styles.mobileTabPanel}>
              {previewContent}
            </Tabs.Panel>

            <Tabs.Panel value="comments" className={styles.mobileTabPanel}>
              {commentsContent}
            </Tabs.Panel>
            <Tabs.Panel value="ai" className={styles.mobileTabPanel}>
              {analysisContent}
            </Tabs.Panel>
            <Tabs.Panel value="more" className={styles.mobileTabPanel}>
              <UtilityPanelFrame title={formatUtilityPanelLabel(selectedUtilityPanel)}>
                <Group className={styles.mobileUtilityNav} gap={2} wrap="nowrap">
                  <UtilityNavButton
                    active={selectedUtilityPanel === "planning"}
                    icon={<ListChecksIcon aria-hidden="true" size={15} />}
                    label="Plan"
                    onClick={() => handleUtilityPanelSelect("planning")}
                  />
                  <UtilityNavButton
                    active={selectedUtilityPanel === "approvals"}
                    icon={<ChecksIcon aria-hidden="true" size={15} />}
                    label="Approvals"
                    onClick={() => handleUtilityPanelSelect("approvals")}
                  />
                  <UtilityNavButton
                    active={selectedUtilityPanel === "handoff"}
                    icon={<HandshakeIcon aria-hidden="true" size={15} />}
                    label="Handoff"
                    onClick={() => handleUtilityPanelSelect("handoff")}
                  />
                  <UtilityNavButton
                    active={selectedUtilityPanel === "activity"}
                    icon={
                      <ClockCounterClockwiseIcon aria-hidden="true" size={15} />
                    }
                    label="Activity"
                    onClick={() => handleUtilityPanelSelect("activity")}
                  />
                </Group>
                {utilityPanelContent}
              </UtilityPanelFrame>
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
          <section className={styles.previewColumn}>{desktopPrimaryContent}</section>

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
            <Stack gap={0}>
              <Tabs
                value={activePanelTab}
                onChange={(value) =>
                  setActivePanelTab(
                    (value as ReviewPanelTab | null) ?? "comments"
                  )
                }
              >
                <Tabs.List className={styles.panelTabsList}>
                  <Tabs.Tab
                    className={styles.panelTab}
                    value="comments"
                    leftSection={
                      <ChatTextIcon aria-hidden="true" size={15} />
                    }
                  >
                    {openCommentCount > 0
                      ? `Comments ${openCommentCount}`
                      : "Comments"}
                  </Tabs.Tab>
                  <Tabs.Tab
                    className={styles.panelTab}
                    value="ai"
                    leftSection={<SparkleIcon aria-hidden="true" size={15} />}
                  >
                    AI
                  </Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="comments" className={styles.tabPanel}>
                  {commentsContent}
                </Tabs.Panel>
                <Tabs.Panel value="ai" className={styles.tabPanel}>
                  {analysisContent}
                </Tabs.Panel>
              </Tabs>
            </Stack>
          </aside>
        </main>
      )}
    </div>
  );
}

function clampPercent(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function nullableTrimmed(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function UtilityNavButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={styles.utilityNavButton}
      data-active={active || undefined}
      type="button"
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function UtilityPanelFrame({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <section className={styles.utilityPanelFrame}>
      <Group className={styles.utilityPanelHeader} justify="space-between">
        <Text fw={700} size="sm">
          {title}
        </Text>
      </Group>
      <div className={styles.utilityPanelBody}>{children}</div>
    </section>
  );
}

function PlanningPanel({
  adminUsers,
  canManage,
  email,
  isLoadingUsers,
  isSaving,
  onSubmit,
}: {
  adminUsers: UserAdminItem[];
  canManage: boolean;
  email: EmailDetail | undefined;
  isLoadingUsers: boolean;
  isSaving: boolean;
  onSubmit: (payload: UpdateEmailPlanningFieldsPayload) => void;
}) {
  const [ownerEmail, setOwnerEmail] = useState(email?.owner_email ?? "");
  const [reviewerEmail, setReviewerEmail] = useState(email?.reviewer_email ?? "");
  const [dueDate, setDueDate] = useState(email?.due_date ?? "");
  const [implementationNotes, setImplementationNotes] = useState(
    email?.implementation_notes ?? ""
  );
  const [sendTiming, setSendTiming] = useState(email?.send_timing ?? "");
  const [adaptationLabel, setAdaptationLabel] = useState(
    email?.adaptation_label ?? "Default"
  );

  if (!email) {
    return (
      <Stack className={styles.emptyState} align="center" justify="center">
        <Loader size="sm" />
      </Stack>
    );
  }

  const payload = {
    owner_email: nullableTrimmed(ownerEmail),
    reviewer_email: nullableTrimmed(reviewerEmail),
    due_date: nullableTrimmed(dueDate),
    implementation_notes: nullableTrimmed(implementationNotes),
    send_timing: nullableTrimmed(sendTiming),
    adaptation_label: adaptationLabel.trim() || "Default",
  };
  const isDirty =
    payload.owner_email !== (email.owner_email ?? null) ||
    payload.reviewer_email !== (email.reviewer_email ?? null) ||
    payload.due_date !== (email.due_date ?? null) ||
    payload.implementation_notes !== (email.implementation_notes ?? null) ||
    payload.send_timing !== (email.send_timing ?? null) ||
    payload.adaptation_label !== email.adaptation_label;
  const ownerOptions = assigneeOptions(adminUsers, ownerEmail, [
    "admin",
    "super_admin",
  ]);
  const reviewerOptions = assigneeOptions(adminUsers, reviewerEmail, [
    "reviewer",
    "admin",
    "super_admin",
  ]);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (canManage && isDirty) {
          onSubmit(payload);
        }
      }}
    >
      <Stack gap="sm">
        <Select
          clearable
          disabled={!canManage || isSaving}
          label="Owner"
          nothingFoundMessage="No users found"
          placeholder="owner@example.com"
          searchable
          data={ownerOptions}
          value={ownerEmail || null}
          onChange={(value) => setOwnerEmail(value ?? "")}
        />
        <Select
          clearable
          disabled={!canManage || isSaving}
          label="Reviewer"
          nothingFoundMessage="No users found"
          placeholder="reviewer@example.com"
          searchable
          data={reviewerOptions}
          value={reviewerEmail || null}
          onChange={(value) => setReviewerEmail(value ?? "")}
        />
        {canManage && isLoadingUsers ? (
          <Text c="dimmed" size="xs">
            Loading user options
          </Text>
        ) : null}
        <TextInput
          disabled={!canManage || isSaving}
          label="Due date"
          type="date"
          value={dueDate}
          onChange={(event) => setDueDate(event.currentTarget.value)}
        />
        <Group grow align="flex-start">
          <TextInput
            disabled={!canManage || isSaving}
            label="Send timing"
            placeholder="Day 3"
            value={sendTiming}
            onChange={(event) => setSendTiming(event.currentTarget.value)}
          />
          <TextInput
            disabled={!canManage || isSaving}
            label="Adaptation"
            placeholder="Default"
            value={adaptationLabel}
            onChange={(event) => setAdaptationLabel(event.currentTarget.value)}
          />
        </Group>
        <Textarea
          autosize
          disabled={!canManage || isSaving}
          label="Implementation notes"
          minRows={4}
          value={implementationNotes}
          onChange={(event) => setImplementationNotes(event.currentTarget.value)}
        />
        {canManage ? (
          <Group justify="flex-end">
            <Button disabled={!isDirty} loading={isSaving} type="submit">
              Save
            </Button>
          </Group>
        ) : null}
      </Stack>
    </form>
  );
}

function AreaApprovalsPanel({
  approvals,
  canManage,
  isError,
  isLoading,
  onSubmit,
  pendingArea,
}: {
  approvals: EmailAreaApproval[];
  canManage: boolean;
  isError: boolean;
  isLoading: boolean;
  onSubmit: (
    area: string,
    status: "approved" | "changes_requested",
    decisionNote: string | null
  ) => void;
  pendingArea: string | null;
}) {
  const [notesByArea, setNotesByArea] = useState<Record<string, string>>({});

  if (isLoading) {
    return (
      <Stack className={styles.emptyState} align="center" justify="center">
        <Loader size="sm" />
      </Stack>
    );
  }

  if (isError) {
    return (
      <Alert color="red" title="Could not load approvals" variant="light">
        Try refreshing the page or check the API server.
      </Alert>
    );
  }

  if (approvals.length === 0) {
    return (
      <Alert color="gray" title="No approval areas" variant="light">
        Add approval areas in board settings.
      </Alert>
    );
  }

  return (
    <Stack gap="sm">
      {approvals.map((approval) => {
        const noteDraft =
          notesByArea[approval.area] ?? approval.decision_note ?? "";
        const isPending = pendingArea === approval.area;

        return (
          <Stack
            className={styles.approvalAreaItem}
            gap="xs"
            key={approval.board_approval_area_id}
          >
            <Group justify="space-between" gap="xs" wrap="nowrap">
              <Stack gap={2}>
                <Group gap={6} wrap="nowrap">
                  <Text fw={700} size="sm">
                    {approval.name}
                  </Text>
                  {approval.required ? (
                    <Badge color="blue" radius="sm" size="xs" variant="light">
                      Required
                    </Badge>
                  ) : (
                    <Badge color="gray" radius="sm" size="xs" variant="light">
                      Optional
                    </Badge>
                  )}
                </Group>
                {approval.decided_by_email && approval.decided_at ? (
                  <Text c="dimmed" size="xs">
                    {approval.decided_by_email} ·{" "}
                    {formatCommentDate(approval.decided_at)}
                  </Text>
                ) : null}
              </Stack>
              <Badge
                color={areaApprovalStatusColor(approval.status)}
                radius="sm"
                variant="light"
              >
                {formatAreaApprovalStatus(approval.status)}
              </Badge>
            </Group>

            {approval.decision_note ? (
              <Text c="dimmed" size="sm" style={{ whiteSpace: "pre-wrap" }}>
                {approval.decision_note}
              </Text>
            ) : null}

            {canManage ? (
              <>
                <Textarea
                  autosize
                  disabled={isPending}
                  minRows={2}
                  placeholder="Decision note"
                  value={noteDraft}
                  onChange={(event) =>
                    setNotesByArea((current) => ({
                      ...current,
                      [approval.area]: event.currentTarget.value,
                    }))
                  }
                />
                <Group gap="xs" grow>
                  <Button
                    color="green"
                    disabled={isPending}
                    leftSection={<CheckIcon aria-hidden="true" size={15} />}
                    loading={isPending}
                    size="xs"
                    variant="light"
                    onClick={() =>
                      onSubmit(
                        approval.area,
                        "approved",
                        nullableTrimmed(noteDraft)
                      )
                    }
                  >
                    Approve
                  </Button>
                  <Button
                    color="yellow"
                    disabled={isPending}
                    loading={isPending}
                    size="xs"
                    variant="light"
                    onClick={() =>
                      onSubmit(
                        approval.area,
                        "changes_requested",
                        nullableTrimmed(noteDraft)
                      )
                    }
                  >
                    Request changes
                  </Button>
                </Group>
              </>
            ) : null}
          </Stack>
        );
      })}
    </Stack>
  );
}

function HandoffPanel({
  approvalActivity,
  areaApprovals,
  email,
  isLoadingRenderedHTML,
  openBlockingCommentCount,
  openCommentCount,
  renderedHTML,
  renderedHTMLError,
}: {
  approvalActivity: EmailActivityItem | null;
  areaApprovals: EmailAreaApproval[];
  email: EmailDetail | undefined;
  isLoadingRenderedHTML: boolean;
  openBlockingCommentCount: number;
  openCommentCount: number;
  renderedHTML: string;
  renderedHTMLError: boolean;
}) {
  if (!email) {
    return (
      <Stack className={styles.emptyState} align="center" justify="center">
        <Loader size="sm" />
      </Stack>
    );
  }

  const isApproved = email.review_status === "approved";
  const incompleteRequiredApprovals = areaApprovals.filter(
    (approval) => approval.required && approval.status !== "approved"
  );
  const approvalLabel = approvalActivity
    ? `${approvalActivity.actor_email ?? "System"} on ${formatCommentDate(approvalActivity.created_at)}`
    : "Approved";

  return (
    <Stack gap="sm">
      {!isApproved ? (
        <Alert color="gray" title="Handoff not ready" variant="light">
          Approve this email to prepare handoff.
        </Alert>
      ) : null}

      {openBlockingCommentCount > 0 ? (
        <Alert color="red" title="Open blocking comments" variant="light">
          Resolve blocking comments before production handoff.
        </Alert>
      ) : null}

      {incompleteRequiredApprovals.length > 0 ? (
        <Alert color="red" title="Required approvals incomplete" variant="light">
          Complete required area approvals before production handoff.
        </Alert>
      ) : null}

      <Stack className={styles.handoffSection} gap="xs">
        <Group justify="space-between" gap="xs" wrap="nowrap">
          <Text fw={700} size="sm">
            Package
          </Text>
          <Badge
            color={emailReviewStatusColor(email.review_status)}
            radius="sm"
            variant="light"
          >
            {formatEmailReviewStatus(email.review_status)}
          </Badge>
        </Group>
        <HandoffRow label="Title" value={email.title} />
        <HandoffRow label="Subject" value={email.subject ?? ""} copyable />
        <HandoffRow label="Preheader" value={email.preheader ?? ""} copyable />
        <HandoffRow label="Language" value={email.language.toUpperCase()} />
        <HandoffRow label="Version" value={email.variant} />
        <HandoffRow label="Adaptation" value={email.adaptation_label} />
        <HandoffRow label="Send timing" value={email.send_timing ?? ""} />
      </Stack>

      <Stack className={styles.handoffSection} gap="xs">
        <Text fw={700} size="sm">
          Approval
        </Text>
        <HandoffRow label="Status" value={formatEmailReviewStatus(email.review_status)} />
        {isApproved ? <HandoffRow label="Approved by" value={approvalLabel} /> : null}
        <HandoffRow
          label="Open comments"
          value={`${openCommentCount}${openBlockingCommentCount > 0 ? ` (${openBlockingCommentCount} blocking)` : ""}`}
        />
      </Stack>

      {areaApprovals.length > 0 ? (
        <Stack className={styles.handoffSection} gap="xs">
          <Text fw={700} size="sm">
            Area approvals
          </Text>
          {areaApprovals.map((approval) => (
            <Group
              className={styles.handoffRow}
              gap="xs"
              justify="space-between"
              key={approval.board_approval_area_id}
              wrap="nowrap"
            >
              <Group gap={6} wrap="nowrap">
                <Text c="dimmed" size="sm">
                  {approval.name}
                </Text>
                {approval.required ? (
                  <Badge color="blue" radius="sm" size="xs" variant="light">
                    Required
                  </Badge>
                ) : null}
              </Group>
              <Badge
                color={areaApprovalStatusColor(approval.status)}
                radius="sm"
                size="sm"
                variant="light"
              >
                {formatAreaApprovalStatus(approval.status)}
              </Badge>
            </Group>
          ))}
        </Stack>
      ) : null}

      {email.implementation_notes ? (
        <Stack className={styles.handoffSection} gap={6}>
          <Text fw={700} size="sm">
            Implementation notes
          </Text>
          <Text c="dimmed" size="sm" style={{ whiteSpace: "pre-wrap" }}>
            {email.implementation_notes}
          </Text>
        </Stack>
      ) : null}

      <Stack className={styles.handoffSection} gap="xs">
        <Group justify="space-between" gap="xs" wrap="nowrap">
          <Text fw={700} size="sm">
            Final HTML
          </Text>
          {renderedHTML ? (
            <Text c="dimmed" size="xs">
              {formatByteSize(renderedHTML)}
            </Text>
          ) : null}
        </Group>

        {renderedHTMLError ? (
          <Alert color="red" title="Failed to render HTML" variant="light">
            Try refreshing the page or check the email source.
          </Alert>
        ) : (
          <>
            <Textarea
              autosize
              disabled={!isApproved || isLoadingRenderedHTML}
              maxRows={8}
              minRows={5}
              readOnly
              value={
                isLoadingRenderedHTML
                  ? "Loading rendered HTML..."
                  : renderedHTML
              }
            />
            <Group gap="xs" grow>
              <Button
                disabled={!isApproved || !renderedHTML}
                leftSection={<CopyIcon aria-hidden="true" size={15} />}
                size="xs"
                variant="light"
                onClick={() => void copyRenderedHTML(renderedHTML)}
              >
                Copy HTML
              </Button>
              <Button
                disabled={!isApproved || !renderedHTML}
                leftSection={<DownloadSimpleIcon aria-hidden="true" size={15} />}
                size="xs"
                variant="light"
                onClick={() => downloadRenderedHTML(email, renderedHTML)}
              >
                Download
              </Button>
            </Group>
          </>
        )}
      </Stack>

    </Stack>
  );
}

function HandoffRow({
  copyable = false,
  label,
  value,
}: {
  copyable?: boolean;
  label: string;
  value: string;
}) {
  const displayValue = value.trim() || "Not set";

  return (
    <Group className={styles.handoffRow} gap="xs" justify="space-between" wrap="nowrap">
      <Text c="dimmed" size="sm">
        {label}
      </Text>
      <Group gap={4} justify="flex-end" wrap="nowrap">
        <Text className={styles.handoffValue} fw={600} size="sm">
          {displayValue}
        </Text>
        {copyable && value.trim() ? (
          <Tooltip label={`Copy ${label.toLowerCase()}`}>
            <ActionIcon
              aria-label={`Copy ${label.toLowerCase()}`}
              size="sm"
              variant="subtle"
              onClick={() => void copyPlainText(value, label)}
            >
              <CopyIcon aria-hidden="true" size={14} />
            </ActionIcon>
          </Tooltip>
        ) : null}
      </Group>
    </Group>
  );
}

function formatAreaApprovalStatus(status: string) {
  switch (status) {
    case "pending":
      return "Pending";
    case "approved":
      return "Approved";
    case "changes_requested":
      return "Changes requested";
    case "stale":
      return "Stale";
    default:
      return status.replaceAll("_", " ");
  }
}

function buildApprovalBlockedMessage(
  openBlockingCommentCount: number,
  incompleteRequiredApprovalCount: number
) {
  const blockers: string[] = [];

  if (openBlockingCommentCount > 0) {
    blockers.push("Resolve blocking comments");
  }
  if (incompleteRequiredApprovalCount > 0) {
    blockers.push("complete required approvals");
  }

  if (blockers.length === 0) {
    return "";
  }

  return `${blockers.join(" and ")} before approval.`;
}

function areaApprovalStatusColor(status: string) {
  switch (status) {
    case "approved":
      return "green";
    case "changes_requested":
      return "yellow";
    case "stale":
      return "orange";
    case "pending":
      return "gray";
    default:
      return "gray";
  }
}

async function copyPlainText(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value);
    notifications.show({
      color: "green",
      message: `${label} copied to clipboard.`,
      title: "Copied",
    });
  } catch {
    notifications.show({
      color: "red",
      message: "Browser blocked clipboard access.",
      title: "Copy failed",
    });
  }
}

function formatByteSize(value: string) {
  const bytes = new Blob([value]).size;
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function assigneeOptions(
  users: UserAdminItem[],
  currentEmail: string,
  allowedRoles: UserRole[]
) {
  const allowedRoleSet = new Set<UserRole>(allowedRoles);
  const options = users
    .filter((user) => allowedRoleSet.has(user.role))
    .map((user) => ({
      label: `${user.email} (${formatUserRole(user.role)})`,
      value: user.email,
    }));
  const normalizedCurrentEmail = currentEmail.trim();
  if (
    normalizedCurrentEmail &&
    !options.some((option) => option.value === normalizedCurrentEmail)
  ) {
    options.unshift({
      label: normalizedCurrentEmail,
      value: normalizedCurrentEmail,
    });
  }

  return options;
}

function formatUserRole(role: UserRole) {
  return role.replaceAll("_", " ");
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

function formatUtilityPanelLabel(tab: ReviewUtilityPanel) {
  switch (tab) {
    case "planning":
      return "Plan";
    case "approvals":
      return "Approvals";
    case "handoff":
      return "Handoff";
    case "activity":
      return "Activity";
  }
}

function ReviewStatusControl({
  approvalBlockedCount,
  approvalBlockedMessage,
  canManage,
  isUpdating,
  onChange,
  status,
}: {
  approvalBlockedCount: number;
  approvalBlockedMessage: string;
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

  const approvalBlocked = approvalBlockedCount > 0 && status !== "approved";
  return (
    <Select
      allowDeselect={false}
      aria-label={approvalBlocked ? approvalBlockedMessage : "Review status"}
      className={styles.reviewStatusSelect}
      classNames={{ input: styles.headerSelectInput }}
      data={emailReviewStatusOptions.map((option) => ({
        ...option,
        disabled: option.value === "approved" && approvalBlocked,
      }))}
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

function applyPlanningFieldsToCaches(
  queryClient: QueryClient,
  emailId: string,
  planningFields: UpdateEmailPlanningFieldsPayload,
  sequence: string | undefined
) {
  queryClient.setQueryData<EmailDetail>(["emails", emailId, "review"], (currentEmail) =>
    currentEmail?.id === emailId
      ? { ...currentEmail, ...planningFields }
      : currentEmail
  );
  if (sequence) {
    queryClient.setQueryData<EmailListItem[]>(["emails", sequence], (emails) =>
      emails?.map((listEmail) =>
        listEmail.id === emailId ? { ...listEmail, ...planningFields } : listEmail
      )
    );
  }
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

type ReviewBlockFreshness = {
  changedAfterApprovalBlocks: Set<string>;
  changedAfterCommentBlocks: Set<string>;
  changedAfterCommentCommentIds: Set<string>;
};

function buildReviewBlockFreshness(
  comments: EmailComment[],
  activities: EmailActivityItem[]
): ReviewBlockFreshness {
  const changedAfterApprovalBlocks = new Set<string>();
  const changedAfterCommentBlocks = new Set<string>();
  const changedAfterCommentCommentIds = new Set<string>();
  const latestApprovalAt = latestApprovalTimestamp(activities);
  const commentsByBlock = new Map<string, EmailComment[]>();

  comments.forEach((comment) => {
    commentsByBlock.set(comment.review_block, [
      ...(commentsByBlock.get(comment.review_block) ?? []),
      comment,
    ]);
  });

  activities
    .filter((activity) => activity.type === "email_updated")
    .forEach((activity) => {
      const updatedAt = timestamp(activity.created_at);
      if (updatedAt === null) {
        return;
      }

      const changedBlocks = stringArrayMetadata(
        activity.metadata,
        "changed_review_blocks"
      );
      changedBlocks.forEach((reviewBlock) => {
        if (latestApprovalAt !== null && updatedAt > latestApprovalAt) {
          changedAfterApprovalBlocks.add(reviewBlock);
        }

        for (const comment of commentsByBlock.get(reviewBlock) ?? []) {
          const commentCreatedAt = timestamp(comment.created_at);
          if (commentCreatedAt !== null && updatedAt > commentCreatedAt) {
            changedAfterCommentBlocks.add(reviewBlock);
            changedAfterCommentCommentIds.add(comment.id);
          }
        }
      });
    });

  return {
    changedAfterApprovalBlocks,
    changedAfterCommentBlocks,
    changedAfterCommentCommentIds,
  };
}

function buildChangedBlockTargets({
  changedAfterApprovalBlocks,
  changedAfterCommentBlocks,
}: ReviewBlockFreshness): ReviewChangedBlockTarget[] {
  const reviewBlocks = new Set([
    ...changedAfterApprovalBlocks,
    ...changedAfterCommentBlocks,
  ]);

  return Array.from(reviewBlocks)
    .sort()
    .map((reviewBlock) => ({
      reason: changedBlockReason(
        changedAfterCommentBlocks.has(reviewBlock),
        changedAfterApprovalBlocks.has(reviewBlock)
      ),
      reviewBlock,
    }));
}

function changedBlockReason(
  changedAfterComment: boolean,
  changedAfterApproval: boolean
): ReviewChangedBlockReason {
  if (changedAfterComment && changedAfterApproval) {
    return "comment_and_approval";
  }
  return changedAfterApproval ? "approval" : "comment";
}

function latestApprovalTimestamp(activities: EmailActivityItem[]) {
  const approvalTimes = activities
    .filter((activity) => activity.type === "email_review_status_updated")
    .filter((activity) => {
      const reviewStatus = activity.changes.review_status;
      return (
        isRecord(reviewStatus) &&
        typeof reviewStatus.after === "string" &&
        reviewStatus.after === "approved"
      );
    })
    .map((activity) => timestamp(activity.created_at))
    .filter((value): value is number => value !== null);

  return approvalTimes.length > 0 ? Math.max(...approvalTimes) : null;
}

function latestApprovalActivity(activities: EmailActivityItem[]) {
  return (
    activities
      .filter((activity) => activity.type === "email_review_status_updated")
      .filter((activity) => {
        const reviewStatus = activity.changes.review_status;
        return (
          isRecord(reviewStatus) &&
          typeof reviewStatus.after === "string" &&
          reviewStatus.after === "approved"
        );
      })
      .sort((left, right) => {
        const leftTime = timestamp(left.created_at) ?? 0;
        const rightTime = timestamp(right.created_at) ?? 0;
        return rightTime - leftTime;
      })[0] ?? null
  );
}

function stringArrayMetadata(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function timestamp(value: string) {
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

function commentToTarget(
  comment: EmailComment,
  staleAfterEdit: boolean
): ReviewCommentTarget {
  return {
    authorKey: comment.author_email ?? comment.user_id ?? "unknown",
    id: comment.id,
    reviewBlock: comment.review_block,
    selectedText: comment.selected_text,
    startOffset: comment.start_offset,
    endOffset: comment.end_offset,
    staleAfterEdit,
    status: comment.status,
    severity: comment.severity,
  };
}

function buildCommentBlockOptions(
  email: EmailDetail | undefined
): CommentBlockOption[] {
  if (!email) {
    return [];
  }

  const options: CommentBlockOption[] = [];
  const seenBlocks = new Set<string>();
  const addOption = (reviewBlock: string, selectedText: string) => {
    const normalizedText = selectedText.trim();
    if (!normalizedText || seenBlocks.has(reviewBlock)) {
      return;
    }

    seenBlocks.add(reviewBlock);
    options.push({
      label: formatReviewBlockOptionLabel(reviewBlock, normalizedText),
      reviewBlock,
      selectedText: normalizedText,
      value: reviewBlock,
    });
  };

  addOption("subject", email.subject ?? email.title);
  if (email.preheader) {
    addOption("preheader", email.preheader);
  }

  if (typeof DOMParser === "undefined") {
    return options;
  }

  const document = new DOMParser().parseFromString(
    email.review_html || email.original_html,
    "text/html"
  );
  document.querySelectorAll("[data-review-block]").forEach((block) => {
    if (block.querySelector("[data-review-block]")) {
      return;
    }

    const reviewBlock = block.getAttribute("data-review-block");
    if (reviewBlock) {
      addOption(reviewBlock, getReviewBlockOptionText(block));
    }
  });

  return options;
}

function getReviewBlockOptionText(block: Element) {
  const text = block.textContent?.trim();
  if (text) {
    return text;
  }

  const image = block.matches("img") ? block : block.querySelector("img");
  if (!image) {
    return "";
  }

  const imageLabel =
    image.getAttribute("alt")?.trim() ||
    image.getAttribute("aria-label")?.trim() ||
    image.getAttribute("title")?.trim();
  if (imageLabel) {
    return imageLabel;
  }

  const imageSource = image.getAttribute("src")?.trim();
  if (imageSource) {
    return `Image: ${imageSource.split("/").pop() ?? imageSource}`;
  }

  return `Image: ${block.getAttribute("data-review-block") ?? "review block"}`;
}

function formatReviewBlockOptionLabel(reviewBlock: string, selectedText: string) {
  const label = formatReviewBlockLabel(reviewBlock);
  const preview = selectedText.replace(/\s+/g, " ").slice(0, 44);
  return `${label} - ${preview}${selectedText.length > 44 ? "..." : ""}`;
}

function CommentsPanel({
  activeCommentId,
  blockOptions,
  comments,
  createCommentError,
  filteredComments,
  filter,
  hoveredCommentId,
  isCreatingComment,
  isError,
  isLoading,
  isResolving,
  nextEmailWithOpenComments,
  onCreateComment,
  onFilterChange,
  onHoverComment,
  onNextEmailWithOpenComments,
  onReply,
  onResolve,
  onSelectComment,
  replyingCommentId,
  staleCommentIds,
}: {
  activeCommentId: string | null;
  blockOptions: CommentBlockOption[];
  comments: EmailComment[];
  createCommentError: boolean;
  filteredComments: EmailComment[];
  filter: CommentStatusFilter;
  hoveredCommentId: string | null;
  isCreatingComment: boolean;
  isError: boolean;
  isLoading: boolean;
  isResolving: boolean;
  nextEmailWithOpenComments: EmailListItem | null;
  onCreateComment: (
    selection: ReviewTextSelection,
    body: string,
    severity: EmailCommentSeverity
  ) => void;
  onFilterChange: (filter: CommentStatusFilter) => void;
  onHoverComment: (comment: EmailComment | null) => void;
  onNextEmailWithOpenComments: () => void;
  onReply: (commentId: string, body: string) => void;
  onResolve: (commentId: string) => void;
  onSelectComment: (comment: EmailComment) => void;
  replyingCommentId: string | null;
  staleCommentIds: Set<string>;
}) {
  const commentItemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const wasCreatingCommentRef = useRef(false);
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [selectedBlockValue, setSelectedBlockValue] = useState<string | null>(
    blockOptions[0]?.value ?? null
  );
  const [draftComment, setDraftComment] = useState("");
  const [draftSeverity, setDraftSeverity] =
    useState<EmailCommentSeverity>("issue");
  const selectedBlock =
    blockOptions.find((option) => option.value === selectedBlockValue) ??
    blockOptions[0] ??
    null;
  const trimmedDraftComment = draftComment.trim();

  useEffect(() => {
    if (wasCreatingCommentRef.current && !isCreatingComment && !createCommentError) {
      setDraftComment("");
      setDraftSeverity("issue");
      setIsComposerOpen(false);
    }

    wasCreatingCommentRef.current = isCreatingComment;
  }, [createCommentError, isCreatingComment]);

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

  const handlePanelCommentSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedBlock || !trimmedDraftComment) {
      return;
    }

    onCreateComment(
      {
        endOffset: selectedBlock.selectedText.length,
        reviewBlock: selectedBlock.reviewBlock,
        selectedText: selectedBlock.selectedText,
        startOffset: 0,
      },
      trimmedDraftComment,
      draftSeverity
    );
  };

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
        <Stack className={styles.commentFilterBar} gap="xs">
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

          <Group justify="space-between" gap="xs" wrap="nowrap">
            <Button
              leftSection={<ChatTextIcon aria-hidden="true" size={14} />}
              size="xs"
              variant="light"
              onClick={() => setIsComposerOpen((opened) => !opened)}
            >
              Add comment
            </Button>
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
        </Stack>
      ) : null}

      {isComposerOpen ? (
        <form className={styles.panelCommentComposer} onSubmit={handlePanelCommentSubmit}>
          <Stack gap="xs">
            <Select
              disabled={isCreatingComment || blockOptions.length === 0}
              label="Review block"
              placeholder="Select a block"
              data={blockOptions.map((option) => ({
                label: option.label,
                value: option.value,
              }))}
              value={selectedBlock?.value ?? null}
              onChange={setSelectedBlockValue}
            />
            {selectedBlock ? (
              <Text className={styles.commentQuote} lineClamp={3} size="sm">
                {selectedBlock.selectedText}
              </Text>
            ) : (
              <Text c="dimmed" size="sm">
                No review blocks found. Select text in the preview instead.
              </Text>
            )}
            <Textarea
              autosize
              disabled={isCreatingComment || !selectedBlock}
              minRows={3}
              placeholder="Add a comment"
              value={draftComment}
              onChange={(event) => setDraftComment(event.currentTarget.value)}
            />
            <SegmentedControl
              data={[
                { label: "Suggestion", value: "suggestion" },
                { label: "Issue", value: "issue" },
                { label: "Blocking", value: "blocking" },
              ]}
              disabled={isCreatingComment}
              size="xs"
              value={draftSeverity}
              onChange={(value) =>
                setDraftSeverity(value as EmailCommentSeverity)
              }
            />
            {createCommentError ? (
              <Text c="red" size="xs">
                Failed to create comment.
              </Text>
            ) : null}
            <Text c="dimmed" size="xs">
              For precise text comments, select text or click a block in the
              email preview.
            </Text>
            <Group justify="flex-end" gap="xs">
              <Button
                disabled={isCreatingComment}
                size="xs"
                variant="subtle"
                onClick={() => setIsComposerOpen(false)}
              >
                Cancel
              </Button>
              <Button
                disabled={!selectedBlock || !trimmedDraftComment}
                loading={isCreatingComment}
                size="xs"
                type="submit"
              >
                Add comment
              </Button>
            </Group>
          </Stack>
        </form>
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
              isStaleAfterEdit={staleCommentIds.has(comment.id)}
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
      ) : !isComposerOpen ? (
        <Stack
          className={styles.emptyState}
          align="center"
          justify="center"
          gap="xs"
        >
          <Text fw={600}>No comments yet</Text>
          <Text c="dimmed" ta="center" size="sm">
            Select text or click a reviewable block in the email preview to add
            the first comment.
          </Text>
          <Button
            disabled={blockOptions.length === 0}
            size="xs"
            variant="light"
            onClick={() => setIsComposerOpen(true)}
          >
            Add comment
          </Button>
        </Stack>
      ) : null}
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
  isStaleAfterEdit,
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
  isStaleAfterEdit: boolean;
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
        {isStaleAfterEdit ? (
          <Badge color="orange" size="sm" variant="light">
            Edited after this comment
          </Badge>
        ) : null}

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
    case "email_planning_updated":
      return "Planning";
    case "email_review_status_updated":
      if (isStaleApprovalActivity(activity)) {
        return "Approval stale";
      }
      if (isReapprovalActivity(activity)) {
        return "Re-approved";
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
    case "email_planning_updated":
      return "cyan";
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
      return joinActivityParts([
        formatReviewStatusChange(activity),
        formatApprovalSnapshot(activity),
      ]);
    case "email_updated":
      return joinActivityParts([
        formatActivityChangedFields(activity.changes),
        formatEmailUpdateChangedReviewBlocks(activity.metadata),
      ]);
    case "email_planning_updated":
      return formatPlanningChangedFields(activity.changes);
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
  if (isReapprovalActivity(activity)) {
    return metadataText(activity, "reason") === "reapproved_after_stale_edit"
      ? "Re-approved after stale edit"
      : "Re-approved email";
  }
  if (activity.type === "email_updated") {
    return formatEmailUpdateSummary(activity.changes);
  }
  if (activity.type === "email_planning_updated") {
    return "Updated planning fields";
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

function formatApprovalSnapshot(activity: EmailActivityItem) {
  const contentHash = metadataText(activity, "approved_content_hash");
  if (!contentHash) {
    return "";
  }

  return `Content snapshot ${shortHash(contentHash)}`;
}

function isStaleApprovalActivity(activity: EmailActivityItem) {
  return (
    activity.type === "email_review_status_updated" &&
    metadataText(activity, "reason") === "approval_stale_after_edit"
  );
}

function isReapprovalActivity(activity: EmailActivityItem) {
  const reason = metadataText(activity, "reason");
  return (
    activity.type === "email_review_status_updated" &&
    (reason === "reapproved" || reason === "reapproved_after_stale_edit")
  );
}

function formatActivityChangedFields(changes: Record<string, unknown>) {
  return formatEmailUpdateChangedFields(changes);
}

function formatPlanningChangedFields(changes: Record<string, unknown>) {
  const labels: Record<string, string> = {
    adaptation_label: "Adaptation",
    due_date: "Due date",
    implementation_notes: "Implementation notes",
    owner_email: "Owner",
    reviewer_email: "Reviewer",
    send_timing: "Send timing",
  };
  return Object.keys(changes)
    .map((field) => labels[field] ?? field)
    .join(", ");
}

function metadataText(activity: EmailActivityItem, key: string) {
  const value = activity.metadata[key];
  return typeof value === "string" ? value : "";
}

function metadataNumber(activity: EmailActivityItem, key: string) {
  const value = activity.metadata[key];
  return typeof value === "number" ? `${value}ms` : "";
}

function shortHash(value: string) {
  return value.length > 10 ? value.slice(0, 10) : value;
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
  const [language, setLanguage] = useState(email.language);
  const [variant, setVariant] = useState<EmailVariant>(email.variant);
  const [adaptationLabel, setAdaptationLabel] = useState(email.adaptation_label);
  const [title, setTitle] = useState(email.title);
  const [subject, setSubject] = useState(email.subject ?? "");
  const [preheader, setPreheader] = useState(email.preheader ?? "");
  const [languageError, setLanguageError] = useState<string | null>(null);
  const [variantError, setVariantError] = useState<string | null>(null);
  const [adaptationError, setAdaptationError] = useState<string | null>(null);
  const [targetError, setTargetError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedLanguage = language.trim().toLowerCase();
    const normalizedVariant = variant.trim().toLowerCase();
    const normalizedAdaptationLabel = adaptationLabel.trim();
    if (!normalizedLanguage) {
      setLanguageError("Language is required");
      return;
    }
    if (!normalizedVariant) {
      setVariantError("Version is required");
      return;
    }
    if (!normalizedAdaptationLabel) {
      setAdaptationError("Adaptation is required");
      return;
    }

    const payload: DuplicateEmailPayload = {
      ...buildOptionalTextPayload("title", title, email.title),
      ...buildOptionalTextPayload("subject", subject, email.subject),
      ...buildOptionalTextPayload("preheader", preheader, email.preheader),
    };
    if (normalizedLanguage !== email.language) {
      payload.language = normalizedLanguage;
    }
    if (normalizedVariant !== email.variant) {
      payload.variant = normalizedVariant;
    }
    if (normalizedAdaptationLabel !== email.adaptation_label) {
      payload.adaptation_label = normalizedAdaptationLabel;
    }
    if (Object.keys(payload).length === 0) {
      setTargetError("Change language, version, adaptation, or copy before creating.");
      return;
    }

    setLanguageError(null);
    setVariantError(null);
    setAdaptationError(null);
    setTargetError(null);
    try {
      await onSubmit(email.id, payload);
    } catch {
      // React Query stores the error; keep the modal open and show it inline.
    }
  };

  const isConflict = error instanceof ApiError && error.status === 409;

  return (
    <Modal centered opened title="Duplicate as..." onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <Stack gap="sm">
          {error ? (
            <Alert color="red" title="Could not duplicate email">
              {isConflict
                ? "This language, version, and adaptation already exist for the selected email."
                : "Try again or check that the API server is reachable."}
            </Alert>
          ) : null}
          {targetError ? (
            <Alert color="yellow" title="Nothing to create">
              {targetError}
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
              setTargetError(null);
              setLanguage(event.currentTarget.value);
              if (languageError) {
                setLanguageError(null);
              }
            }}
          />

          <TextInput
            disabled={isSubmitting}
            error={variantError}
            label="Version"
            placeholder="v2"
            value={variant}
            onChange={(event) => {
              onResetError();
              setTargetError(null);
              setVariant(event.currentTarget.value);
              if (variantError) {
                setVariantError(null);
              }
            }}
          />

          <TextInput
            disabled={isSubmitting}
            error={adaptationError}
            label="Adaptation"
            placeholder="Legal"
            value={adaptationLabel}
            onChange={(event) => {
              onResetError();
              setTargetError(null);
              setAdaptationLabel(event.currentTarget.value);
              if (adaptationError) {
                setAdaptationError(null);
              }
            }}
          />

          <TextInput
            disabled={isSubmitting}
            label="Title"
            value={title}
            onChange={(event) => {
              onResetError();
              setTargetError(null);
              setTitle(event.currentTarget.value);
            }}
          />

          <TextInput
            disabled={isSubmitting}
            label="Subject"
            value={subject}
            onChange={(event) => {
              onResetError();
              setTargetError(null);
              setSubject(event.currentTarget.value);
            }}
          />

          <TextInput
            disabled={isSubmitting}
            label="Preheader"
            value={preheader}
            onChange={(event) => {
              onResetError();
              setTargetError(null);
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
              Duplicate as
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
    <Select
      allowDeselect={false}
      aria-label="Email language"
      className={styles.headerCompactSelect}
      classNames={{ input: styles.headerSelectInput }}
      data={versions.map((version) => ({
        label: version.language.toUpperCase(),
        value: version.id,
      }))}
      disabled={versions.length <= 1}
      size="xs"
      value={selectedEmailId}
      onChange={(value) => {
        if (value) {
          onSelect(value);
        }
      }}
    />
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
    <Select
      allowDeselect={false}
      aria-label="Email adaptation"
      className={styles.headerVersionSelect}
      classNames={{ input: styles.headerSelectInput }}
      data={adaptations.map((adaptation) => ({
        label: adaptation.adaptation_label,
        value: adaptation.adaptation_key,
      }))}
      size="xs"
      value={selectedAdaptation}
      onChange={(value) => {
        if (value) {
          onSelect(value);
        }
      }}
    />
  );
}

function VariantSelect({
  availableVariants,
  onSelect,
  selectedVariant,
}: {
  availableVariants: EmailVariant[];
  onSelect: (variant: EmailVariant) => void;
  selectedVariant: EmailVariant;
}) {
  return (
    <Select
      allowDeselect={false}
      aria-label="Email version"
      className={styles.headerVersionSelect}
      classNames={{ input: styles.headerSelectInput }}
      data={availableVariants.map((variant) => ({
        label: variant,
        value: variant,
      }))}
      size="xs"
      value={selectedVariant}
      onChange={(value) => {
        if (value) {
          onSelect(value);
        }
      }}
    />
  );
}

function ReadOnlyVersionValue({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <span aria-label={label} className={styles.readOnlySelect}>
      {value || "None"}
    </span>
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
      <button
        aria-label="Desktop preview"
        className={styles.iconSegmentedButton}
        data-active={viewport === "desktop" || undefined}
        type="button"
        onClick={() => onChange("desktop")}
      >
        <MonitorIcon aria-hidden="true" size={16} />
      </button>

      <button
        aria-label="Mobile preview"
        className={styles.iconSegmentedButton}
        data-active={viewport === "mobile" || undefined}
        type="button"
        onClick={() => onChange("mobile")}
      >
        <DeviceMobileIcon aria-hidden="true" size={16} />
      </button>
    </Group>
  );
}
