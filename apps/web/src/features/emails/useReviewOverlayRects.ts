import { useCallback, useEffect, useState } from "react";

import {
  buildReviewOverlayBadges,
  buildReviewOverlayRects,
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
  frameWrapRef,
  viewport,
}: {
  activeCommentId: string | null;
  commentTargets: ReviewCommentTarget[];
  frameLoadVersion: number;
  frameRef: React.RefObject<HTMLIFrameElement | null>;
  frameWrapRef: React.RefObject<HTMLDivElement | null>;
  viewport: string;
}) {
  const [overlayState, setOverlayState] = useState<ReviewOverlayState>({
    badges: [],
    rects: [],
  });
  const updateOverlayRects = useCallback(() => {
    const frame = frameRef.current;
    if (!frame) {
      setOverlayState({ badges: [], rects: [] });
      return;
    }

    const rects = buildReviewOverlayRects(frame, commentTargets);
    setOverlayState({
      badges: buildReviewOverlayBadges(rects),
      rects,
    });
  }, [commentTargets, frameRef]);

  useEffect(() => {
    const frame = frameRef.current;
    const frameWindow = frame?.contentWindow;
    if (!frame || !frameWindow) {
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
    if (frameWrapRef.current) {
      resizeObserver.observe(frameWrapRef.current);
    }

    return () => {
      window.cancelAnimationFrame(animationFrame);
      frameWindow.removeEventListener("scroll", scheduleOverlayUpdate, true);
      window.removeEventListener("resize", scheduleOverlayUpdate);
      resizeObserver.disconnect();
    };
  }, [frameLoadVersion, frameRef, frameWrapRef, updateOverlayRects, viewport]);

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
  }, [activeCommentId, commentTargets, frameRef, updateOverlayRects]);

  return overlayState;
}
