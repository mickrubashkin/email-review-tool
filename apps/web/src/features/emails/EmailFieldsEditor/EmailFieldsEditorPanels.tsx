import {
  Alert,
  Group,
  NumberInput,
  Stack,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";

import type { EditableField } from "../types";

import {
  formatFieldLabel,
  getFieldSuffixLabel,
  shouldUseTextarea,
} from "./EmailFieldsEditor.helpers";
import type { EditorFormState, FieldGroup } from "./EmailFieldsEditor.types";
import styles from "./EmailFieldsEditor.module.css";

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
