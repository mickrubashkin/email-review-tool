import { useMemo, useState } from "react";
import {
  Alert,
  Autocomplete,
  Badge,
  Button,
  FileButton,
  Group,
  NumberInput,
  Select,
  Stack,
  Tabs,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import {
  HouseIcon,
  PlusIcon,
  UploadSimpleIcon,
} from "@phosphor-icons/react";

import { createEmail, fetchEmails } from "./api";
import type { AuthUser, CreateEmailPayload, EmailVariant } from "./types";
import styles from "./EmailFieldsEditorView.module.css";

type EmailCreateViewProps = {
  currentUserRole: AuthUser["role"];
};

type CreateEmailFormState = {
  sequence: string;
  title: string;
  subject: string;
  preheader: string;
  sendTiming: string;
  stage: string;
  sortOrder: number;
  language: string;
  variant: EmailVariant;
  originalHTML: string;
};

const initialFormState: CreateEmailFormState = {
  sequence: "onboarding",
  title: "",
  subject: "",
  preheader: "",
  sendTiming: "",
  stage: "",
  sortOrder: 0,
  language: "en",
  variant: "new",
  originalHTML: "",
};

export function EmailCreateView({ currentUserRole }: EmailCreateViewProps) {
  const canCreate =
    currentUserRole === "admin" || currentUserRole === "super_admin";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [formState, setFormState] = useState<CreateEmailFormState>(initialFormState);
  const [createError, setCreateError] = useState<string | null>(null);
  const emailsQuery = useQuery({
    queryKey: ["emails"],
    queryFn: fetchEmails,
    enabled: canCreate,
  });
  const createMutation = useMutation({
    mutationFn: (payload: CreateEmailPayload) => createEmail(payload),
    onSuccess: (createdEmail) => {
      setCreateError(null);
      void queryClient.invalidateQueries({ queryKey: ["emails"] });
      queryClient.setQueryData(["emails", createdEmail.id, "review"], createdEmail);
      notifications.show({
        color: "green",
        message: "Email is ready for review.",
        title: "Email created",
      });
      navigate(`/emails/${encodeURIComponent(createdEmail.id)}/review`);
    },
    onError: (error) => {
      setCreateError(error instanceof Error ? error.message : "Create failed");
    },
  });

  const emails = useMemo(() => emailsQuery.data ?? [], [emailsQuery.data]);
  const boardOptions = useMemo(
    () =>
      uniqueSorted(
        emails
          .map((email) => email.sequence)
          .filter((sequence) => sequence.trim().length > 0)
      ),
    [emails]
  );
  const selectedBoard = boardOptions.includes(formState.sequence)
    ? formState.sequence
    : boardOptions[0] ?? "";
  const stageOptions = useMemo(
    () =>
      uniqueSorted(
        emails
          .filter((email) => email.sequence === selectedBoard)
          .map((email) => email.stage ?? "")
          .filter((stage) => stage.trim().length > 0)
      ),
    [emails, selectedBoard]
  );
  const languageOptions = useMemo(
    () => uniqueSorted(emails.map((email) => email.language)),
    [emails]
  );
  const variantOptions = useMemo(
    () => uniqueSorted(emails.map((email) => email.variant)),
    [emails]
  );

  if (!canCreate) {
    return (
      <div className={styles.page}>
        <Stack align="center" justify="center" h="100dvh">
          <Alert color="red" title="Admin access required">
            You do not have permission to create emails.
          </Alert>
          <Button component={Link} to="/" variant="light">
            Home
          </Button>
        </Stack>
      </div>
    );
  }

  const trimmedTitle = formState.title.trim();
  const trimmedStage = formState.stage.trim();
  const trimmedHTML = formState.originalHTML.trim();
  const canSubmit =
    trimmedTitle.length > 0 &&
    selectedBoard.length > 0 &&
    trimmedStage.length > 0 &&
    formState.language.trim().length > 0 &&
    formState.variant.trim().length > 0 &&
    trimmedHTML.length > 0 &&
    !createMutation.isPending;
  const submit = () => {
    if (!canSubmit) {
      return;
    }

    createMutation.mutate({
      language: formState.language.trim() || "en",
      original_html: trimmedHTML,
      preheader: optionalString(formState.preheader),
      send_timing: optionalString(formState.sendTiming),
      sequence: selectedBoard,
      sort_order: formState.sortOrder,
      stage: trimmedStage,
      subject: optionalString(formState.subject),
      title: trimmedTitle,
      variant: formState.variant,
    });
  };
  const updateField = <Key extends keyof CreateEmailFormState>(
    key: Key,
    value: CreateEmailFormState[Key]
  ) => {
    setFormState((current) => ({ ...current, [key]: value }));
  };
  const loadHTMLFile = async (file: File | null) => {
    if (!file) {
      return;
    }

    updateField("originalHTML", await file.text());
    if (!formState.title.trim()) {
      updateField("title", file.name.replace(/\.html?$/i, ""));
    }
  };
  const handleBoardChange = (value: string | null) => {
    const nextBoard = value ?? "";
    const nextStageOptions = uniqueSorted(
      emails
        .filter((email) => email.sequence === nextBoard)
        .map((email) => email.stage ?? "")
        .filter((stage) => stage.trim().length > 0)
    );

    setFormState((current) => ({
      ...current,
      sequence: nextBoard,
      stage: nextStageOptions.includes(current.stage)
        ? current.stage
        : nextStageOptions[0] ?? "",
    }));
  };

  const editorPanel = (
    <Stack className={styles.editorContent} gap="md">
      <Stack gap={4}>
        <Title order={4}>New email</Title>
        <Text c="dimmed" size="sm">
          Upload finished HTML or paste it below.
        </Text>
      </Stack>

      {createError ? (
        <Alert color="red" title="Failed to create email">
          {createError}
        </Alert>
      ) : null}

      <Group grow>
        <Select
          allowDeselect={false}
          data={boardOptions}
          disabled={emailsQuery.isLoading}
          label="Board"
          placeholder={emailsQuery.isLoading ? "Loading boards" : "Select board"}
          required
          value={selectedBoard || null}
          onChange={handleBoardChange}
        />
        <Select
          allowDeselect={false}
          data={stageOptions}
          disabled={!selectedBoard || stageOptions.length === 0}
          label="Stage"
          placeholder={selectedBoard ? "Select stage" : "Select a board first"}
          required
          value={formState.stage}
          onChange={(value) => updateField("stage", value ?? "")}
        />
      </Group>

      <TextInput
        label="Title"
        required
        value={formState.title}
        onChange={(event) => updateField("title", event.currentTarget.value)}
      />
      <TextInput
        label="Subject"
        value={formState.subject}
        onChange={(event) => updateField("subject", event.currentTarget.value)}
      />
      <Textarea
        autosize
        label="Preheader"
        minRows={2}
        value={formState.preheader}
        onChange={(event) => updateField("preheader", event.currentTarget.value)}
      />

      <Group grow>
        <TextInput
          label="Send timing"
          value={formState.sendTiming}
          onChange={(event) => updateField("sendTiming", event.currentTarget.value)}
        />
        <Autocomplete
          data={languageOptions}
          label="Language"
          placeholder="en"
          value={formState.language}
          onChange={(value) => updateField("language", value)}
        />
      </Group>

      <Group grow>
        <Autocomplete
          data={variantOptions}
          label="Variant"
          placeholder="new"
          value={formState.variant}
          onChange={(value) => updateField("variant", value)}
        />
        <NumberInput
          label="Sort order"
          value={formState.sortOrder}
          onChange={(value) =>
            updateField("sortOrder", typeof value === "number" ? value : 0)
          }
        />
      </Group>

      <Group justify="space-between" align="center">
        <Stack gap={2}>
          <Text fw={600} size="sm">
            HTML
          </Text>
          <Text c="dimmed" size="xs">
            Existing review/edit markers are preserved.
          </Text>
        </Stack>
        <FileButton accept=".html,text/html" onChange={(file) => void loadHTMLFile(file)}>
          {(props) => (
            <Button
              {...props}
              leftSection={<UploadSimpleIcon aria-hidden="true" size={16} />}
              size="xs"
              variant="light"
            >
              Upload HTML
            </Button>
          )}
        </FileButton>
      </Group>
      <Textarea
        autosize
        minRows={12}
        placeholder="<html>...</html>"
        value={formState.originalHTML}
        onChange={(event) => updateField("originalHTML", event.currentTarget.value)}
      />

      <Group justify="flex-end">
        <Button component={Link} to="/" variant="subtle">
          Cancel
        </Button>
        <Button
          disabled={!canSubmit}
          leftSection={<PlusIcon aria-hidden="true" size={16} />}
          loading={createMutation.isPending}
          onClick={submit}
        >
          Create email
        </Button>
      </Group>
    </Stack>
  );

  const previewPanel = (
    <>
      <Group className={styles.previewHeader} justify="space-between">
        <Stack gap={0}>
          <Text fw={600} size="sm">
            Preview
          </Text>
          <Text c="dimmed" size="xs">
            Raw uploaded HTML
          </Text>
        </Stack>
        <Badge variant="light">{formState.language.toUpperCase() || "EN"}</Badge>
      </Group>
      <div className={styles.previewFrameWrap}>
        {trimmedHTML ? (
          <iframe
            className={styles.previewFrame}
            sandbox="allow-same-origin"
            srcDoc={trimmedHTML}
            title="New email preview"
          />
        ) : (
          <Stack align="center" justify="center" h="100%">
            <Text c="dimmed" size="sm">
              Upload or paste HTML to preview it.
            </Text>
          </Stack>
        )}
      </div>
    </>
  );

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Group gap="sm" wrap="nowrap" className={styles.titleBlock}>
            <Button
              component={Link}
              to="/"
              leftSection={<HouseIcon aria-hidden="true" size={16} />}
              size="xs"
              variant="subtle"
            >
              Home
            </Button>
            <Stack gap={2} className={styles.titleBlock}>
              <Title className={styles.title} lineClamp={1} order={4}>
                Create email
              </Title>
              <Text c="dimmed" lineClamp={1} size="xs">
                Add a finished HTML email to the review board.
              </Text>
            </Stack>
          </Group>
        </div>
      </header>

      <main className={styles.content}>
        <section className={styles.editorPanel}>{editorPanel}</section>
        <section className={styles.previewPanel}>{previewPanel}</section>
      </main>

      <Tabs className={styles.mobileTabs} defaultValue="details">
        <Tabs.List grow>
          <Tabs.Tab value="details">Details</Tabs.Tab>
          <Tabs.Tab value="preview">Preview</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="details" pt="md">
          {editorPanel}
        </Tabs.Panel>
        <Tabs.Panel value="preview" pt="md">
          <section className={styles.previewPanel}>{previewPanel}</section>
        </Tabs.Panel>
      </Tabs>
    </div>
  );
}

function optionalString(value: string) {
  const trimmed = value.trim();
  return trimmed || undefined;
}

function uniqueSorted(values: string[]) {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean))
  ).sort((first, second) => first.localeCompare(second));
}
