import type { CSSProperties } from "react";

import styles from "./EmailPreviewDrawer.module.css";
import type {
  ReviewOverlayBadge,
  ReviewOverlayRect,
} from "./reviewOverlayTypes";

type ReviewCommentOverlayProps = {
  activeCommentId?: string | null;
  badges: ReviewOverlayBadge[];
  hoveredCommentId?: string | null;
  rects: ReviewOverlayRect[];
};

export function ReviewCommentOverlay({
  activeCommentId = null,
  badges,
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
      {badges.map((badge) => {
        const isActive = badge.commentIds.includes(activeCommentId ?? "");
        const isHovered = badge.commentIds.includes(hoveredCommentId ?? "");
        const label = badge.count > 2 ? "3+" : String(badge.count);

        return (
          <div
            className={styles.reviewOverlayBadge}
            data-active={isActive || undefined}
            data-hovered={isHovered || undefined}
            data-kind={badge.kind}
            key={`${badge.reviewBlock}-${badge.commentIds.join("-")}`}
            style={
              {
                "--review-highlight-bg": badge.color.background,
                "--review-highlight-ring": badge.color.ring,
                "--review-highlight-stroke": badge.color.accent,
                left: badge.left,
                top: badge.top,
              } as CSSProperties
            }
          >
            {label}
          </div>
        );
      })}
    </div>
  );
}
