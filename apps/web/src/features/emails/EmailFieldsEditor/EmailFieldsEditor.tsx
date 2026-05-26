import { useMemo, useState } from "react";
import {
  Alert,
  Button,
  Loader,
  Stack,
  Tabs,
  Text,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";

import {
  fetchEmails,
  fetchEmailDetail,
  fetchRenderedEmail,
  updateEmailEditableFields,
} from "../api";
import type {
  AuthUser,
  EmailDetail,
  EmailVariant,
  UpdateEditableFieldsPayload,
} from "../types";
import {
  buildStageColumns,
  formatStageName,
  getAvailableAdaptations,
  getAvailableVariants,
  getSelectedAdaptation,
  getSelectedVariant,
  getVersionForVariant,
  getVersionsForVariantAndAdaptation,
} from "../stages";
import {
  buildFieldGroups,
  buildInitialFormState,
  findNeighborEmail,
  serializeFormState,
} from "./EmailFieldsEditor.helpers";
import { EmailFieldsEditorHeader } from "./EmailFieldsEditorHeader";
import {
  EditorFieldsPanel,
  HTMLTemplatePanel,
  RenderedPreview,
} from "./EmailFieldsEditorPanels";
import styles from "./EmailFieldsEditor.module.css";

type EmailFieldsEditorProps = {
  currentUserRole: AuthUser["role"];
  emailId: string;
};

export function EmailFieldsEditor({
  currentUserRole,
  emailId,
}: EmailFieldsEditorProps) {
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
    <EmailFieldsEditorForm
      currentUserRole={currentUserRole}
      email={emailQuery.data}
      key={emailQuery.data.id}
      initialRenderedHTML={renderedQuery.data?.html ?? ""}
    />
  );
}

export default EmailFieldsEditor;

function EmailFieldsEditorForm({
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
      <EmailFieldsEditorHeader
        adaptations={availableAdaptations}
        availableVariants={availableVariants}
        currentStageTitle={currentStage?.title ?? formatStageName(email.stage ?? "")}
        email={email}
        isDirty={isDirty}
        isSaving={saveMutation.isPending}
        languageVersions={languageVersions}
        nextBoardEmail={nextBoardEmail}
        previousBoardEmail={previousBoardEmail}
        renderedHTML={renderedHTML}
        selectedAdaptation={selectedAdaptation}
        selectedVariant={selectedVariant}
        onAdaptationSelect={handleAdaptationSelect}
        onNavigateToEdit={navigateToEdit}
        onSave={save}
        onVariantSelect={handleVariantSelect}
      />

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
