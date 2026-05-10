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
  status: ReviewCommentTarget["status"];
  top: number;
  width: number;
};
