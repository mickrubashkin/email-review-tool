import type { ReviewTextSelection } from "./MailPreview";
import type {
  ReviewCommentColor,
  ReviewCommentTarget,
  ReviewOverlayRect,
} from "./reviewOverlayTypes";

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

export function buildReviewOverlayRects(
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

export function scrollReviewTargetIntoView(
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
