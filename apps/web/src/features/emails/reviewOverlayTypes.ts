import type { ReviewTextSelection } from "./MailPreview";
import type { EmailCommentSeverity } from "./types";

export type ReviewCommentTarget = ReviewTextSelection & {
  authorKey: string;
  id: string;
  severity: EmailCommentSeverity;
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
