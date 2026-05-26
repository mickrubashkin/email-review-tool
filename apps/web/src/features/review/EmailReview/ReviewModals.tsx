import {
  Alert,
  Button,
  Group,
  Modal,
  Stack,
  Text,
  Textarea,
  TextInput,
} from "@mantine/core";

import { type FormEvent, useState } from "react";

import { ApiError } from "../../emails/api";
import type { DuplicateEmailPayload, EmailDetail, EmailVariant } from "../../emails/types";

export function SourceHTMLModal({
  draft,
  isSubmitting,
  onChange,
  onClose,
  onSubmit,
  opened,
}: {
  draft: string;
  isSubmitting: boolean;
  onChange: (draft: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  opened: boolean;
}) {
  return (
    <Modal opened={opened} size="xl" title="Edit source HTML" onClose={onClose}>
      <Stack gap="sm">
        <Textarea
          autosize
          disabled={isSubmitting}
          minRows={18}
          value={draft}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
        <Group justify="flex-end" gap="xs">
          <Button disabled={isSubmitting} variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={isSubmitting} onClick={onSubmit}>
            Save HTML
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

export function ArchiveEmailModal({
  email,
  isSubmitting,
  onClose,
  onSubmit,
  opened,
}: {
  email: EmailDetail;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (emailId: string) => Promise<void>;
  opened: boolean;
}) {
  const handleArchive = async () => {
    try {
      await onSubmit(email.id);
    } catch {
      // The parent mutation shows the notification; keep the modal open.
    }
  };

  return (
    <Modal centered opened={opened} title="Archive email" onClose={onClose}>
      <Stack gap="sm">
        <Text size="sm">
          Archive "{email.title}"? It will be hidden from the active board, but
          comments and history will stay in the database.
        </Text>
        <Group justify="flex-end" mt="xs">
          <Button
            disabled={isSubmitting}
            type="button"
            variant="default"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            color="red"
            loading={isSubmitting}
            onClick={handleArchive}
          >
            Archive email
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}


export function DuplicateEmailModal({
  email,
  error,
  isSubmitting,
  onClose,
  onResetError,
  onSubmit,
}: {
  email: EmailDetail;
  error: Error | null;
  isSubmitting: boolean;
  onClose: () => void;
  onResetError: () => void;
  onSubmit: (emailId: string, payload: DuplicateEmailPayload) => Promise<void>;
}) {
  const [language, setLanguage] = useState(email.language);
  const [variant, setVariant] = useState<EmailVariant>(email.variant);
  const [adaptationLabel, setAdaptationLabel] = useState(email.adaptation_label);
  const [title, setTitle] = useState(email.title);
  const [subject, setSubject] = useState(email.subject ?? "");
  const [preheader, setPreheader] = useState(email.preheader ?? "");
  const [languageError, setLanguageError] = useState<string | null>(null);
  const [variantError, setVariantError] = useState<string | null>(null);
  const [adaptationError, setAdaptationError] = useState<string | null>(null);
  const [targetError, setTargetError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedLanguage = language.trim().toLowerCase();
    const normalizedVariant = variant.trim().toLowerCase();
    const normalizedAdaptationLabel = adaptationLabel.trim();
    if (!normalizedLanguage) {
      setLanguageError("Language is required");
      return;
    }
    if (!normalizedVariant) {
      setVariantError("Version is required");
      return;
    }
    if (!normalizedAdaptationLabel) {
      setAdaptationError("Adaptation is required");
      return;
    }

    const payload: DuplicateEmailPayload = {
      ...buildOptionalTextPayload("title", title, email.title),
      ...buildOptionalTextPayload("subject", subject, email.subject),
      ...buildOptionalTextPayload("preheader", preheader, email.preheader),
    };
    if (normalizedLanguage !== email.language) {
      payload.language = normalizedLanguage;
    }
    if (normalizedVariant !== email.variant) {
      payload.variant = normalizedVariant;
    }
    if (normalizedAdaptationLabel !== email.adaptation_label) {
      payload.adaptation_label = normalizedAdaptationLabel;
    }
    if (Object.keys(payload).length === 0) {
      setTargetError("Change language, version, adaptation, or copy before creating.");
      return;
    }

    setLanguageError(null);
    setVariantError(null);
    setAdaptationError(null);
    setTargetError(null);
    try {
      await onSubmit(email.id, payload);
    } catch {
      // React Query stores the error; keep the modal open and show it inline.
    }
  };

  const isConflict = error instanceof ApiError && error.status === 409;

  return (
    <Modal centered opened title="Duplicate as..." onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <Stack gap="sm">
          {error ? (
            <Alert color="red" title="Could not duplicate email">
              {isConflict
                ? "This language, version, and adaptation already exist for the selected email."
                : "Try again or check that the API server is reachable."}
            </Alert>
          ) : null}
          {targetError ? (
            <Alert color="yellow" title="Nothing to create">
              {targetError}
            </Alert>
          ) : null}

          <TextInput
            data-autofocus
            disabled={isSubmitting}
            error={languageError}
            label="Language"
            placeholder="es"
            value={language}
            onChange={(event) => {
              onResetError();
              setTargetError(null);
              setLanguage(event.currentTarget.value);
              if (languageError) {
                setLanguageError(null);
              }
            }}
          />

          <TextInput
            disabled={isSubmitting}
            error={variantError}
            label="Version"
            placeholder="v2"
            value={variant}
            onChange={(event) => {
              onResetError();
              setTargetError(null);
              setVariant(event.currentTarget.value);
              if (variantError) {
                setVariantError(null);
              }
            }}
          />

          <TextInput
            disabled={isSubmitting}
            error={adaptationError}
            label="Adaptation"
            placeholder="Legal"
            value={adaptationLabel}
            onChange={(event) => {
              onResetError();
              setTargetError(null);
              setAdaptationLabel(event.currentTarget.value);
              if (adaptationError) {
                setAdaptationError(null);
              }
            }}
          />

          <TextInput
            disabled={isSubmitting}
            label="Title"
            value={title}
            onChange={(event) => {
              onResetError();
              setTargetError(null);
              setTitle(event.currentTarget.value);
            }}
          />

          <TextInput
            disabled={isSubmitting}
            label="Subject"
            value={subject}
            onChange={(event) => {
              onResetError();
              setTargetError(null);
              setSubject(event.currentTarget.value);
            }}
          />

          <TextInput
            disabled={isSubmitting}
            label="Preheader"
            value={preheader}
            onChange={(event) => {
              onResetError();
              setTargetError(null);
              setPreheader(event.currentTarget.value);
            }}
          />

          <Group justify="flex-end" mt="xs">
            <Button
              disabled={isSubmitting}
              type="button"
              variant="default"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button loading={isSubmitting} type="submit">
              Duplicate as
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}


function buildOptionalTextPayload<Key extends "title" | "subject" | "preheader">(
  key: Key,
  value: string,
  originalValue: string | null
): Partial<Record<Key, string>> {
  if (value === "" && originalValue === null) {
    return {};
  }

  if (key === "title" && value.trim() === "") {
    return {};
  }

  return {
    [key]: key === "title" ? value.trim() : value,
  } as Partial<Record<Key, string>>;
}

