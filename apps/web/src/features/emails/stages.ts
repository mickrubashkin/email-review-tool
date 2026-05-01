import type { EmailListItem, EmailVersionGroup, StageColumn } from "./types";

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

const preferredVersionOrder = ["en", "es", "br", "pl", "de", "old"];

export function formatStageName(stage: string): string {
  return stage
    .split(/[-_]/)
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

export function sortEmailVersions(versions: EmailListItem[]): EmailListItem[] {
  return [...versions].sort((first, second) => {
    const firstIndex = preferredVersionOrder.indexOf(first.language);
    const secondIndex = preferredVersionOrder.indexOf(second.language);
    const normalizedFirstIndex =
      firstIndex === -1 ? preferredVersionOrder.length : firstIndex;
    const normalizedSecondIndex =
      secondIndex === -1 ? preferredVersionOrder.length : secondIndex;

    if (normalizedFirstIndex !== normalizedSecondIndex) {
      return normalizedFirstIndex - normalizedSecondIndex;
    }

    return first.language.localeCompare(second.language);
  });
}

export function getDefaultVersion(versions: EmailListItem[]): EmailListItem {
  return sortEmailVersions(versions)[0];
}

export function buildStageColumns(emails: EmailListItem[]): StageColumn[] {
  const groupsByKey = new Map<string, EmailVersionGroup>();

  for (const email of emails) {
    const stage = email.stage || "uncategorized";
    const groupKey = [email.sequence, stage, email.sort_order].join("/");
    const emailGroup = groupsByKey.get(groupKey) ?? {
      key: groupKey,
      stage,
      sortOrder: email.sort_order,
      versions: [],
    };

    emailGroup.versions.push(email);
    groupsByKey.set(groupKey, emailGroup);
  }

  const groupsByStage = new Map<string, EmailVersionGroup[]>();

  for (const group of groupsByKey.values()) {
    const stageGroups = groupsByStage.get(group.stage) ?? [];

    stageGroups.push({
      ...group,
      versions: sortEmailVersions(group.versions),
    });
    groupsByStage.set(group.stage, stageGroups);
  }

  return Array.from(groupsByStage.entries())
    .map(([stage, emailGroups]) => {
      const sortedGroups = [...emailGroups].sort(
        (first, second) => first.sortOrder - second.sortOrder
      );
      return {
        stage,
        title: formatStageName(stage),
        sortOrder: sortedGroups[0]?.sortOrder ?? 0,
        emailGroups: sortedGroups,
      };
    })
    .sort((first, second) => first.sortOrder - second.sortOrder);
}
