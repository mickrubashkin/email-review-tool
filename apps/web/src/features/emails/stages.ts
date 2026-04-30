import type { EmailListItem, StageColumn } from "./types";

export const stageColors = [
  "#2fb4ec",
  "#35c4f3",
  "#58d6d2",
  "#00e4ef",
  "#6bc7f3",
  "#ff9f1c",
  "#2fb4ec",
  "#ffb650",
  "#a46a00",
  "#68db00",
  "#ff5c73",
];

export function formatStageName(stage: string): string {
  return stage
    .split(/[-_]/)
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

export function buildStageColumns(emails: EmailListItem[]): StageColumn[] {
  const columnsByStage = new Map<string, EmailListItem[]>();

  for (const email of emails) {
    const stage = email.stage || "uncategorized";
    const stageEmails = columnsByStage.get(stage) ?? [];

    stageEmails.push(email);
    columnsByStage.set(stage, stageEmails);
  }

  return Array.from(columnsByStage.entries())
    .map(([stage, stageEmails]) => {
      const sortedEmails = [...stageEmails].sort(
        (first, second) => first.sort_order - second.sort_order
      );

      return {
        stage,
        title: formatStageName(stage),
        sortOrder: sortedEmails[0]?.sort_order ?? 0,
        emails: sortedEmails,
      };
    })
    .sort((first, second) => first.sortOrder - second.sortOrder);
}
