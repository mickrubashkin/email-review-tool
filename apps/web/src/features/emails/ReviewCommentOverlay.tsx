import type { CSSProperties } from "react";

import styles from "./EmailPreviewDrawer.module.css";
import type { ReviewOverlayRect } from "./reviewOverlayTypes";

type ReviewCommentOverlayProps = {
  activeCommentId?: string | null;
  hoveredCommentId?: string | null;
  rects: ReviewOverlayRect[];
};

export function ReviewCommentOverlay({
  activeCommentId = null,
  hoveredCommentId = null,
  rects,
}: ReviewCommentOverlayProps) {
  return (
    <div className={styles.reviewOverlay} aria-hidden="true">
      {rects.map((rect, index) => {
        const isActive = rect.commentId === activeCommentId;
        const isHovered = rect.commentId === hoveredCommentId;
        const shouldShow = rect.status === "open" || isActive || isHovered;
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
  );
}
