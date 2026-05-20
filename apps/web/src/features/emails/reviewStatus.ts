import type { EmailReviewStatus } from "./types";

export const emailReviewStatusOptions: Array<{
  value: EmailReviewStatus;
  label: string;
}> = [
  { value: "draft", label: "Draft" },
  { value: "in_review", label: "In review" },
  { value: "changes_requested", label: "Changes requested" },
  { value: "approved", label: "Approved" },
];

export function formatEmailReviewStatus(status: string) {
  return (
    emailReviewStatusOptions.find((option) => option.value === status)?.label ??
    status.replaceAll("_", " ")
  );
}

export function emailReviewStatusColor(status: EmailReviewStatus) {
  switch (status) {
    case "draft":
      return "gray";
    case "in_review":
      return "blue";
    case "changes_requested":
      return "yellow";
    case "approved":
      return "green";
    default:
      return "gray";
  }
}
