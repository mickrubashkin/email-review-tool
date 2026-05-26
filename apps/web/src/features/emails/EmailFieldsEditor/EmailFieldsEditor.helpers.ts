import type {
  EditableField,
  EditableFields,
  EmailDetail,
  EmailVariant,
  EmailVersionGroup,
} from "../types";
import { getVersionForVariant } from "../stages";

import type { EditorFormState, FieldGroup } from "./EmailFieldsEditor.types";

export function findNeighborEmail(
  groups: EmailVersionGroup[],
  variant: EmailVariant,
  preferredLanguage: string | undefined,
  preferredAdaptation: string
) {
  for (const group of groups) {
    const email = getVersionForVariant(
      group.versions,
      variant,
      preferredLanguage,
      preferredAdaptation
    );
    if (email) {
      return email;
    }
  }

  return undefined;
}

export function formatVariantOptionLabel(
  variant: string,
  availableVariants: string[] = []
) {
  if (/^v\d+$/i.test(variant)) {
    return variant;
  }
  if (variant === "new" && availableVariants.includes("old")) {
    return "New";
  }
  if (variant === "old") {
    return "Old";
  }

  return variant;
}

export function formatEmailTitle(title: string) {
  switch (title) {
    case "Follow Up 1":
      return "First Follow-up";
    case "Follow Up 2":
      return "Second Follow-up";
    default:
      return title;
  }
}

export function buildInitialFormState(email: EmailDetail): EditorFormState {
  return {
    title: email.title,
    subject: email.subject ?? "",
    preheader: email.preheader ?? "",
    editableFields: normalizeEditableFields(email.editable_fields),
    originalHTML: email.original_html,
  };
}

export function buildFieldGroups(fields: EditableFields): FieldGroup[] {
  const groups = new Map<string, [string, EditableField][]>();

  Object.entries(fields)
    .sort(compareFieldEntries)
    .forEach(([key, field]) => {
      const groupKey = getFieldGroupKey(key);
      const groupFields = [...(groups.get(groupKey) ?? []), [key, field]] as [
        string,
        EditableField,
      ][];
      groups.set(groupKey, groupFields.sort(compareFieldEntries));
    });

  return Array.from(groups.entries()).map(([key, groupFields]) => ({
    key,
    fields: groupFields,
  })).sort((firstGroup, secondGroup) => {
    const firstOrder = getGroupOrder(firstGroup);
    const secondOrder = getGroupOrder(secondGroup);
    if (firstOrder !== secondOrder) {
      return firstOrder - secondOrder;
    }

    return firstGroup.key.localeCompare(secondGroup.key);
  });
}

export function formatFieldLabel(value: string) {
  return value
    .split(/[_-]/)
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

export function getFieldSuffixLabel(key: string) {
  for (const suffix of ["_width_px", "_text", "_url", "_src", "_alt"]) {
    if (key.endsWith(suffix)) {
      return suffix.slice(1);
    }
  }

  return key;
}

export function serializeFormState(state: EditorFormState) {
  return JSON.stringify(state);
}

export function shouldUseTextarea(field: EditableField, value: string) {
  return field.type === "text" && (value.includes("\n") || value.length > 100);
}

function normalizeEditableFields(fields: EditableFields): EditableFields {
  return Object.fromEntries(
    Object.entries(fields ?? {}).filter((entry): entry is [string, EditableField] =>
      isEditableField(entry[1])
    )
  );
}

function isEditableField(field: unknown): field is EditableField {
  if (!field || typeof field !== "object") {
    return false;
  }

  const candidate = field as EditableField;
  return (
    ["text", "url", "image", "number"].includes(candidate.type) &&
    (typeof candidate.value === "string" || typeof candidate.value === "number")
  );
}

function compareFieldEntries(
  [firstKey, firstField]: [string, EditableField],
  [secondKey, secondField]: [string, EditableField]
) {
  const firstOrder = getFieldOrder(firstField);
  const secondOrder = getFieldOrder(secondField);
  if (firstOrder !== secondOrder) {
    return firstOrder - secondOrder;
  }

  return firstKey.localeCompare(secondKey);
}

function getGroupOrder(group: FieldGroup) {
  return Math.min(...group.fields.map(([, field]) => getFieldOrder(field)));
}

function getFieldOrder(field: EditableField) {
  return typeof field.order === "number" && field.order > 0
    ? field.order
    : Number.MAX_SAFE_INTEGER;
}

function getFieldGroupKey(key: string) {
  for (const suffix of ["_width_px", "_text", "_url", "_src", "_alt"]) {
    if (key.endsWith(suffix)) {
      return key.slice(0, -suffix.length);
    }
  }

  return key;
}
