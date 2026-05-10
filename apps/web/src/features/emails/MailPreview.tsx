import {
  Button,
  Group,
  Popover,
  Stack,
  Text,
  Textarea,
} from "@mantine/core";

import {
  type CSSProperties,
  type SyntheticEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import type { EmailDetail } from "./types";
import styles from "./EmailPreviewDrawer.module.css";

export type PreviewViewport = "desktop" | "mobile";

export type ReviewTextSelection = {
  reviewBlock: string;
  selectedText: string;
  startOffset: number;
  endOffset: number;
};

export type ReviewCommentTarget = ReviewTextSelection & {
  authorKey: string;
  id: string;
  status: "open" | "resolved";
};

type SelectionMenuState = ReviewTextSelection & {
  x: number;
  y: number;
};

type ReviewOverlayRect = {
  color: ReviewCommentColor;
  commentId: string;
  height: number;
  kind: "block" | "text";
  left: number;
  status: ReviewCommentTarget["status"];
  top: number;
  width: number;
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
  onCommentTargetClick?: (commentId: string) => void;
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
  const [overlayRects, setOverlayRects] = useState<ReviewOverlayRect[]>([]);
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
  const updateOverlayRects = useCallback(() => {
    const frame = frameRef.current;
    if (!frame) {
      setOverlayRects([]);
      return;
    }

    setOverlayRects(buildReviewOverlayRects(frame, commentTargets));
  }, [commentTargets]);

  useEffect(() => {
    if (wasCreatingCommentRef.current && !isCreatingComment && !createCommentError) {
      closeSelectionComposer();
    }

    wasCreatingCommentRef.current = isCreatingComment;
  }, [createCommentError, isCreatingComment]);

  useEffect(() => {
    const frame = frameRef.current;
    const frameWindow = frame?.contentWindow;
    if (!frame || !frameWindow) {
      setOverlayRects([]);
      return;
    }

    let animationFrame = 0;
    const scheduleOverlayUpdate = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(updateOverlayRects);
    };
    const resizeObserver = new ResizeObserver(scheduleOverlayUpdate);

    scheduleOverlayUpdate();
    frameWindow.addEventListener("scroll", scheduleOverlayUpdate, true);
    window.addEventListener("resize", scheduleOverlayUpdate);
    resizeObserver.observe(frame);
    if (frameWrapRef.current) {
      resizeObserver.observe(frameWrapRef.current);
    }

    return () => {
      window.cancelAnimationFrame(animationFrame);
      frameWindow.removeEventListener("scroll", scheduleOverlayUpdate, true);
      window.removeEventListener("resize", scheduleOverlayUpdate);
      resizeObserver.disconnect();
    };
  }, [frameLoadVersion, updateOverlayRects, viewport]);

  useEffect(() => {
    if (!activeCommentId) {
      return;
    }

    const frame = frameRef.current;
    const target = commentTargets.find((comment) => comment.id === activeCommentId);
    if (!frame || !target) {
      return;
    }

    scrollReviewTargetIntoView(frame, target);
    const timeout = window.setTimeout(updateOverlayRects, 120);
    return () => window.clearTimeout(timeout);
  }, [activeCommentId, commentTargets, updateOverlayRects]);

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
            <div className={styles.reviewOverlay} aria-hidden="true">
              {overlayRects.map((rect, index) => {
                const isActive = rect.commentId === activeCommentId;
                const isHovered = rect.commentId === hoveredCommentId;
                const shouldShow =
                  rect.status === "open" || isActive || isHovered;
                if (!shouldShow) {
                  return null;
                }

                return (
                  <div
                    className={styles.reviewOverlayRect}
                    data-active={isActive || undefined}
                    data-hovered={isHovered || undefined}
                    data-kind={rect.kind}
                    key={`${rect.commentId}-${rect.kind}-${index}`}
                    style={
                      {
                        "--review-highlight-bg": rect.color.background,
                        "--review-highlight-strong": rect.color.highlight,
                        "--review-highlight-ring": rect.color.ring,
                        "--review-highlight-stroke": rect.color.accent,
                        height: rect.height,
                        left: rect.left,
                        top: rect.top,
                        width: rect.width,
                      } as CSSProperties
                    }
                  />
                );
              })}
            </div>
          </div>
        </article>
      </div>
      {isScanning ? (
        <div className={styles.emailScanOverlay} aria-hidden="true" />
      ) : null}
    </div>
  );
}

type ReviewCommentColor = {
  accent: string;
  background: string;
  highlight: string;
  ring: string;
};

const reviewCommentColors: ReviewCommentColor[] = [
  {
    accent: "rgb(250, 176, 5)",
    background: "rgba(255, 212, 59, 0.14)",
    highlight: "rgba(255, 212, 59, 0.48)",
    ring: "rgba(250, 176, 5, 0.32)",
  },
  {
    accent: "rgb(55, 178, 77)",
    background: "rgba(81, 207, 102, 0.13)",
    highlight: "rgba(81, 207, 102, 0.4)",
    ring: "rgba(55, 178, 77, 0.28)",
  },
  {
    accent: "rgb(34, 139, 230)",
    background: "rgba(116, 192, 252, 0.14)",
    highlight: "rgba(116, 192, 252, 0.42)",
    ring: "rgba(34, 139, 230, 0.3)",
  },
  {
    accent: "rgb(121, 80, 242)",
    background: "rgba(177, 151, 252, 0.14)",
    highlight: "rgba(177, 151, 252, 0.42)",
    ring: "rgba(121, 80, 242, 0.3)",
  },
  {
    accent: "rgb(245, 124, 0)",
    background: "rgba(255, 169, 77, 0.14)",
    highlight: "rgba(255, 169, 77, 0.42)",
    ring: "rgba(245, 124, 0, 0.3)",
  },
  {
    accent: "rgb(12, 166, 120)",
    background: "rgba(99, 230, 190, 0.13)",
    highlight: "rgba(99, 230, 190, 0.38)",
    ring: "rgba(12, 166, 120, 0.26)",
  },
];

function buildReviewOverlayRects(
  frame: HTMLIFrameElement,
  targets: ReviewCommentTarget[]
): ReviewOverlayRect[] {
  const frameDocument = frame.contentDocument;
  if (!frameDocument) {
    return [];
  }

  return targets.flatMap((target) => {
    const block = findReviewBlock(frameDocument, target.reviewBlock);
    if (!block) {
      return [];
    }

    const color = getCommentColor(target.authorKey);
    const range = getTargetTextRange(block, target);
    const rects = range
      ? Array.from(range.getClientRects()).filter(
          (rect) => rect.width > 0 && rect.height > 0
        )
      : [];

    if (rects.length > 0 && !isWholeBlockTarget(block, target)) {
      return rects.map((rect) =>
        createOverlayRectFromClientRect(rect, target, color, "text")
      );
    }

    return [
      createOverlayRectFromClientRect(
        block.getBoundingClientRect(),
        target,
        color,
        "block"
      ),
    ];
  });
}

function createOverlayRectFromClientRect(
  rect: DOMRect,
  target: ReviewCommentTarget,
  color: ReviewCommentColor,
  kind: ReviewOverlayRect["kind"]
): ReviewOverlayRect {
  return {
    color,
    commentId: target.id,
    height: rect.height,
    kind,
    left: rect.left,
    status: target.status,
    top: rect.top,
    width: rect.width,
  };
}

function scrollReviewTargetIntoView(
  frame: HTMLIFrameElement,
  target: ReviewCommentTarget
) {
  const frameDocument = frame.contentDocument;
  if (!frameDocument) {
    return;
  }

  const block = findReviewBlock(frameDocument, target.reviewBlock);
  if (!block) {
    return;
  }

  const range = getTargetTextRange(block, target);
  if (range && !isWholeBlockTarget(block, target)) {
    const rangeRect = range.getBoundingClientRect();
    frame.contentWindow?.scrollBy({
      behavior: "smooth",
      top: rangeRect.top - frame.clientHeight / 2 + rangeRect.height / 2,
    });
    return;
  }

  block.scrollIntoView({
    behavior: "smooth",
    block: "center",
    inline: "nearest",
  });
}

function getTargetTextRange(block: Element, target: ReviewTextSelection) {
  if (isWholeBlockTarget(block, target)) {
    return null;
  }

  const rangeFromOffsets = createRangeFromTextOffsets(
    block,
    target.startOffset,
    target.endOffset
  );
  if (rangeFromOffsets) {
    return rangeFromOffsets;
  }

  const blockText = block.textContent ?? "";
  const fallbackStart = target.selectedText
    ? blockText.indexOf(target.selectedText)
    : -1;
  if (fallbackStart < 0) {
    return null;
  }

  return createRangeFromTextOffsets(
    block,
    fallbackStart,
    fallbackStart + target.selectedText.length
  );
}

function createRangeFromTextOffsets(
  root: Element,
  startOffset: number,
  endOffset: number
) {
  if (startOffset < 0 || endOffset <= startOffset) {
    return null;
  }

  const rootDocument = root.ownerDocument;
  const walker = rootDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let currentOffset = 0;
  let startPosition: TextPosition | null = null;
  let endPosition: TextPosition | null = null;

  while (walker.nextNode()) {
    const node = walker.currentNode;
    const textLength = node.textContent?.length ?? 0;
    const nextOffset = currentOffset + textLength;

    if (!startPosition && startOffset <= nextOffset) {
      startPosition = {
        node,
        offset: Math.max(0, startOffset - currentOffset),
      };
    }

    if (!endPosition && endOffset <= nextOffset) {
      endPosition = {
        node,
        offset: Math.max(0, endOffset - currentOffset),
      };
      break;
    }

    currentOffset = nextOffset;
  }

  if (!startPosition || !endPosition) {
    return null;
  }

  const range = rootDocument.createRange();
  range.setStart(startPosition.node, startPosition.offset);
  range.setEnd(endPosition.node, endPosition.offset);
  return range;
}

type TextPosition = {
  node: Node;
  offset: number;
};

function isWholeBlockTarget(block: Element, target: ReviewTextSelection) {
  const blockText = block.textContent ?? "";
  return target.startOffset === 0 && target.endOffset >= blockText.length;
}

function findReviewBlock(frameDocument: Document, reviewBlock: string) {
  return (
    Array.from(frameDocument.querySelectorAll("[data-review-block]")).find(
      (element) => element.getAttribute("data-review-block") === reviewBlock
    ) ?? null
  );
}

function getCommentColor(authorKey: string) {
  const hash = Array.from(authorKey).reduce(
    (currentHash, char) => currentHash + char.charCodeAt(0),
    0
  );
  return reviewCommentColors[hash % reviewCommentColors.length];
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
