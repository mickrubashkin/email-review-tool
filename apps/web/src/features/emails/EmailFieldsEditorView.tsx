import { useMemo, useState } from "react";
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  NumberInput,
  Select,
  Stack,
  Tabs,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  Copy,
  DownloadSimple,
  FloppyDisk,
  HouseIcon,
} from "@phosphor-icons/react";

import {
  fetchEmails,
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
  EmailListItem,
  EmailVariant,
  EmailVersionGroup,
  UpdateEditableFieldsPayload,
} from "./types";
import {
  buildStageColumns,
  formatStageName,
  getAvailableAdaptations,
  getAvailableVariants,
  getSelectedAdaptation,
  getSelectedVariant,
  getVersionForVariant,
  getVersionsForVariantAndAdaptation,
} from "./stages";
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
  originalHTML: string;
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
          <Button component={Link} to="/" variant="light">
            Home
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
          <Button component={Link} to="/" variant="light">
            Home
          </Button>
        </Stack>
      </div>
    );
  }

  return (
    <EmailFieldsEditor
      currentUserRole={currentUserRole}
      email={emailQuery.data}
      initialRenderedHTML={renderedQuery.data?.html ?? ""}
    />
  );
}

function EmailFieldsEditor({
  currentUserRole,
  email,
  initialRenderedHTML,
}: {
  currentUserRole: AuthUser["role"];
  email: EmailDetail;
  initialRenderedHTML: string;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canEditHTML = currentUserRole === "super_admin";
  const initialState = useMemo(() => buildInitialFormState(email), [email]);
  const [savedState, setSavedState] = useState(initialState);
  const [formState, setFormState] = useState(initialState);
  const [renderedHTML, setRenderedHTML] = useState(initialRenderedHTML);
  const [saveError, setSaveError] = useState(false);
  const fieldGroups = useMemo(
    () => buildFieldGroups(formState.editableFields),
    [formState.editableFields]
  );
  const emailsQuery = useQuery({
    queryKey: ["emails", email.sequence],
    queryFn: () => fetchEmails(email.sequence),
  });
  const stageColumns = useMemo(
    () => buildStageColumns(emailsQuery.data ?? []),
    [emailsQuery.data]
  );
  const emailGroup = useMemo(() => {
    return stageColumns
      .flatMap((column) => column.emailGroups)
      .find((group) => group.versions.some((version) => version.id === email.id));
  }, [email.id, stageColumns]);
  const selectedVariant = emailGroup
    ? getSelectedVariant(emailGroup.versions, email.id)
    : email.variant;
  const selectedAdaptation = emailGroup
    ? getSelectedAdaptation(emailGroup.versions, email.id)
    : email.adaptation_key;
  const selectedVariantVersions = emailGroup
    ? getVersionsForVariantAndAdaptation(
        emailGroup.versions,
        selectedVariant,
        selectedAdaptation
      )
    : [];
  const languageVersions =
    selectedVariantVersions.length > 0
      ? selectedVariantVersions
      : [{ id: email.id, language: email.language }];
  const availableVariants = emailGroup
    ? getAvailableVariants(emailGroup.versions)
    : [email.variant as EmailVariant];
  const availableAdaptations = emailGroup
    ? getAvailableAdaptations(emailGroup.versions, selectedVariant)
    : [email];
  const boardEmailGroups = useMemo(
    () => stageColumns.flatMap((column) => column.emailGroups),
    [stageColumns]
  );
  const currentBoardGroupIndex = emailGroup
    ? boardEmailGroups.findIndex((group) => group.key === emailGroup.key)
    : -1;
  const previousBoardEmail = findNeighborEmail(
    [...boardEmailGroups.slice(0, Math.max(currentBoardGroupIndex, 0))].reverse(),
    selectedVariant,
    email.language,
    selectedAdaptation
  );
  const nextBoardEmail = findNeighborEmail(
    boardEmailGroups.slice(currentBoardGroupIndex + 1),
    selectedVariant,
    email.language,
    selectedAdaptation
  );
  const currentStage = stageColumns.find((column) =>
    column.emailGroups.some((group) => group.key === emailGroup?.key)
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
      void queryClient.invalidateQueries({ queryKey: ["email-comments", email.id] });
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
      ...(canEditHTML ? { original_html: formState.originalHTML } : {}),
    });
  };
  const navigateToEdit = (nextEmailId: string) => {
    navigate(`/emails/${encodeURIComponent(nextEmailId)}/edit`);
  };
  const handleVariantSelect = (variant: EmailVariant) => {
    if (!emailGroup) {
      return;
    }

    const nextEmail = getVersionForVariant(
      emailGroup.versions,
      variant,
      email.language,
      selectedAdaptation
    );
    if (nextEmail) {
      navigateToEdit(nextEmail.id);
    }
  };
  const handleAdaptationSelect = (adaptationKey: string) => {
    if (!emailGroup) {
      return;
    }

    const nextEmail = getVersionForVariant(
      emailGroup.versions,
      selectedVariant,
      email.language,
      adaptationKey
    );
    if (nextEmail) {
      navigateToEdit(nextEmail.id);
    }
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
  const htmlPanel = canEditHTML ? (
    <HTMLTemplatePanel
      isSaving={saveMutation.isPending}
      originalHTML={formState.originalHTML}
      onChange={(originalHTML) =>
        setFormState((current) => ({
          ...current,
          originalHTML,
        }))
      }
    />
  ) : null;
  const previewPanel = <RenderedPreview html={renderedHTML} title={email.title} />;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Group className={styles.headerMain} gap="sm" wrap="nowrap">
            <Tooltip label="Back to board">
              <ActionIcon
                aria-label="Back to board"
                component={Link}
                to="/"
                radius="md"
                size="lg"
                variant="subtle"
              >
                <HouseIcon aria-hidden="true" size={18} />
              </ActionIcon>
            </Tooltip>

            <Group gap={4} wrap="nowrap">
              <Tooltip label="Previous email on board">
                <ActionIcon
                  aria-label="Previous email on board"
                  disabled={!previousBoardEmail}
                  onClick={() => {
                    if (previousBoardEmail) {
                      navigateToEdit(previousBoardEmail.id);
                    }
                  }}
                  radius="md"
                  size="lg"
                  variant="subtle"
                >
                  <ArrowLeftIcon aria-hidden="true" size={17} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Next email on board">
                <ActionIcon
                  aria-label="Next email on board"
                  disabled={!nextBoardEmail}
                  onClick={() => {
                    if (nextBoardEmail) {
                      navigateToEdit(nextBoardEmail.id);
                    }
                  }}
                  radius="md"
                  size="lg"
                  variant="subtle"
                >
                  <ArrowRightIcon aria-hidden="true" size={17} />
                </ActionIcon>
              </Tooltip>
            </Group>

            <Group className={styles.breadcrumbs} gap={6} wrap="nowrap">
              <Text className={styles.breadcrumbText} size="sm" fw={700}>
                {currentStage?.title ?? formatStageName(email.stage ?? "")}
              </Text>
              <Text c="dimmed" size="sm">
                /
              </Text>
              <Title className={styles.title} lineClamp={1} order={4}>
                {formatEmailTitle(email.title)}
              </Title>
              {isDirty ? (
                <Badge color="yellow" variant="light">
                  Unsaved
                </Badge>
              ) : null}
            </Group>

            <div className={styles.actionDivider} aria-hidden="true" />

            <Group className={styles.versionControls} gap="xs" wrap="nowrap">
              <LanguageSelect
                selectedEmailId={email.id}
                versions={languageVersions}
                onSelect={navigateToEdit}
              />
              <VariantSwitch
                availableVariants={availableVariants}
                selectedVariant={selectedVariant}
                onSelect={handleVariantSelect}
              />
              <AdaptationSelect
                adaptations={availableAdaptations}
                selectedAdaptation={selectedAdaptation}
                onSelect={handleAdaptationSelect}
              />
            </Group>
          </Group>

          <Group className={styles.headerActions} gap="xs" wrap="nowrap">
            <Button
              disabled={!isDirty}
              leftSection={<FloppyDisk aria-hidden="true" size={16} />}
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
              leftSection={<DownloadSimple aria-hidden="true" size={16} />}
              variant="light"
              onClick={() => downloadRenderedHTML(email, renderedHTML)}
            >
              Download
            </Button>
          </Group>
        </div>
      </header>

      <main className={styles.content}>
        <section className={styles.editorPanel}>
          {canEditHTML ? (
            <Tabs defaultValue="fields">
              <Tabs.List grow>
                <Tabs.Tab value="fields">Fields</Tabs.Tab>
                <Tabs.Tab value="html">HTML</Tabs.Tab>
              </Tabs.List>
              <Tabs.Panel value="fields">{editorPanel}</Tabs.Panel>
              <Tabs.Panel value="html">{htmlPanel}</Tabs.Panel>
            </Tabs>
          ) : (
            editorPanel
          )}
        </section>
        <section className={styles.previewPanel}>{previewPanel}</section>
      </main>

      <main className={styles.mobileTabs}>
        <Tabs defaultValue="fields">
          <Tabs.List grow>
            <Tabs.Tab value="fields">Fields</Tabs.Tab>
            {canEditHTML ? <Tabs.Tab value="html">HTML</Tabs.Tab> : null}
            <Tabs.Tab value="preview">Preview</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="fields" pt="md">
            <section className={styles.editorPanel}>{editorPanel}</section>
          </Tabs.Panel>
          {canEditHTML ? (
            <Tabs.Panel value="html" pt="md">
              <section className={styles.editorPanel}>{htmlPanel}</section>
            </Tabs.Panel>
          ) : null}
          <Tabs.Panel value="preview" pt="md">
            <section className={styles.previewPanel}>{previewPanel}</section>
          </Tabs.Panel>
        </Tabs>
      </main>
    </div>
  );
}

function HTMLTemplatePanel({
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

function LanguageSelect({
  onSelect,
  selectedEmailId,
  versions,
}: {
  onSelect: (emailId: string) => void;
  selectedEmailId: string;
  versions: Array<Pick<EmailListItem, "id" | "language">>;
}) {
  return (
    <Select
      allowDeselect={false}
      className={styles.languageSelect}
      data={versions.map((version) => ({
        label: version.language.toUpperCase(),
        value: version.id,
      }))}
      value={selectedEmailId}
      onChange={(value: string | null) => {
        if (value && value !== selectedEmailId) {
          onSelect(value);
        }
      }}
    />
  );
}

function VariantSwitch({
  availableVariants,
  onSelect,
  selectedVariant,
}: {
  availableVariants: EmailVariant[];
  onSelect: (variant: EmailVariant) => void;
  selectedVariant: EmailVariant;
}) {
  if (availableVariants.length <= 1) {
    return (
      <Button className={styles.versionButton} disabled variant="light">
        {formatVariantOptionLabel(selectedVariant, availableVariants)}
      </Button>
    );
  }

  return (
    <Group className={styles.segmentedControl} gap={0} wrap="nowrap">
      {availableVariants.map((variant) => (
        <button
          className={styles.segmentedButton}
          data-active={variant === selectedVariant || undefined}
          key={variant}
          type="button"
          onClick={() => {
            if (variant !== selectedVariant) {
              onSelect(variant);
            }
          }}
        >
          {formatVariantOptionLabel(variant, availableVariants)}
        </button>
      ))}
    </Group>
  );
}

function AdaptationSelect({
  adaptations,
  onSelect,
  selectedAdaptation,
}: {
  adaptations: Array<Pick<EmailListItem, "adaptation_key" | "adaptation_label">>;
  onSelect: (adaptationKey: string) => void;
  selectedAdaptation: string;
}) {
  return (
    <Select
      allowDeselect={false}
      className={styles.adaptationSelect}
      data={adaptations.map((adaptation) => ({
        label: adaptation.adaptation_label,
        value: adaptation.adaptation_key,
      }))}
      value={selectedAdaptation}
      onChange={(value: string | null) => {
        if (value && value !== selectedAdaptation) {
          onSelect(value);
        }
      }}
    />
  );
}

function findNeighborEmail(
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

function formatVariantOptionLabel(
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

function formatEmailTitle(title: string) {
  switch (title) {
    case "Follow Up 1":
      return "First Follow-up";
    case "Follow Up 2":
      return "Second Follow-up";
    default:
      return title;
  }
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
    originalHTML: email.original_html,
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
