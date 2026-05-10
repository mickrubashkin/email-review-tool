import {
  Button,
  Group,
  Popover,
  Stack,
  Text,
  Textarea,
} from "@mantine/core";

import {
  type SyntheticEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { ReviewCommentOverlay } from "./ReviewCommentOverlay";
import type { EmailDetail } from "./types";
import type { ReviewCommentTarget } from "./reviewOverlayTypes";
import { useReviewOverlayRects } from "./useReviewOverlayRects";
import styles from "./EmailPreviewDrawer.module.css";

export type PreviewViewport = "desktop" | "mobile";

export type ReviewTextSelection = {
  reviewBlock: string;
  selectedText: string;
  startOffset: number;
  endOffset: number;
};

type SelectionMenuState = ReviewTextSelection & {
  x: number;
  y: number;
};

type MailPreviewProps = {
  activeCommentId?: string | null;
  commentTargets?: ReviewCommentTarget[];
  createCommentError?: boolean;
  email: EmailDetail;
  enableReviewSelectionComposer?: boolean;
  hoveredCommentId?: string | null;
  isCreatingComment?: boolean;
  isScanning: boolean;
  onCreateReviewComment?: (selection: ReviewTextSelection, body: string) => void;
  viewport: PreviewViewport;
};

export function MailPreview({
  activeCommentId = null,
  commentTargets = [],
  createCommentError = false,
  email,
  enableReviewSelectionComposer = false,
  hoveredCommentId = null,
  isCreatingComment = false,
  isScanning,
  onCreateReviewComment,
  viewport,
}: MailPreviewProps) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const frameWrapRef = useRef<HTMLDivElement | null>(null);
  const wasCreatingCommentRef = useRef(false);
  const [selectionMenu, setSelectionMenu] = useState<SelectionMenuState | null>(
    null
  );
  const [draftComment, setDraftComment] = useState("");
  const [frameLoadVersion, setFrameLoadVersion] = useState(0);
  const handleFrameLoad = useCallback(
    (event: SyntheticEvent<HTMLIFrameElement>) => {
      frameRef.current = event.currentTarget;
      setSelectionMenu(null);
      setDraftComment("");
      setFrameLoadVersion((version) => version + 1);

      if (enableReviewSelectionComposer) {
        installReviewSelectionMenu(event.currentTarget, setSelectionMenu);
      }
    },
    [enableReviewSelectionComposer]
  );
  const closeSelectionComposer = () => {
    setSelectionMenu(null);
    setDraftComment("");
  };
  const handleSubmitComment = () => {
    if (!selectionMenu) {
      return;
    }

    const trimmedDraft = draftComment.trim();
    if (!trimmedDraft) {
      return;
    }

    onCreateReviewComment?.(
      {
        reviewBlock: selectionMenu.reviewBlock,
        selectedText: selectionMenu.selectedText,
        startOffset: selectionMenu.startOffset,
        endOffset: selectionMenu.endOffset,
      },
      trimmedDraft
    );
  };
  const trimmedDraft = draftComment.trim();
  const overlayRects = useReviewOverlayRects({
    activeCommentId,
    commentTargets,
    frameLoadVersion,
    frameRef,
    frameWrapRef,
    viewport,
  });

  useEffect(() => {
    if (wasCreatingCommentRef.current && !isCreatingComment && !createCommentError) {
      closeSelectionComposer();
    }

    wasCreatingCommentRef.current = isCreatingComment;
  }, [createCommentError, isCreatingComment]);

  return (
    <div className={styles.emailPreviewWrap} data-viewport={viewport}>
      <Popover
        opened={selectionMenu !== null}
        position="top"
        shadow="md"
        styles={{
          dropdown: {
            maxWidth: 340,
            width: 340,
          },
        }}
        withArrow
      >
        <Popover.Target>
          <div
            className={styles.selectionMenuAnchor}
            style={{
              left: selectionMenu?.x ?? 0,
              top: selectionMenu?.y ?? 0,
            }}
          />
        </Popover.Target>
        <Popover.Dropdown className={styles.selectionMenuDropdown}>
          <Stack gap="xs">
            <Text c="dimmed" size="xs">
              {selectionMenu?.reviewBlock}
            </Text>
            <Text className={styles.selectionMenuQuote} size="sm" lineClamp={3}>
              {selectionMenu?.selectedText}
            </Text>
            <Textarea
              autosize
              data-autofocus
              disabled={isCreatingComment}
              minRows={3}
              placeholder="Add a comment"
              value={draftComment}
              onChange={(event) => setDraftComment(event.currentTarget.value)}
            />
            {createCommentError ? (
              <Text c="red" size="xs">
                Failed to create comment.
              </Text>
            ) : null}
            <Group justify="flex-end" gap="xs">
              <Button
                disabled={isCreatingComment}
                size="xs"
                variant="subtle"
                onClick={closeSelectionComposer}
              >
                Cancel
              </Button>
              <Button
                disabled={!trimmedDraft}
                loading={isCreatingComment}
                size="xs"
                onClick={handleSubmitComment}
              >
                Add comment
              </Button>
            </Group>
          </Stack>
        </Popover.Dropdown>
      </Popover>

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

          <div className={styles.emailPreviewFrameWrap} ref={frameWrapRef}>
            <iframe
              className={styles.emailPreviewFrame}
              onLoad={handleFrameLoad}
              ref={frameRef}
              title={email.title}
              sandbox="allow-same-origin"
              srcDoc={email.review_html || email.original_html}
            />
            <ReviewCommentOverlay
              activeCommentId={activeCommentId}
              hoveredCommentId={hoveredCommentId}
              rects={overlayRects}
            />
          </div>
        </article>
      </div>
      {isScanning ? (
        <div className={styles.emailScanOverlay} aria-hidden="true" />
      ) : null}
    </div>
  );
}

function installReviewSelectionMenu(
  frame: HTMLIFrameElement,
  setSelectionMenu: (selection: SelectionMenuState | null) => void
) {
  const frameDocument = frame.contentDocument;
  const frameWindow = frame.contentWindow;
  if (!frameDocument || !frameWindow) {
    return;
  }

  const updateSelectionMenu = () => {
    const selection = frameWindow.getSelection();
    const reviewSelection = getReviewSelection(selection);
    if (!reviewSelection) {
      setSelectionMenu(null);
      return;
    }

    const rangeRect = selection?.getRangeAt(0).getBoundingClientRect();
    if (!rangeRect || (rangeRect.width === 0 && rangeRect.height === 0)) {
      setSelectionMenu(null);
      return;
    }

    const frameRect = frame.getBoundingClientRect();
    setSelectionMenu({
      ...reviewSelection,
      x: frameRect.left + rangeRect.left + rangeRect.width / 2,
      y: frameRect.top + rangeRect.top,
    });
  };
  const openBlockSelectionComposer = (event: MouseEvent) => {
    const selection = frameWindow.getSelection();
    if (selection && !selection.isCollapsed) {
      return;
    }

    const target = event.target;
    if (!isElementLike(target)) {
      return;
    }

    const block = getCommentableReviewBlockFromClick(target);
    if (!block) {
      return;
    }

    const reviewSelection = getWholeBlockSelection(block);
    if (!reviewSelection) {
      return;
    }

    const frameRect = frame.getBoundingClientRect();
    const blockRect = block.getBoundingClientRect();
    setSelectionMenu({
      ...reviewSelection,
      x: frameRect.left + blockRect.left + blockRect.width / 2,
      y: frameRect.top + blockRect.top,
    });
  };

  frameDocument.addEventListener("mouseup", updateSelectionMenu);
  frameDocument.addEventListener("click", openBlockSelectionComposer);
  frameDocument.addEventListener("keyup", updateSelectionMenu);
  frameDocument.addEventListener("selectionchange", () => {
    const selection = frameWindow.getSelection();
    if (!selection || selection.isCollapsed) {
      setSelectionMenu(null);
    }
  });
  frameWindow.addEventListener("scroll", () => setSelectionMenu(null), true);
}

function getReviewSelection(
  selection: Selection | null
): ReviewTextSelection | null {
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    return null;
  }

  const selectedText = selection.toString();
  if (!selectedText.trim()) {
    return null;
  }

  const range = selection.getRangeAt(0);
  const startBlock = getClosestReviewBlock(range.startContainer);
  const endBlock = getClosestReviewBlock(range.endContainer);
  if (!startBlock || startBlock !== endBlock) {
    return null;
  }

  const reviewBlock = startBlock.getAttribute("data-review-block");
  if (!reviewBlock) {
    return null;
  }

  const startOffset = getTextOffset(startBlock, range.startContainer, range.startOffset);
  const endOffset = startOffset + selectedText.length;

  return {
    reviewBlock,
    selectedText,
    startOffset,
    endOffset,
  };
}

function getWholeBlockSelection(block: Element): ReviewTextSelection | null {
  const reviewBlock = block.getAttribute("data-review-block");
  const selectedText = block.textContent ?? "";
  if (!reviewBlock || !selectedText.trim()) {
    return null;
  }

  return {
    reviewBlock,
    selectedText,
    startOffset: 0,
    endOffset: selectedText.length,
  };
}

function getCommentableReviewBlockFromClick(target: Element) {
  const block = target.closest("[data-review-block]");
  if (!block || isNonCommentableReviewContainer(block)) {
    return null;
  }

  return block;
}

function isNonCommentableReviewContainer(block: Element) {
  const tagName = block.tagName.toLowerCase();
  if (tagName === "html" || tagName === "body") {
    return true;
  }

  if (block.querySelector("[data-review-block]")) {
    return true;
  }

  const text = block.textContent?.trim() ?? "";
  const imageAlt = block.matches("img")
    ? block.getAttribute("alt")?.trim()
    : block.querySelector("img[alt]")?.getAttribute("alt")?.trim();

  return !text && !imageAlt;
}

function getClosestReviewBlock(node: Node) {
  const element =
    node.nodeType === 1 ? (node as Element) : node.parentElement;
  return element?.closest("[data-review-block]") ?? null;
}

function getTextOffset(root: Element, targetNode: Node, targetOffset: number) {
  const range = root.ownerDocument.createRange();
  range.selectNodeContents(root);
  range.setEnd(targetNode, targetOffset);

  return range.toString().length;
}

function isElementLike(value: EventTarget | null): value is Element {
  return value !== null && "closest" in value;
}
