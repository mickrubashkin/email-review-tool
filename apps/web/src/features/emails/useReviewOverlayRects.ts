import { useCallback, useEffect, useState } from "react";

import {
  buildReviewOverlayBadges,
  buildExternalReviewOverlayRects,
  buildReviewOverlayRects,
  scrollExternalReviewTargetIntoView,
  scrollReviewTargetIntoView,
} from "./reviewOverlayGeometry";
import type {
  ReviewOverlayBadge,
  ReviewCommentTarget,
  ReviewOverlayRect,
} from "./reviewOverlayTypes";

type ReviewOverlayState = {
  badges: ReviewOverlayBadge[];
  rects: ReviewOverlayRect[];
};

export function useReviewOverlayRects({
  activeCommentId,
  commentTargets,
  frameLoadVersion,
  frameRef,
  overlayRootRef,
  viewport,
}: {
  activeCommentId: string | null;
  commentTargets: ReviewCommentTarget[];
  frameLoadVersion: number;
  frameRef: React.RefObject<HTMLIFrameElement | null>;
  overlayRootRef: React.RefObject<HTMLElement | null>;
  viewport: string;
}) {
  const [overlayState, setOverlayState] = useState<ReviewOverlayState>({
    badges: [],
    rects: [],
  });
  const updateOverlayRects = useCallback(() => {
    const frame = frameRef.current;
    const overlayRoot = overlayRootRef.current;
    if (!frame || !overlayRoot) {
      setOverlayState({ badges: [], rects: [] });
      return;
    }

    const rects = [
      ...buildReviewOverlayRects(frame, overlayRoot, commentTargets),
      ...buildExternalReviewOverlayRects(overlayRoot, commentTargets),
    ];
    setOverlayState({
      badges: buildReviewOverlayBadges(rects),
      rects,
    });
  }, [commentTargets, frameRef, overlayRootRef]);

  useEffect(() => {
    const frame = frameRef.current;
    const frameWindow = frame?.contentWindow;
    const overlayRoot = overlayRootRef.current;
    if (!frame || !frameWindow || !overlayRoot) {
      setOverlayState({ badges: [], rects: [] });
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
    resizeObserver.observe(overlayRoot);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      frameWindow.removeEventListener("scroll", scheduleOverlayUpdate, true);
      window.removeEventListener("resize", scheduleOverlayUpdate);
      resizeObserver.disconnect();
    };
  }, [frameLoadVersion, frameRef, overlayRootRef, updateOverlayRects, viewport]);

  useEffect(() => {
    if (!activeCommentId) {
      return;
    }

    const frame = frameRef.current;
    const overlayRoot = overlayRootRef.current;
    const target = commentTargets.find((comment) => comment.id === activeCommentId);
    if (!frame || !overlayRoot || !target) {
      return;
    }

    const didScrollFrame = scrollReviewTargetIntoView(frame, target);
    if (!didScrollFrame) {
      scrollExternalReviewTargetIntoView(overlayRoot, target);
    }
    const timeout = window.setTimeout(updateOverlayRects, 120);
    return () => window.clearTimeout(timeout);
  }, [activeCommentId, commentTargets, frameRef, overlayRootRef, updateOverlayRects]);

  return overlayState;
}
