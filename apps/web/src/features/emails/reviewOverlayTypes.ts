import type { ReviewTextSelection } from "./MailPreview";

export type ReviewCommentTarget = ReviewTextSelection & {
  authorKey: string;
  id: string;
  status: "open" | "resolved";
};

export type ReviewCommentColor = {
  accent: string;
  background: string;
  highlight: string;
  ring: string;
};

export type ReviewOverlayRect = {
  color: ReviewCommentColor;
  commentId: string;
  height: number;
  kind: "block" | "text";
  left: number;
  reviewBlock: string;
  status: ReviewCommentTarget["status"];
  top: number;
  width: number;
};

export type ReviewOverlayBadge = {
  color: ReviewCommentColor;
  commentIds: string[];
  count: number;
  kind: "block" | "text";
  left: number;
  reviewBlock: string;
  status: ReviewCommentTarget["status"];
  top: number;
};
