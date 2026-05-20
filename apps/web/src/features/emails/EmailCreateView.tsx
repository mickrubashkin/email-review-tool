import { useEffect, useMemo, useState } from "react";
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

import { createEmail, fetchBoards, fetchEmails, inspectEmailHTML } from "./api";
import type { AuthUser, CreateEmailPayload, EmailVariant } from "./types";
import styles from "./EmailFieldsEditorView.module.css";

type EmailCreateViewProps = {
  currentUserRole: AuthUser["role"];
};

type CreateEmailFormState = {
  sequence: string;
  eventGroupKey: string;
  title: string;
  subject: string;
  preheader: string;
  sendTiming: string;
  stage: string;
  sortOrder: number;
  language: string;
  variant: EmailVariant;
  adaptationLabel: string;
  originalHTML: string;
};

const newEventGroupValue = "__new_event__";

const initialFormState: CreateEmailFormState = {
  sequence: "onboarding",
  eventGroupKey: newEventGroupValue,
  title: "",
  subject: "",
  preheader: "",
  sendTiming: "",
  stage: "",
  sortOrder: 0,
  language: "en",
  variant: "v1",
  adaptationLabel: "Default",
  originalHTML: "",
};

export function EmailCreateView({ currentUserRole }: EmailCreateViewProps) {
  const canCreate =
    currentUserRole === "admin" || currentUserRole === "super_admin";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [formState, setFormState] = useState<CreateEmailFormState>(initialFormState);
  const [createError, setCreateError] = useState<string | null>(null);
  const [debouncedHTML, setDebouncedHTML] = useState("");
  const [sortOrderAuto, setSortOrderAuto] = useState(true);
  const emailsQuery = useQuery({
    queryKey: ["emails"],
    queryFn: () => fetchEmails(),
    enabled: canCreate,
  });
  const boardsQuery = useQuery({
    queryKey: ["boards"],
    queryFn: fetchBoards,
    enabled: canCreate,
  });
  const htmlInspectionQuery = useQuery({
    queryKey: ["email-html-inspection", debouncedHTML],
    queryFn: () => inspectEmailHTML(debouncedHTML),
    enabled: canCreate && debouncedHTML.trim().length > 0,
    retry: false,
    staleTime: 30_000,
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
  const boards = useMemo(() => boardsQuery.data ?? [], [boardsQuery.data]);
  const boardOptions = useMemo(
    () => boards.map((board) => ({ label: board.name, value: board.key })),
    [boards]
  );
  const boardKeys = useMemo(() => boards.map((board) => board.key), [boards]);
  const selectedBoard = boardKeys.includes(formState.sequence)
    ? formState.sequence
    : boards.find((board) => board.key === "onboarding")?.key ?? boardKeys[0] ?? "";
  const activeBoard = boards.find((board) => board.key === selectedBoard);
  const stageOptions = activeBoard?.stages ?? [];
  const selectedStage = stageOptions.includes(formState.stage)
    ? formState.stage
    : stageOptions[0] ?? "";
  const suggestedSortOrder = getNextSortOrder(
    emails,
    selectedBoard,
    selectedStage
  );
  const selectedSortOrder = sortOrderAuto
    ? suggestedSortOrder
    : formState.sortOrder;
  const languageOptions = useMemo(
    () => uniqueSorted(emails.map((email) => email.language)),
    [emails]
  );
  const variantOptions = useMemo(
    () => uniqueSorted(emails.map((email) => email.variant)),
    [emails]
  );
  const adaptationOptions = useMemo(
    () => uniqueSorted(["Default", ...emails.map((email) => email.adaptation_label)]),
    [emails]
  );
  const eventGroupOptions = useMemo(
    () => buildEventGroupOptions(emails, selectedBoard, selectedStage),
    [emails, selectedBoard, selectedStage]
  );
  const eventSelectOptions = useMemo(
    () => [
      { label: "Create new event", value: newEventGroupValue },
      ...eventGroupOptions,
    ],
    [eventGroupOptions]
  );
  const selectedEventGroup = eventGroupOptions.find(
    (option) => option.value === formState.eventGroupKey
  );
  useEffect(() => {
    const timeoutID = window.setTimeout(() => {
      setDebouncedHTML(formState.originalHTML.trim());
    }, 500);

    return () => window.clearTimeout(timeoutID);
  }, [formState.originalHTML]);

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
  const trimmedStage = selectedStage.trim();
  const trimmedHTML = formState.originalHTML.trim();
  const htmlInspection = htmlInspectionQuery.data;
  const htmlInspectionWarnings = htmlInspection?.warnings ?? [];
  const previewHTML = htmlInspection?.review_html ?? trimmedHTML;
  const canSubmit =
    trimmedTitle.length > 0 &&
    selectedBoard.length > 0 &&
    trimmedStage.length > 0 &&
    stageOptions.length > 0 &&
    formState.language.trim().length > 0 &&
    formState.variant.trim().length > 0 &&
    formState.adaptationLabel.trim().length > 0 &&
    trimmedHTML.length > 0 &&
    !createMutation.isPending;
  const submit = () => {
    if (!canSubmit) {
      return;
    }

    createMutation.mutate({
      language: formState.language.trim() || "en",
      adaptation_label: formState.adaptationLabel.trim() || "Default",
      original_html: trimmedHTML,
      preheader: optionalString(formState.preheader),
      send_timing: optionalString(formState.sendTiming),
      sequence: selectedBoard,
      sort_order: selectedSortOrder,
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
    const nextStageOptions =
      boards.find((board) => board.key === nextBoard)?.stages ?? [];
    const nextStage = nextStageOptions.includes(formState.stage)
      ? formState.stage
      : nextStageOptions[0] ?? "";

    setFormState((current) => ({
      ...current,
      sequence: nextBoard,
      stage: nextStage,
      eventGroupKey: newEventGroupValue,
    }));
    setSortOrderAuto(true);
  };
  const handleStageChange = (value: string | null) => {
    const nextStage = value ?? "";
    setFormState((current) => ({
      ...current,
      stage: nextStage,
      eventGroupKey: newEventGroupValue,
    }));
    setSortOrderAuto(true);
  };
  const handleEventGroupChange = (value: string | null) => {
    if (!value || value === newEventGroupValue) {
      setFormState((current) => ({
        ...current,
        eventGroupKey: newEventGroupValue,
      }));
      setSortOrderAuto(true);
      return;
    }

    const nextGroup = eventGroupOptions.find((option) => option.value === value);
    if (!nextGroup) {
      setFormState((current) => ({
        ...current,
        eventGroupKey: newEventGroupValue,
      }));
      setSortOrderAuto(true);
      return;
    }

    setFormState((current) => ({
      ...current,
      eventGroupKey: nextGroup.value,
      title: nextGroup.title,
      sendTiming: nextGroup.sendTiming ?? current.sendTiming,
      sortOrder: nextGroup.sortOrder,
      adaptationLabel: nextGroup.adaptationLabel,
    }));
    setSortOrderAuto(false);
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
          disabled={boardsQuery.isLoading}
          label="Board"
          placeholder={boardsQuery.isLoading ? "Loading boards" : "Select board"}
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
          value={selectedStage}
          onChange={handleStageChange}
        />
      </Group>
      {selectedBoard && stageOptions.length === 0 ? (
        <Alert color="yellow" title="No stages">
          This board has no stages yet, so a new email cannot be placed on it.
        </Alert>
      ) : null}

      <Select
        allowDeselect={false}
        data={eventSelectOptions}
        description={
          selectedEventGroup
            ? "New language/version will be placed into this existing card."
            : "A separate event card will be created in this stage."
        }
        disabled={!selectedBoard || !selectedStage}
        label="Event"
        placeholder="Choose event"
        value={formState.eventGroupKey || newEventGroupValue}
        onChange={handleEventGroupChange}
      />

      <TextInput
        label="Title"
        required
        value={formState.title}
        onChange={(event) => {
          updateField("title", event.currentTarget.value);
          if (formState.eventGroupKey !== newEventGroupValue) {
            updateField("eventGroupKey", newEventGroupValue);
          }
        }}
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
          label="Version"
          placeholder="v1"
          value={formState.variant}
          onChange={(value) => updateField("variant", value)}
        />
        <Autocomplete
          data={adaptationOptions}
          label="Adaptation"
          placeholder="Default"
          value={formState.adaptationLabel}
          onChange={(value) => updateField("adaptationLabel", value)}
        />
      </Group>

      <Group grow>
        <NumberInput
          description={
            sortOrderAuto
              ? "Suggested from selected board/stage."
              : "Manual order."
          }
          label="Sort order"
          value={selectedSortOrder}
          onChange={(value) => {
            setSortOrderAuto(false);
            updateField("sortOrder", typeof value === "number" ? value : 0);
          }}
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
      {trimmedHTML ? (
        <Alert
          color={
            htmlInspectionQuery.isError || htmlInspectionWarnings.length > 0
              ? "yellow"
              : "green"
          }
          title="Backend HTML inspection"
        >
          <Stack gap={6}>
            {htmlInspectionQuery.isPending ? (
              <Text size="sm">Inspecting HTML...</Text>
            ) : htmlInspectionQuery.isError ? (
              <Text size="sm">
                HTML could not be inspected. Check the markup and editable field
                markers.
              </Text>
            ) : htmlInspection ? (
              <>
                <Group gap={6} wrap="wrap">
                  <Badge
                    color={htmlInspection.review_block_count > 0 ? "green" : "yellow"}
                    variant="light"
                  >
                    {htmlInspection.review_block_count} review blocks
                  </Badge>
                  <Badge
                    color={htmlInspection.editable_field_count > 0 ? "green" : "yellow"}
                    variant="light"
                  >
                    {htmlInspection.editable_field_count} editable fields
                  </Badge>
                  {htmlInspection.original_review_block_count === 0 ? (
                    <Badge color="blue" variant="light">
                      generated review blocks
                    </Badge>
                  ) : null}
                </Group>
                {htmlInspectionWarnings.length > 0 ? (
                  <Stack gap={2}>
                    {htmlInspectionWarnings.map((warning) => (
                      <Text key={warning} size="sm">
                        {warning}
                      </Text>
                    ))}
                  </Stack>
                ) : (
                  <Text size="sm">Review and editable markers look usable.</Text>
                )}
                {htmlInspection.editable_fields.length > 0 ? (
                  <Group gap={6} wrap="wrap">
                    {htmlInspection.editable_fields.slice(0, 8).map((field) => (
                      <Badge key={field.key} color="gray" variant="light">
                        {field.key}: {field.type}
                      </Badge>
                    ))}
                    {htmlInspection.editable_fields.length > 8 ? (
                      <Badge color="gray" variant="light">
                        +{htmlInspection.editable_fields.length - 8} more
                      </Badge>
                    ) : null}
                  </Group>
                ) : null}
              </>
            ) : null}
          </Stack>
        </Alert>
      ) : null}

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
        <Group gap={6}>
          <Badge variant="light">{formState.language.toUpperCase() || "EN"}</Badge>
          <Badge variant="light">{formState.variant || "v1"}</Badge>
          <Badge variant="light">{formState.adaptationLabel || "Default"}</Badge>
        </Group>
      </Group>
      <div className={styles.previewFrameWrap}>
        {trimmedHTML ? (
          <iframe
            className={styles.previewFrame}
            sandbox="allow-same-origin"
            srcDoc={previewHTML}
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

function getNextSortOrder(
  emails: Array<{ sequence: string; stage: string | null; sort_order: number }>,
  sequence: string,
  stage: string
) {
  const matchingSortOrders = emails
    .filter((email) => email.sequence === sequence && (email.stage ?? "") === stage)
    .map((email) => email.sort_order);

  if (matchingSortOrders.length === 0) {
    return 0;
  }

  return Math.max(...matchingSortOrders) + 1;
}

type EventGroupOption = {
  value: string;
  label: string;
  title: string;
  sortOrder: number;
  sendTiming: string | null;
  adaptationLabel: string;
};

function buildEventGroupOptions(
  emails: Array<{
    sequence: string;
    stage: string | null;
    sort_order: number;
    title: string;
    language: string;
    variant: string;
    adaptation_label: string;
    send_timing: string | null;
  }>,
  sequence: string,
  stage: string
): EventGroupOption[] {
  const groups = new Map<string, {
    title: string;
    sortOrder: number;
    sendTiming: string | null;
    adaptationLabel: string;
    languages: Set<string>;
  }>();

  for (const email of emails) {
    if (email.sequence !== sequence || (email.stage ?? "") !== stage) {
      continue;
    }

    const key = [email.sequence, stage, email.sort_order].join("/");
    const group = groups.get(key) ?? {
      title: email.title,
      sortOrder: email.sort_order,
      sendTiming: email.send_timing,
      adaptationLabel: email.adaptation_label,
      languages: new Set<string>(),
    };
    group.languages.add(email.language);
    groups.set(key, group);
  }

  return [...groups.entries()]
    .sort(([, first], [, second]) => first.sortOrder - second.sortOrder)
    .map(([value, group]) => ({
      value,
      label: `${group.title} (${[...group.languages].sort().join(", ")})`,
      title: group.title,
      sortOrder: group.sortOrder,
      sendTiming: group.sendTiming,
      adaptationLabel: group.adaptationLabel,
    }));
}
