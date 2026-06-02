import { notifications } from "@mantine/notifications";
import { useQuery } from "@tanstack/react-query";

import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  Select,
  Skeleton,
  Stack,
  Text,
  Textarea,
  TextInput,
  Timeline,
  Tooltip,
} from "@mantine/core";

import {
  CheckIcon,
  CopyIcon,
  DownloadSimpleIcon,
} from "@phosphor-icons/react";

import { useState } from "react";

import { copyRenderedHTML, downloadRenderedHTML } from "../../emails/exportHtml";
import { fetchEmailVersion } from "../../emails/api";
import {
  emailReviewStatusColor,
  formatEmailReviewStatus,
} from "../../emails/reviewStatus";
import type {
  EmailAreaApproval,
  EmailActivityItem,
  EmailDetail,
  EmailVersionDetail,
  EmailVersionListItem,
  UpdateEmailPlanningFieldsPayload,
  UserAdminItem,
  UserRole,
} from "../../emails/types";

import {
  activityColor,
  activityDetail,
  activitySummary,
  areaApprovalStatusColor,
  formatActivityType,
  formatAreaApprovalStatus,
  formatCommentDate,
  nullableTrimmed,
} from "./EmailReview.helpers";

import styles from "./EmailReview.module.css";

async function copyPlainText(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value);
    notifications.show({
      color: "green",
      message: label + " copied to clipboard.",
      title: "Copied",
    });
  } catch {
    notifications.show({
      color: "red",
      message: "Browser blocked clipboard access.",
      title: "Copy failed",
    });
  }
}

export function PlanningPanel({
  adminUsers,
  canManage,
  email,
  isLoadingUsers,
  isSaving,
  onSubmit,
}: {
  adminUsers: UserAdminItem[];
  canManage: boolean;
  email: EmailDetail | undefined;
  isLoadingUsers: boolean;
  isSaving: boolean;
  onSubmit: (payload: UpdateEmailPlanningFieldsPayload) => void;
}) {
  const [ownerEmail, setOwnerEmail] = useState(email?.owner_email ?? "");
  const [reviewerEmail, setReviewerEmail] = useState(email?.reviewer_email ?? "");
  const [dueDate, setDueDate] = useState(email?.due_date ?? "");
  const [implementationNotes, setImplementationNotes] = useState(
    email?.implementation_notes ?? ""
  );
  const [sendTiming, setSendTiming] = useState(email?.send_timing ?? "");
  const [adaptationLabel, setAdaptationLabel] = useState(
    email?.adaptation_label ?? "Default"
  );

  if (!email) {
    return (
      <Stack className={styles.emptyState} align="center" justify="center">
        <Loader size="sm" />
      </Stack>
    );
  }

  const payload = {
    owner_email: nullableTrimmed(ownerEmail),
    reviewer_email: nullableTrimmed(reviewerEmail),
    due_date: nullableTrimmed(dueDate),
    implementation_notes: nullableTrimmed(implementationNotes),
    send_timing: nullableTrimmed(sendTiming),
    adaptation_label: adaptationLabel.trim() || "Default",
  };
  const isDirty =
    payload.owner_email !== (email.owner_email ?? null) ||
    payload.reviewer_email !== (email.reviewer_email ?? null) ||
    payload.due_date !== (email.due_date ?? null) ||
    payload.implementation_notes !== (email.implementation_notes ?? null) ||
    payload.send_timing !== (email.send_timing ?? null) ||
    payload.adaptation_label !== email.adaptation_label;
  const ownerOptions = assigneeOptions(adminUsers, ownerEmail, [
    "admin",
    "super_admin",
  ]);
  const reviewerOptions = assigneeOptions(adminUsers, reviewerEmail, [
    "reviewer",
    "admin",
    "super_admin",
  ]);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (canManage && isDirty) {
          onSubmit(payload);
        }
      }}
    >
      <Stack gap="sm">
        <Select
          clearable
          disabled={!canManage || isSaving}
          label="Owner"
          nothingFoundMessage="No users found"
          placeholder="owner@example.com"
          searchable
          data={ownerOptions}
          value={ownerEmail || null}
          onChange={(value) => setOwnerEmail(value ?? "")}
        />
        <Select
          clearable
          disabled={!canManage || isSaving}
          label="Reviewer"
          nothingFoundMessage="No users found"
          placeholder="reviewer@example.com"
          searchable
          data={reviewerOptions}
          value={reviewerEmail || null}
          onChange={(value) => setReviewerEmail(value ?? "")}
        />
        {canManage && isLoadingUsers ? (
          <Text c="dimmed" size="xs">
            Loading user options
          </Text>
        ) : null}
        <TextInput
          disabled={!canManage || isSaving}
          label="Due date"
          type="date"
          value={dueDate}
          onChange={(event) => setDueDate(event.currentTarget.value)}
        />
        <Group grow align="flex-start">
          <TextInput
            disabled={!canManage || isSaving}
            label="Send timing"
            placeholder="Day 3"
            value={sendTiming}
            onChange={(event) => setSendTiming(event.currentTarget.value)}
          />
          <TextInput
            disabled={!canManage || isSaving}
            label="Adaptation"
            placeholder="Default"
            value={adaptationLabel}
            onChange={(event) => setAdaptationLabel(event.currentTarget.value)}
          />
        </Group>
        <Textarea
          autosize
          disabled={!canManage || isSaving}
          label="Implementation notes"
          minRows={4}
          value={implementationNotes}
          onChange={(event) => setImplementationNotes(event.currentTarget.value)}
        />
        {canManage ? (
          <Group justify="flex-end">
            <Button disabled={!isDirty} loading={isSaving} type="submit">
              Save
            </Button>
          </Group>
        ) : null}
      </Stack>
    </form>
  );
}


export function AreaApprovalsPanel({
  approvals,
  canManage,
  isError,
  isLoading,
  onSubmit,
  pendingArea,
}: {
  approvals: EmailAreaApproval[];
  canManage: boolean;
  isError: boolean;
  isLoading: boolean;
  onSubmit: (
    area: string,
    status: "approved" | "changes_requested",
    decisionNote: string | null
  ) => void;
  pendingArea: string | null;
}) {
  const [notesByArea, setNotesByArea] = useState<Record<string, string>>({});

  if (isLoading) {
    return (
      <Stack className={styles.emptyState} align="center" justify="center">
        <Loader size="sm" />
      </Stack>
    );
  }

  if (isError) {
    return (
      <Alert color="red" title="Could not load approvals" variant="light">
        Try refreshing the page or check the API server.
      </Alert>
    );
  }

  if (approvals.length === 0) {
    return (
      <Alert color="gray" title="No approval areas" variant="light">
        Add approval areas in board settings.
      </Alert>
    );
  }

  return (
    <Stack gap="sm">
      {approvals.map((approval) => {
        const noteDraft =
          notesByArea[approval.area] ?? approval.decision_note ?? "";
        const isPending = pendingArea === approval.area;

        return (
          <Stack
            className={styles.approvalAreaItem}
            gap="xs"
            key={approval.board_approval_area_id}
          >
            <Group justify="space-between" gap="xs" wrap="nowrap">
              <Stack gap={2}>
                <Group gap={6} wrap="nowrap">
                  <Text fw={700} size="sm">
                    {approval.name}
                  </Text>
                  {approval.required ? (
                    <Badge color="blue" radius="sm" size="xs" variant="light">
                      Required
                    </Badge>
                  ) : (
                    <Badge color="gray" radius="sm" size="xs" variant="light">
                      Optional
                    </Badge>
                  )}
                </Group>
                {approval.decided_by_email && approval.decided_at ? (
                  <Text c="dimmed" size="xs">
                    {approval.decided_by_email} ·{" "}
                    {formatCommentDate(approval.decided_at)}
                  </Text>
                ) : null}
              </Stack>
              <Badge
                color={areaApprovalStatusColor(approval.status)}
                radius="sm"
                variant="light"
              >
                {formatAreaApprovalStatus(approval.status)}
              </Badge>
            </Group>

            {approval.decision_note ? (
              <Text c="dimmed" size="sm" style={{ whiteSpace: "pre-wrap" }}>
                {approval.decision_note}
              </Text>
            ) : null}

            {canManage ? (
              <>
                <Textarea
                  autosize
                  disabled={isPending}
                  minRows={2}
                  placeholder="Decision note"
                  value={noteDraft}
                  onChange={(event) =>
                    setNotesByArea((current) => ({
                      ...current,
                      [approval.area]: event.currentTarget.value,
                    }))
                  }
                />
                <Group gap="xs" grow>
                  <Button
                    color="green"
                    disabled={isPending}
                    leftSection={<CheckIcon aria-hidden="true" size={15} />}
                    loading={isPending}
                    size="xs"
                    variant="light"
                    onClick={() =>
                      onSubmit(
                        approval.area,
                        "approved",
                        nullableTrimmed(noteDraft)
                      )
                    }
                  >
                    Approve
                  </Button>
                  <Button
                    color="yellow"
                    disabled={isPending}
                    loading={isPending}
                    size="xs"
                    variant="light"
                    onClick={() =>
                      onSubmit(
                        approval.area,
                        "changes_requested",
                        nullableTrimmed(noteDraft)
                      )
                    }
                  >
                    Request changes
                  </Button>
                </Group>
              </>
            ) : null}
          </Stack>
        );
      })}
    </Stack>
  );
}

export function VersionHistoryPanel({
  canManage,
  currentUserRole,
  isLoading,
  isRestoring,
  onRestore,
  restoreError,
  versions,
}: {
  canManage: boolean;
  currentUserRole: UserRole;
  isLoading: boolean;
  isRestoring: boolean;
  onRestore: (versionId: string) => void;
  restoreError: boolean;
  versions: EmailVersionListItem[];
}) {
  const [restoreVersion, setRestoreVersion] =
    useState<EmailVersionListItem | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const selectedVersion =
    versions.find((version) => version.id === selectedVersionId) ?? null;
  const previousVersion = selectedVersion
    ? versions.find(
        (version) => version.version_number === selectedVersion.version_number - 1
      ) ?? null
    : null;
  const selectedVersionQuery = useQuery({
    queryKey: [
      "emails",
      selectedVersion?.email_id ?? "",
      "versions",
      selectedVersion?.id ?? "",
    ],
    queryFn: () =>
      fetchEmailVersion(selectedVersion?.email_id ?? "", selectedVersion?.id ?? ""),
    enabled: Boolean(selectedVersion),
  });
  const previousVersionQuery = useQuery({
    queryKey: [
      "emails",
      previousVersion?.email_id ?? "",
      "versions",
      previousVersion?.id ?? "",
    ],
    queryFn: () =>
      fetchEmailVersion(previousVersion?.email_id ?? "", previousVersion?.id ?? ""),
    enabled: Boolean(previousVersion),
  });

  if (isLoading) {
    return (
      <Stack className={styles.emptyState} align="center" justify="center">
        <Loader size="sm" />
        <Text c="dimmed" size="sm">
          Loading versions
        </Text>
      </Stack>
    );
  }

  if (versions.length === 0) {
    return (
      <Alert color="gray" title="No versions" variant="light">
        Save an edit to create version history.
      </Alert>
    );
  }

  return (
    <>
      <Stack gap="sm">
        {restoreError ? (
          <Alert color="red" title="Restore failed" variant="light">
            This version may require super admin access or contain invalid fields.
          </Alert>
        ) : null}
        {versions.map((version) => {
          const requiresSuperAdmin =
            version.html_changed && currentUserRole !== "super_admin";
          const isSelected = selectedVersionId === version.id;
          return (
            <section className={styles.historyVersionCard} key={version.id}>
              <Stack gap="xs">
                <Group justify="space-between" gap="sm">
                  <Group gap="xs">
                    <Text fw={700} size="sm">
                      v{version.version_number}
                    </Text>
                    <Badge size="sm" variant="light">
                      {formatVersionSource(version)}
                    </Badge>
                    {version.restored_from_version_number ? (
                      <Badge color="blue" size="sm" variant="light">
                        from v{version.restored_from_version_number}
                      </Badge>
                    ) : null}
                  </Group>
                  {canManage ? (
                    <Group gap={4} wrap="nowrap">
                      <Button
                        size="xs"
                        variant={isSelected ? "filled" : "subtle"}
                        onClick={() =>
                          setSelectedVersionId(isSelected ? null : version.id)
                        }
                      >
                        Details
                      </Button>
                      <Button
                        disabled={requiresSuperAdmin}
                        loading={isRestoring && restoreVersion?.id === version.id}
                        size="xs"
                        variant="light"
                        onClick={() => setRestoreVersion(version)}
                      >
                        Restore
                      </Button>
                    </Group>
                  ) : null}
                </Group>
                <Text c="dimmed" size="xs">
                  {formatVersionDate(version.created_at)} by{" "}
                  {version.created_by_email}
                </Text>
                <Text size="sm">{formatVersionSummary(version)}</Text>
                {requiresSuperAdmin ? (
                  <Text c="orange" size="xs">
                    Source HTML changed. Restore requires super admin.
                  </Text>
                ) : null}
                {isSelected ? (
                  <VersionChangeDetails
                    current={selectedVersionQuery.data}
                    isError={selectedVersionQuery.isError || previousVersionQuery.isError}
                    isLoading={
                      selectedVersionQuery.isLoading ||
                      (Boolean(previousVersion) && previousVersionQuery.isLoading)
                    }
                    previous={previousVersionQuery.data}
                    hasPrevious={Boolean(previousVersion)}
                  />
                ) : null}
              </Stack>
            </section>
          );
        })}
      </Stack>

      <Modal
        centered
        opened={Boolean(restoreVersion)}
        title="Restore version"
        onClose={() => setRestoreVersion(null)}
      >
        <Stack gap="md">
          <Text size="sm">
            Restore {restoreVersion ? `v${restoreVersion.version_number}` : "this version"} as
            the latest email state. This creates a new version.
          </Text>
          <Group justify="flex-end">
            <Button
              disabled={isRestoring}
              variant="subtle"
              onClick={() => setRestoreVersion(null)}
            >
              Cancel
            </Button>
            <Button
              loading={isRestoring}
              onClick={() => {
                if (restoreVersion) {
                  onRestore(restoreVersion.id);
                  setRestoreVersion(null);
                }
              }}
            >
              Restore
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}

function formatVersionDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatVersionSource(version: EmailVersionListItem) {
  switch (version.source) {
    case "initial":
      return "Initial";
    case "restore":
      return "Restore";
    default:
      return "Manual";
  }
}

function formatVersionSummary(version: EmailVersionListItem) {
  const parts: string[] = [];
  if (version.changed_metadata_count > 0) {
    parts.push(`${version.changed_metadata_count} metadata fields`);
  }
  if (version.changed_field_count > 0) {
    parts.push(`${version.changed_field_count} editable fields`);
  }
  if (version.html_changed) {
    parts.push("source HTML");
  }

  return parts.length > 0 ? `${parts.join(", ")} changed` : "Baseline snapshot";
}

function VersionChangeDetails({
  current,
  hasPrevious,
  isError,
  isLoading,
  previous,
}: {
  current: EmailVersionDetail | undefined;
  hasPrevious: boolean;
  isError: boolean;
  isLoading: boolean;
  previous: EmailVersionDetail | undefined;
}) {
  if (isLoading) {
    return (
      <Group className={styles.historyDetails} gap="xs">
        <Loader size="xs" />
        <Text c="dimmed" size="xs">
          Loading change details
        </Text>
      </Group>
    );
  }

  if (isError || !current) {
    return (
      <Alert color="red" title="Could not load changes" variant="light">
        Try reopening the history panel.
      </Alert>
    );
  }

  if (!hasPrevious || !previous) {
    return (
      <Stack className={styles.historyDetails} gap={4}>
        <Text c="dimmed" size="xs">
          Initial snapshot has no previous version to compare.
        </Text>
      </Stack>
    );
  }

  const changes = buildVersionChanges(current, previous);
  if (changes.length === 0) {
    return (
      <Stack className={styles.historyDetails} gap={4}>
        <Text c="dimmed" size="xs">
          No effective differences from the previous version.
        </Text>
      </Stack>
    );
  }

  return (
    <Stack className={styles.historyDetails} gap="xs">
      {changes.map((change) => (
        <Stack className={styles.historyChangeRow} gap={4} key={change.label}>
          <Text fw={700} size="xs">
            {change.label}
          </Text>
          <Group align="flex-start" gap="xs" wrap="nowrap">
            <Text className={styles.historyChangeValue} c="dimmed" size="xs">
              {change.before}
            </Text>
            <Text c="dimmed" size="xs">
              -&gt;
            </Text>
            <Text className={styles.historyChangeValue} size="xs">
              {change.after}
            </Text>
          </Group>
        </Stack>
      ))}
    </Stack>
  );
}

type VersionChange = {
  label: string;
  before: string;
  after: string;
};

function buildVersionChanges(
  current: EmailVersionDetail,
  previous: EmailVersionDetail
): VersionChange[] {
  const changes: VersionChange[] = [];
  appendChange(changes, "Title", previous.title, current.title);
  appendChange(changes, "Subject", previous.subject, current.subject);
  appendChange(changes, "Preheader", previous.preheader, current.preheader);

  const fieldKeys = Array.from(
    new Set([
      ...Object.keys(previous.editable_fields),
      ...Object.keys(current.editable_fields),
    ])
  ).sort((first, second) => {
    const firstOrder =
      current.editable_fields[first]?.order ??
      previous.editable_fields[first]?.order ??
      Number.MAX_SAFE_INTEGER;
    const secondOrder =
      current.editable_fields[second]?.order ??
      previous.editable_fields[second]?.order ??
      Number.MAX_SAFE_INTEGER;
    return firstOrder === secondOrder
      ? first.localeCompare(second)
      : firstOrder - secondOrder;
  });

  fieldKeys.forEach((key) => {
    const beforeField = previous.editable_fields[key];
    const afterField = current.editable_fields[key];
    if (editableFieldSignature(beforeField) === editableFieldSignature(afterField)) {
      return;
    }
    changes.push({
      label: key,
      before: formatEditableFieldValue(beforeField),
      after: formatEditableFieldValue(afterField),
    });
  });

  appendChange(
    changes,
    "Original HTML",
    previous.original_html,
    current.original_html,
    "Previous HTML",
    "New HTML"
  );
  appendChange(
    changes,
    "Template HTML",
    previous.template_html,
    current.template_html,
    "Previous HTML",
    "New HTML"
  );

  return changes;
}

function appendChange(
  changes: VersionChange[],
  label: string,
  before: string | number | null | undefined,
  after: string | number | null | undefined,
  beforeLabel?: string,
  afterLabel?: string
) {
  if (normalizeVersionValue(before) === normalizeVersionValue(after)) {
    return;
  }
  changes.push({
    label,
    before: beforeLabel ?? formatVersionValue(before),
    after: afterLabel ?? formatVersionValue(after),
  });
}

function editableFieldSignature(
  field: EmailVersionDetail["editable_fields"][string] | undefined
) {
  return field
    ? `${field.type}:${normalizeVersionValue(field.value)}`
    : "__missing__";
}

function formatEditableFieldValue(
  field: EmailVersionDetail["editable_fields"][string] | undefined
) {
  return field ? formatVersionValue(field.value) : "Not set";
}

function normalizeVersionValue(value: string | number | null | undefined) {
  return value === null || value === undefined ? "" : String(value);
}

function formatVersionValue(value: string | number | null | undefined) {
  const normalized = normalizeVersionValue(value);
  return normalized.trim() ? normalized : "Empty";
}

export function HandoffPanel({
  approvalActivity,
  areaApprovals,
  email,
  isLoadingRenderedHTML,
  openBlockingCommentCount,
  openCommentCount,
  renderedHTML,
  renderedHTMLError,
}: {
  approvalActivity: EmailActivityItem | null;
  areaApprovals: EmailAreaApproval[];
  email: EmailDetail | undefined;
  isLoadingRenderedHTML: boolean;
  openBlockingCommentCount: number;
  openCommentCount: number;
  renderedHTML: string;
  renderedHTMLError: boolean;
}) {
  if (!email) {
    return (
      <Stack className={styles.emptyState} align="center" justify="center">
        <Loader size="sm" />
      </Stack>
    );
  }

  const isApproved = email.review_status === "approved";
  const incompleteRequiredApprovals = areaApprovals.filter(
    (approval) => approval.required && approval.status !== "approved"
  );
  const approvalLabel = approvalActivity
    ? `${approvalActivity.actor_email ?? "System"} on ${formatCommentDate(approvalActivity.created_at)}`
    : "Approved";

  return (
    <Stack gap="sm">
      {!isApproved ? (
        <Alert color="gray" title="Handoff not ready" variant="light">
          Approve this email to prepare handoff.
        </Alert>
      ) : null}

      {openBlockingCommentCount > 0 ? (
        <Alert color="red" title="Open blocking comments" variant="light">
          Resolve blocking comments before production handoff.
        </Alert>
      ) : null}

      {incompleteRequiredApprovals.length > 0 ? (
        <Alert color="red" title="Required approvals incomplete" variant="light">
          Complete required area approvals before production handoff.
        </Alert>
      ) : null}

      <Stack className={styles.handoffSection} gap="xs">
        <Group justify="space-between" gap="xs" wrap="nowrap">
          <Text fw={700} size="sm">
            Package
          </Text>
          <Badge
            color={emailReviewStatusColor(email.review_status)}
            radius="sm"
            variant="light"
          >
            {formatEmailReviewStatus(email.review_status)}
          </Badge>
        </Group>
        <HandoffRow label="Title" value={email.title} />
        <HandoffRow label="Subject" value={email.subject ?? ""} copyable />
        <HandoffRow label="Preheader" value={email.preheader ?? ""} copyable />
        <HandoffRow label="Language" value={email.language.toUpperCase()} />
        <HandoffRow label="Version" value={email.variant} />
        <HandoffRow label="Adaptation" value={email.adaptation_label} />
        <HandoffRow label="Send timing" value={email.send_timing ?? ""} />
      </Stack>

      <Stack className={styles.handoffSection} gap="xs">
        <Text fw={700} size="sm">
          Approval
        </Text>
        <HandoffRow label="Status" value={formatEmailReviewStatus(email.review_status)} />
        {isApproved ? <HandoffRow label="Approved by" value={approvalLabel} /> : null}
        <HandoffRow
          label="Open comments"
          value={`${openCommentCount}${openBlockingCommentCount > 0 ? ` (${openBlockingCommentCount} blocking)` : ""}`}
        />
      </Stack>

      {areaApprovals.length > 0 ? (
        <Stack className={styles.handoffSection} gap="xs">
          <Text fw={700} size="sm">
            Area approvals
          </Text>
          {areaApprovals.map((approval) => (
            <Group
              className={styles.handoffRow}
              gap="xs"
              justify="space-between"
              key={approval.board_approval_area_id}
              wrap="nowrap"
            >
              <Group gap={6} wrap="nowrap">
                <Text c="dimmed" size="sm">
                  {approval.name}
                </Text>
                {approval.required ? (
                  <Badge color="blue" radius="sm" size="xs" variant="light">
                    Required
                  </Badge>
                ) : null}
              </Group>
              <Badge
                color={areaApprovalStatusColor(approval.status)}
                radius="sm"
                size="sm"
                variant="light"
              >
                {formatAreaApprovalStatus(approval.status)}
              </Badge>
            </Group>
          ))}
        </Stack>
      ) : null}

      {email.implementation_notes ? (
        <Stack className={styles.handoffSection} gap={6}>
          <Text fw={700} size="sm">
            Implementation notes
          </Text>
          <Text c="dimmed" size="sm" style={{ whiteSpace: "pre-wrap" }}>
            {email.implementation_notes}
          </Text>
        </Stack>
      ) : null}

      <Stack className={styles.handoffSection} gap="xs">
        <Group justify="space-between" gap="xs" wrap="nowrap">
          <Text fw={700} size="sm">
            Final HTML
          </Text>
          {renderedHTML ? (
            <Text c="dimmed" size="xs">
              {formatByteSize(renderedHTML)}
            </Text>
          ) : null}
        </Group>

        {renderedHTMLError ? (
          <Alert color="red" title="Failed to render HTML" variant="light">
            Try refreshing the page or check the email source.
          </Alert>
        ) : (
          <>
            <Textarea
              autosize
              disabled={!isApproved || isLoadingRenderedHTML}
              maxRows={8}
              minRows={5}
              readOnly
              value={
                isLoadingRenderedHTML
                  ? "Loading rendered HTML..."
                  : renderedHTML
              }
            />
            <Group gap="xs" grow>
              <Button
                disabled={!isApproved || !renderedHTML}
                leftSection={<CopyIcon aria-hidden="true" size={15} />}
                size="xs"
                variant="light"
                onClick={() => void copyRenderedHTML(renderedHTML)}
              >
                Copy HTML
              </Button>
              <Button
                disabled={!isApproved || !renderedHTML}
                leftSection={<DownloadSimpleIcon aria-hidden="true" size={15} />}
                size="xs"
                variant="light"
                onClick={() => downloadRenderedHTML(email, renderedHTML)}
              >
                Download
              </Button>
            </Group>
          </>
        )}
      </Stack>

    </Stack>
  );
}


function HandoffRow({
  copyable = false,
  label,
  value,
}: {
  copyable?: boolean;
  label: string;
  value: string;
}) {
  const displayValue = value.trim() || "Not set";

  return (
    <Group className={styles.handoffRow} gap="xs" justify="space-between" wrap="nowrap">
      <Text c="dimmed" size="sm">
        {label}
      </Text>
      <Group gap={4} justify="flex-end" wrap="nowrap">
        <Text className={styles.handoffValue} fw={600} size="sm">
          {displayValue}
        </Text>
        {copyable && value.trim() ? (
          <Tooltip label={`Copy ${label.toLowerCase()}`}>
            <ActionIcon
              aria-label={`Copy ${label.toLowerCase()}`}
              size="sm"
              variant="subtle"
              onClick={() => void copyPlainText(value, label)}
            >
              <CopyIcon aria-hidden="true" size={14} />
            </ActionIcon>
          </Tooltip>
        ) : null}
      </Group>
    </Group>
  );
}


function formatByteSize(value: string) {
  const bytes = new Blob([value]).size;
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  return `${(bytes / 1024).toFixed(1)} KB`;
}


function assigneeOptions(
  users: UserAdminItem[],
  currentEmail: string,
  allowedRoles: UserRole[]
) {
  const allowedRoleSet = new Set<UserRole>(allowedRoles);
  const options = users
    .filter((user) => allowedRoleSet.has(user.role))
    .map((user) => ({
      label: `${user.email} (${formatUserRole(user.role)})`,
      value: user.email,
    }));
  const normalizedCurrentEmail = currentEmail.trim();
  if (
    normalizedCurrentEmail &&
    !options.some((option) => option.value === normalizedCurrentEmail)
  ) {
    options.unshift({
      label: normalizedCurrentEmail,
      value: normalizedCurrentEmail,
    });
  }

  return options;
}


function formatUserRole(role: UserRole) {
  return role.replaceAll("_", " ");
}


export function ReviewPreviewSkeleton() {
  return (
    <div className={styles.previewSkeleton}>
      <Stack gap="md">
        <Group gap="sm" wrap="nowrap">
          <Skeleton circle h={40} w={40} />
          <Stack gap={6} flex={1}>
            <Skeleton h={12} w={140} />
            <Skeleton h={12} w="60%" />
            <Skeleton h={10} w={180} />
          </Stack>
        </Group>
        <Skeleton h={220} radius="md" />
        <Stack gap="sm">
          <Skeleton h={14} w="42%" />
          <Skeleton h={14} w="72%" />
          <Skeleton h={14} w="68%" />
          <Skeleton h={14} w="58%" />
        </Stack>
      </Stack>
    </div>
  );
}


export function ActivityPanel({
  activities,
  isError,
  isLoading,
}: {
  activities: EmailActivityItem[];
  isError: boolean;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <Stack className={styles.emptyState} align="center" justify="center">
        <Loader size="sm" />
        <Text c="dimmed" size="sm">
          Loading activity
        </Text>
      </Stack>
    );
  }

  if (isError) {
    return (
      <Alert color="red" title="Failed to load activity">
        Activity is unavailable right now.
      </Alert>
    );
  }

  if (activities.length === 0) {
    return (
      <Stack className={styles.emptyState} align="center" justify="center" gap="xs">
        <Text fw={600}>No activity yet</Text>
        <Text c="dimmed" ta="center" size="sm">
          Review actions will appear here as this email changes.
        </Text>
      </Stack>
    );
  }

  return (
    <Timeline active={activities.length} bulletSize={24} lineWidth={2}>
      {activities.map((activity) => (
        <Timeline.Item
          color={activityColor(activity.type)}
          key={activity.id}
          title={
            <Group justify="space-between" gap="xs" wrap="nowrap">
              <Stack gap={2}>
                <Text fw={700} size="xs">
                  {activity.actor_email ?? "System"}
                </Text>
                <Text c="dimmed" size="xs">
                  {formatCommentDate(activity.created_at)}
                </Text>
              </Stack>
              <Badge color={activityColor(activity.type)} size="sm" variant="light">
                {formatActivityType(activity)}
              </Badge>
            </Group>
          }
        >
          <Stack className={styles.activityItem} gap={6}>
            <Text size="sm">{activitySummary(activity)}</Text>
            {activityDetail(activity) ? (
              <Text c="dimmed" size="xs">
                {activityDetail(activity)}
              </Text>
            ) : null}
          </Stack>
        </Timeline.Item>
      ))}
    </Timeline>
  );
}
