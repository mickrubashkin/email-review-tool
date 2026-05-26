import type { AuthUser } from "../../emails/types";

export type EmailReviewProps = {
  currentUserRole: AuthUser["role"];
  emailId: string;
};

export type ReviewViewport = "desktop" | "mobile";

export type ReviewContentTab =
  | "email"
  | "ai"
  | "comments"
  | "more";

export type ReviewPanelTab = "ai" | "comments";
export type ReviewUtilityPanel = "planning" | "approvals" | "handoff" | "activity";
export type CommentStatusFilter = "open" | "all";
export type CommentBlockOption = {
  label: string;
  reviewBlock: string;
  selectedText: string;
  value: string;
};
