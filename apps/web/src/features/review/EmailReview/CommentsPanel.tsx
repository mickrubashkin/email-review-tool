import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  SegmentedControl,
  Select,
  Stack,
  Text,
  Textarea,
  Timeline,
} from "@mantine/core";

import {
  ArrowRightIcon,
  ChatTextIcon,
  CheckIcon,
} from "@phosphor-icons/react";

import {
  type FormEvent,
  type KeyboardEvent,
  type RefCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import type { ReviewTextSelection } from "../../emails/MailPreview";
import type {
  EmailComment,
  EmailCommentSeverity,
  EmailListItem,
} from "../../emails/types";

import type { CommentBlockOption, CommentStatusFilter } from "./EmailReview.types";
import {
  commentSeverityColor,
  formatCommentDate,
  formatCommentSeverity,
  getReviewTargetLabel,
} from "./EmailReview.helpers";

import styles from "./EmailReview.module.css";

export function CommentsPanel({
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


