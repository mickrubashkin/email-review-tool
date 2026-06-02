import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  NumberInput,
  Stack,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";

import type {
  AuthUser,
  EditableField,
  EmailVersionDetail,
  EmailVersionListItem,
} from "../types";

import {
  formatFieldLabel,
  getFieldSuffixLabel,
  shouldUseTextarea,
} from "./EmailFieldsEditor.helpers";
import type { EditorFormState, FieldGroup } from "./EmailFieldsEditor.types";
import styles from "./EmailFieldsEditor.module.css";

export function EmailVersionHistoryPanel({
  currentUserRole,
  isLoadingDetail,
  isLoadingVersions,
  isRestoring,
  onRestore,
  onSelectVersion,
  restoreError,
  selectedVersion,
  versionDetail,
  versions,
}: {
  currentUserRole: AuthUser["role"];
  isLoadingDetail: boolean;
  isLoadingVersions: boolean;
  isRestoring: boolean;
  onRestore: (version: EmailVersionListItem) => void;
  onSelectVersion: (versionId: string) => void;
  restoreError: boolean;
  selectedVersion: EmailVersionListItem | undefined;
  versionDetail: EmailVersionDetail | undefined;
  versions: EmailVersionListItem[];
}) {
  const selectedRequiresSuperAdmin =
    selectedVersion?.html_changed && currentUserRole !== "super_admin";

  return (
    <div className={styles.historyLayout}>
      <Stack className={styles.historyList} gap="xs">
        {isLoadingVersions ? (
          <Group gap="sm" p="md">
            <Loader size="sm" />
            <Text c="dimmed" size="sm">
              Loading versions
            </Text>
          </Group>
        ) : null}
        {!isLoadingVersions && versions.length === 0 ? (
          <Alert color="gray" title="No versions yet">
            Save email fields to create the first version.
          </Alert>
        ) : null}
        {versions.map((version) => (
          <button
            className={styles.historyItem}
            data-active={version.id === selectedVersion?.id || undefined}
            key={version.id}
            type="button"
            onClick={() => onSelectVersion(version.id)}
          >
            <Group justify="space-between" wrap="nowrap">
              <Text fw={700} size="sm">
                v{version.version_number}
              </Text>
              <Badge size="sm" variant="light">
                {formatVersionSource(version)}
              </Badge>
            </Group>
            <Text c="dimmed" size="xs">
              {formatVersionDate(version.created_at)}
            </Text>
            <Text className={styles.historyActor} c="dimmed" size="xs">
              {version.created_by_email}
            </Text>
            <Text c="dimmed" size="xs">
              {formatVersionSummary(version)}
            </Text>
          </button>
        ))}
      </Stack>

      <section className={styles.historyPreview}>
        <Group className={styles.previewHeader} justify="space-between">
          <Stack gap={2}>
            <Text fw={700} size="sm">
              {selectedVersion ? `Version ${selectedVersion.version_number}` : "Version"}
            </Text>
            {selectedVersion?.restored_from_version_number ? (
              <Text c="dimmed" size="xs">
                Restored from v{selectedVersion.restored_from_version_number}
              </Text>
            ) : null}
          </Stack>
          <Button
            disabled={!selectedVersion || selectedRequiresSuperAdmin}
            loading={isRestoring}
            size="xs"
            variant="light"
            onClick={() => selectedVersion && onRestore(selectedVersion)}
          >
            Restore
          </Button>
        </Group>
        {restoreError ? (
          <Alert color="red" title="Failed to restore">
            This version may require super admin access or contain invalid fields.
          </Alert>
        ) : null}
        {selectedRequiresSuperAdmin ? (
          <Alert color="yellow" title="Super admin required">
            This version changes source HTML.
          </Alert>
        ) : null}
        <div className={styles.previewFrameWrap}>
          {isLoadingDetail ? (
            <Stack align="center" justify="center" h="100%">
              <Loader />
              <Text c="dimmed" size="sm">
                Loading preview
              </Text>
            </Stack>
          ) : (
            <iframe
              className={styles.previewFrame}
              sandbox="allow-same-origin"
              srcDoc={versionDetail?.review_html ?? ""}
              title={
                selectedVersion
                  ? `Version ${selectedVersion.version_number} preview`
                  : "Version preview"
              }
            />
          )}
        </div>
      </section>
    </div>
  );
}

export function RestoreVersionModal({
  isOpen,
  isRestoring,
  onClose,
  onConfirm,
  version,
}: {
  isOpen: boolean;
  isRestoring: boolean;
  onClose: () => void;
  onConfirm: () => void;
  version: EmailVersionListItem | undefined;
}) {
  return (
    <Modal centered opened={isOpen} title="Restore version" onClose={onClose}>
      <Stack gap="md">
        <Text size="sm">
          Restore {version ? `version ${version.version_number}` : "this version"} as
          the latest email state. This creates a new version.
        </Text>
        <Group justify="flex-end">
          <Button disabled={isRestoring} variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={isRestoring} onClick={onConfirm}>
            Restore
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

export function HTMLTemplatePanel({
  isSaving,
  onChange,
  originalHTML,
}: {
  isSaving: boolean;
  onChange: (originalHTML: string) => void;
  originalHTML: string;
}) {
  return (
    <Stack className={styles.editorContent} gap="md">
      <Alert color="yellow" title="Super admin HTML editor">
        Save validates editable markers, updates source HTML, and refreshes the rendered preview.
      </Alert>
      <Textarea
        classNames={{ input: styles.htmlTextarea }}
        disabled={isSaving}
        label="Original HTML"
        minRows={24}
        value={originalHTML}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </Stack>
  );
}

export function EditorFieldsPanel({
  fieldGroups,
  formState,
  isSaving,
  onChangeField,
  onChangeMetadata,
  saveError,
}: {
  fieldGroups: FieldGroup[];
  formState: EditorFormState;
  isSaving: boolean;
  onChangeField: (key: string, field: EditableField) => void;
  onChangeMetadata: (
    key: "title" | "subject" | "preheader",
    value: string
  ) => void;
  saveError: boolean;
}) {
  return (
    <Stack className={styles.editorContent} gap="md">
      {saveError ? (
        <Alert color="red" title="Failed to save fields">
          Check field values. URLs must use http or https.
        </Alert>
      ) : null}

      <section className={styles.fieldGroup}>
        <Stack gap="sm">
          <Text fw={700} size="sm">
            Metadata
          </Text>
          <TextInput
            disabled={isSaving}
            label="Title"
            value={formState.title}
            onChange={(event) =>
              onChangeMetadata("title", event.currentTarget.value)
            }
          />
          <TextInput
            disabled={isSaving}
            label="Subject"
            value={formState.subject}
            onChange={(event) =>
              onChangeMetadata("subject", event.currentTarget.value)
            }
          />
          <Textarea
            autosize
            disabled={isSaving}
            label="Preheader"
            minRows={2}
            value={formState.preheader}
            onChange={(event) =>
              onChangeMetadata("preheader", event.currentTarget.value)
            }
          />
        </Stack>
      </section>

      {fieldGroups.length === 0 ? (
        <Alert color="gray" title="No editable fields">
          This email template does not expose editable fields yet.
        </Alert>
      ) : null}

      {fieldGroups.map((group) => (
        <section className={styles.fieldGroup} key={group.key}>
          <Stack gap="sm">
            <Text fw={700} size="sm">
              {formatFieldLabel(group.key)}
            </Text>
            {group.fields.map(([fieldKey, field]) => (
              <EditableFieldControl
                field={field}
                fieldKey={fieldKey}
                isSaving={isSaving}
                key={fieldKey}
                onChange={(nextField) => onChangeField(fieldKey, nextField)}
              />
            ))}
          </Stack>
        </section>
      ))}
    </Stack>
  );
}

function formatVersionDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatVersionSource(version: EmailVersionListItem) {
  if (version.source === "initial") {
    return "Initial";
  }
  if (version.source === "restore") {
    return "Restore";
  }

  return "Manual";
}

function formatVersionSummary(version: EmailVersionListItem) {
  const parts: string[] = [];
  if (version.changed_metadata_count > 0) {
    parts.push(`${version.changed_metadata_count} metadata`);
  }
  if (version.changed_field_count > 0) {
    parts.push(`${version.changed_field_count} fields`);
  }
  if (version.html_changed) {
    parts.push("HTML");
  }

  return parts.length > 0 ? parts.join(", ") : "Baseline snapshot";
}

function EditableFieldControl({
  field,
  fieldKey,
  isSaving,
  onChange,
}: {
  field: EditableField;
  fieldKey: string;
  isSaving: boolean;
  onChange: (field: EditableField) => void;
}) {
  const label = formatFieldLabel(getFieldSuffixLabel(fieldKey));
  const value = field.value;

  if (field.type === "number") {
    return (
      <NumberInput
        disabled={isSaving}
        label={label}
        value={typeof value === "number" ? value : Number(value) || 0}
        onChange={(nextValue) =>
          onChange({
            ...field,
            value: typeof nextValue === "number" ? nextValue : Number(nextValue) || 0,
          })
        }
      />
    );
  }

  const stringValue = String(value ?? "");
  if (shouldUseTextarea(field, stringValue)) {
    return (
      <Textarea
        autosize
        disabled={isSaving}
        label={label}
        minRows={3}
        value={stringValue}
        onChange={(event) =>
          onChange({
            ...field,
            value: event.currentTarget.value,
          })
        }
      />
    );
  }

  return (
    <TextInput
      disabled={isSaving}
      label={label}
      value={stringValue}
      onChange={(event) =>
        onChange({
          ...field,
          value: event.currentTarget.value,
        })
      }
    />
  );
}

export function RenderedPreview({ html, title }: { html: string; title: string }) {
  return (
    <>
      <Group className={styles.previewHeader} justify="space-between">
        <Text fw={700} size="sm">
          Preview
        </Text>
        <Text c="dimmed" size="xs">
          Updates after save
        </Text>
      </Group>
      <div className={styles.previewFrameWrap}>
        <iframe
          className={styles.previewFrame}
          sandbox="allow-same-origin"
          srcDoc={html}
          title={`${title} rendered preview`}
        />
      </div>
    </>
  );
}
