import { useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  NumberInput,
  Stack,
  Tabs,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Save } from "lucide-react";
import { Copy, Download } from "lucide-react";

import {
  fetchEmailDetail,
  fetchRenderedEmail,
  updateEmailEditableFields,
} from "./api";
import { copyRenderedHTML, downloadRenderedHTML } from "./exportHtml";
import type {
  AuthUser,
  EditableField,
  EditableFields,
  EmailDetail,
  UpdateEditableFieldsPayload,
} from "./types";
import styles from "./EmailFieldsEditorView.module.css";

type EmailFieldsEditorViewProps = {
  currentUserRole: AuthUser["role"];
  emailId: string;
};

type EditorFormState = {
  title: string;
  subject: string;
  preheader: string;
  editableFields: EditableFields;
};

type FieldGroup = {
  key: string;
  fields: [string, EditableField][];
};

export function EmailFieldsEditorView({
  currentUserRole,
  emailId,
}: EmailFieldsEditorViewProps) {
  const canEdit = currentUserRole === "admin" || currentUserRole === "super_admin";
  const emailQuery = useQuery({
    queryKey: ["emails", emailId],
    queryFn: () => fetchEmailDetail(emailId),
    enabled: canEdit,
  });
  const renderedQuery = useQuery({
    queryKey: ["emails", emailId, "rendered"],
    queryFn: () => fetchRenderedEmail(emailId),
    enabled: canEdit,
  });

  if (!canEdit) {
    return (
      <div className={styles.page}>
        <Stack align="center" justify="center" h="100dvh">
          <Alert color="red" title="Admin access required">
            You do not have permission to edit email fields.
          </Alert>
          <Button component="a" href="/" variant="light">
            Back to board
          </Button>
        </Stack>
      </div>
    );
  }

  if (emailQuery.isLoading || renderedQuery.isLoading) {
    return (
      <div className={styles.page}>
        <Stack align="center" justify="center" h="100dvh">
          <Loader />
          <Text c="dimmed">Loading editor</Text>
        </Stack>
      </div>
    );
  }

  if (emailQuery.isError || renderedQuery.isError || !emailQuery.data) {
    return (
      <div className={styles.page}>
        <Stack align="center" justify="center" h="100dvh">
          <Alert color="red" title="Failed to load editor">
            The email may be archived or unavailable.
          </Alert>
          <Button component="a" href="/" variant="light">
            Back to board
          </Button>
        </Stack>
      </div>
    );
  }

  return (
    <EmailFieldsEditor
      email={emailQuery.data}
      initialRenderedHTML={renderedQuery.data?.html ?? ""}
    />
  );
}

function EmailFieldsEditor({
  email,
  initialRenderedHTML,
}: {
  email: EmailDetail;
  initialRenderedHTML: string;
}) {
  const queryClient = useQueryClient();
  const initialState = useMemo(() => buildInitialFormState(email), [email]);
  const [savedState, setSavedState] = useState(initialState);
  const [formState, setFormState] = useState(initialState);
  const [renderedHTML, setRenderedHTML] = useState(initialRenderedHTML);
  const [saveError, setSaveError] = useState(false);
  const fieldGroups = useMemo(
    () => buildFieldGroups(formState.editableFields),
    [formState.editableFields]
  );
  const isDirty = serializeFormState(formState) !== serializeFormState(savedState);
  const saveMutation = useMutation({
    mutationFn: (payload: UpdateEditableFieldsPayload) =>
      updateEmailEditableFields(email.id, payload),
    onSuccess: async () => {
      setSaveError(false);
      setSavedState(formState);
      const rendered = await queryClient.fetchQuery({
        queryKey: ["emails", email.id, "rendered"],
        queryFn: () => fetchRenderedEmail(email.id),
      });
      setRenderedHTML(rendered.html);
      void queryClient.invalidateQueries({ queryKey: ["emails"] });
      void queryClient.invalidateQueries({ queryKey: ["emails", email.id] });
      notifications.show({
        color: "green",
        message: "Email fields were saved and preview was refreshed.",
        title: "Saved",
      });
    },
    onError: () => {
      setSaveError(true);
    },
  });

  const save = () => {
    setSaveError(false);
    saveMutation.mutate({
      title: formState.title,
      subject: formState.subject,
      preheader: formState.preheader,
      editable_fields: formState.editableFields,
    });
  };

  const editorPanel = (
    <EditorFieldsPanel
      fieldGroups={fieldGroups}
      formState={formState}
      isSaving={saveMutation.isPending}
      saveError={saveError}
      onChangeField={(key, field) =>
        setFormState((current) => ({
          ...current,
          editableFields: {
            ...current.editableFields,
            [key]: field,
          },
        }))
      }
      onChangeMetadata={(key, value) =>
        setFormState((current) => ({
          ...current,
          [key]: value,
        }))
      }
    />
  );
  const previewPanel = <RenderedPreview html={renderedHTML} title={email.title} />;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Group gap="sm" wrap="nowrap" className={styles.titleBlock}>
            <Button
              component="a"
              href="/"
              leftSection={<ArrowLeft aria-hidden="true" size={16} />}
              size="xs"
              variant="subtle"
            >
              Board
            </Button>
            <Stack gap={2} className={styles.titleBlock}>
              <Group gap="xs" wrap="nowrap">
                <Title className={styles.title} lineClamp={1} order={4}>
                  {email.title}
                </Title>
                <Badge variant="light">{email.language.toUpperCase()}</Badge>
                <Badge variant="light">{email.variant}</Badge>
                {isDirty ? (
                  <Badge color="yellow" variant="light">
                    Unsaved
                  </Badge>
                ) : null}
              </Group>
              <Text c="dimmed" lineClamp={1} size="xs">
                {email.subject ?? "No subject"}
              </Text>
            </Stack>
          </Group>
          <Button
            disabled={!isDirty}
            leftSection={<Save aria-hidden="true" size={16} />}
            loading={saveMutation.isPending}
            onClick={save}
          >
            Save
          </Button>
          <Button
            disabled={isDirty || saveMutation.isPending}
            leftSection={<Copy aria-hidden="true" size={16} />}
            variant="light"
            onClick={() => void copyRenderedHTML(renderedHTML)}
          >
            Copy HTML
          </Button>
          <Button
            disabled={isDirty || saveMutation.isPending}
            leftSection={<Download aria-hidden="true" size={16} />}
            variant="light"
            onClick={() => downloadRenderedHTML(email, renderedHTML)}
          >
            Download
          </Button>
        </div>
      </header>

      <main className={styles.content}>
        <section className={styles.editorPanel}>{editorPanel}</section>
        <section className={styles.previewPanel}>{previewPanel}</section>
      </main>

      <main className={styles.mobileTabs}>
        <Tabs defaultValue="fields">
          <Tabs.List grow>
            <Tabs.Tab value="fields">Fields</Tabs.Tab>
            <Tabs.Tab value="preview">Preview</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="fields" pt="md">
            <section className={styles.editorPanel}>{editorPanel}</section>
          </Tabs.Panel>
          <Tabs.Panel value="preview" pt="md">
            <section className={styles.previewPanel}>{previewPanel}</section>
          </Tabs.Panel>
        </Tabs>
      </main>
    </div>
  );
}

function EditorFieldsPanel({
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

function RenderedPreview({ html, title }: { html: string; title: string }) {
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

function buildInitialFormState(email: EmailDetail): EditorFormState {
  return {
    title: email.title,
    subject: email.subject ?? "",
    preheader: email.preheader ?? "",
    editableFields: normalizeEditableFields(email.editable_fields),
  };
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

function buildFieldGroups(fields: EditableFields): FieldGroup[] {
  const groups = new Map<string, [string, EditableField][]>();

  Object.entries(fields)
    .sort(([firstKey], [secondKey]) => firstKey.localeCompare(secondKey))
    .forEach(([key, field]) => {
      const groupKey = getFieldGroupKey(key);
      groups.set(groupKey, [...(groups.get(groupKey) ?? []), [key, field]]);
    });

  return Array.from(groups.entries()).map(([key, groupFields]) => ({
    key,
    fields: groupFields,
  }));
}

function getFieldGroupKey(key: string) {
  for (const suffix of ["_width_px", "_text", "_url", "_src", "_alt"]) {
    if (key.endsWith(suffix)) {
      return key.slice(0, -suffix.length);
    }
  }

  return key;
}

function getFieldSuffixLabel(key: string) {
  for (const suffix of ["_width_px", "_text", "_url", "_src", "_alt"]) {
    if (key.endsWith(suffix)) {
      return suffix.slice(1);
    }
  }

  return key;
}

function formatFieldLabel(value: string) {
  return value
    .split(/[_-]/)
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

function shouldUseTextarea(field: EditableField, value: string) {
  return field.type === "text" && (value.includes("\n") || value.length > 100);
}

function serializeFormState(state: EditorFormState) {
  return JSON.stringify(state);
}
