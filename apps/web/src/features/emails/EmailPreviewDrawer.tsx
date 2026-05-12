import {
  ActionIcon,
  Alert,
  Button,
  Drawer,
  Group,
  Loader,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import {
  Archive,
  ChevronDown,
  Copy,
  CopyPlus,
  Download,
  ExternalLink,
  Monitor,
  RefreshCcw,
  Smartphone,
} from "lucide-react";
import { type FormEvent, useState } from "react";

import { AISparkleIcon } from "./AISparkleIcon";
import { AnalysisPanel } from "./AnalysisPanel";
import { ApiError } from "./api";
import { copyOriginalHTML, downloadOriginalHTML } from "./exportHtml";
import { MailPreview } from "./MailPreview";
import {
  getAvailableVariants,
  getSelectedVariant,
  getVersionForVariant,
  getVersionsForVariant,
} from "./stages";
import { buildStreamPreview } from "./streamPreview";
import type {
  AuthUser,
  DuplicateEmailPayload,
  EmailDetail,
  EmailListItem,
  EmailVariant,
  EmailVersionGroup,
} from "./types";
import { useEmailAnalysisStream } from "./useEmailAnalysisStream";
import styles from "./EmailPreviewDrawer.module.css";

type PreviewMode = "desktop" | "mobile";

type EmailPreviewDrawerProps = {
  currentUserRole: AuthUser["role"];
  duplicateEmailError: Error | null;
  email: EmailDetail | undefined;
  emailGroup: EmailVersionGroup | undefined;
  isArchivingEmail: boolean;
  isDuplicatingEmail: boolean;
  isError: boolean;
  isLoading: boolean;
  isMobile: boolean | undefined;
  onClose: () => void;
  onArchiveEmail: (emailId: string) => Promise<void>;
  onDuplicateEmail: (
    emailId: string,
    payload: DuplicateEmailPayload
  ) => Promise<EmailDetail>;
  onResetDuplicateEmail: () => void;
  onSelectVersion: (groupKey: string, emailId: string) => void;
  opened: boolean;
  selectedEmailId: string | null;
};

export function EmailPreviewDrawer({
  currentUserRole,
  duplicateEmailError,
  email,
  emailGroup,
  isArchivingEmail,
  isDuplicatingEmail,
  isError,
  isLoading,
  isMobile,
  onClose,
  onArchiveEmail,
  onDuplicateEmail,
  onResetDuplicateEmail,
  onSelectVersion,
  opened,
  selectedEmailId,
}: EmailPreviewDrawerProps) {
  const [previewMode, setPreviewMode] = useState<PreviewMode>("desktop");
  const [duplicateModalOpened, setDuplicateModalOpened] = useState(false);
  const [archiveModalOpened, setArchiveModalOpened] = useState(false);
  const {
    analyze,
    reanalyze,
    streamAnalysis,
    streamEmailId,
    streamError,
    streamStatus,
    streamText,
  } = useEmailAnalysisStream(email, opened);

  const isCurrentStream = streamEmailId === email?.id;
  const displayedAnalysis = streamAnalysis && isCurrentStream ? streamAnalysis : null;
  const streamPreview = buildStreamPreview(streamText);
  const shouldShowAnalysisPanel =
    isCurrentStream && (streamStatus !== "idle" || Boolean(displayedAnalysis));
  const activePreviewMode = isMobile ? "mobile" : previewMode;
  const selectedVersion = emailGroup?.versions.find(
    (version) => version.id === selectedEmailId
  );
  const selectedVariant = emailGroup
    ? getSelectedVariant(emailGroup.versions, selectedEmailId)
    : "new";
  const selectedVariantVersions = emailGroup
    ? getVersionsForVariant(emailGroup.versions, selectedVariant)
    : [];
  const availableVariants = emailGroup
    ? getAvailableVariants(emailGroup.versions)
    : [];
  const headerTitle = email
    ? `${email.title}${email.send_timing ? ` (${formatTimingLabel(email.send_timing)})` : ""}`
    : "";
  const isAnalyzingCurrentEmail = streamStatus === "streaming" && isCurrentStream;
  const canManageEmail =
    currentUserRole === "admin" || currentUserRole === "super_admin";

  const handleCopyHTML = async () => {
    if (email) {
      await copyOriginalHTML(email);
    }
  };

  const handleDownloadHTML = () => {
    if (email) {
      downloadOriginalHTML(email);
    }
  };

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size={
        isMobile
          ? "100%"
          : "min(1180px, 96vw)"
      }
      title={
        <div className={styles.drawerTitleBar}>
          <Text className={styles.drawerTitleText}>
            {headerTitle || "Email preview"}
          </Text>

          {email ? (
            <Group className={styles.drawerHeaderControls} gap="xs">
              {emailGroup && emailGroup.versions.length > 1 ? (
                <VersionSelect
                  emailGroup={emailGroup}
                  versions={selectedVariantVersions}
                  selectedEmailId={selectedEmailId ?? selectedVersion?.id ?? ""}
                  onSelectVersion={onSelectVersion}
                />
              ) : null}

              {emailGroup && availableVariants.length > 0 ? (
                <VariantSwitch
                  availableVariants={availableVariants}
                  emailGroup={emailGroup}
                  selectedEmail={email}
                  selectedVariant={selectedVariant}
                  onSelectVersion={onSelectVersion}
                />
              ) : null}

              {!isMobile ? (
                <PreviewModeSwitch
                  activePreviewMode={activePreviewMode}
                  onChange={setPreviewMode}
                />
              ) : null}

              {canManageEmail ? (
                <Tooltip label="Duplicate email">
                  <ActionIcon
                    aria-label="Duplicate email"
                    className={styles.exportAction}
                    onClick={() => {
                      onResetDuplicateEmail();
                      setDuplicateModalOpened(true);
                    }}
                    radius="md"
                    size="lg"
                    variant="light"
                  >
                    <CopyPlus aria-hidden="true" size={16} strokeWidth={2.2} />
                  </ActionIcon>
                </Tooltip>
              ) : null}

              {canManageEmail ? (
                <Tooltip label="Archive email">
                  <ActionIcon
                    aria-label="Archive email"
                    className={styles.archiveAction}
                    loading={isArchivingEmail}
                    onClick={() => setArchiveModalOpened(true)}
                    radius="md"
                    size="lg"
                    variant="light"
                  >
                    <Archive aria-hidden="true" size={16} strokeWidth={2.2} />
                  </ActionIcon>
                </Tooltip>
              ) : null}

              <Tooltip label="Open review page">
                <ActionIcon
                  aria-label="Open review page"
                  className={styles.exportAction}
                  component="a"
                  href={`/emails/${encodeURIComponent(email.id)}/review`}
                  radius="md"
                  size="lg"
                  variant="light"
                >
                  <ExternalLink aria-hidden="true" size={16} strokeWidth={2.2} />
                </ActionIcon>
              </Tooltip>

              <Tooltip label="Copy original HTML">
                <ActionIcon
                  aria-label="Copy original HTML"
                  className={styles.exportAction}
                  onClick={handleCopyHTML}
                  radius="md"
                  size="lg"
                  variant="light"
                >
                  <Copy aria-hidden="true" size={16} strokeWidth={2.2} />
                </ActionIcon>
              </Tooltip>

              <Tooltip label="Download original HTML">
                <ActionIcon
                  aria-label="Download original HTML"
                  className={styles.exportAction}
                  onClick={handleDownloadHTML}
                  radius="md"
                  size="lg"
                  variant="light"
                >
                  <Download aria-hidden="true" size={16} strokeWidth={2.2} />
                </ActionIcon>
              </Tooltip>

              <Tooltip label="Analyze with AI">
                <ActionIcon
                  aria-label="Analyze with AI"
                  className={styles.aiAction}
                  loading={isAnalyzingCurrentEmail}
                  onClick={() => analyze()}
                  radius="md"
                  size="lg"
                  variant="light"
                >
                  <AISparkleIcon />
                </ActionIcon>
              </Tooltip>

              <Tooltip label="Generate a new AI analysis. This will make a new AI request and may use tokens/cost.">
                <ActionIcon
                  aria-label="Generate a new AI analysis"
                  className={styles.aiAction}
                  disabled={isAnalyzingCurrentEmail}
                  onClick={reanalyze}
                  radius="md"
                  size="lg"
                  variant="light"
                >
                  <RefreshCcw aria-hidden="true" size={16} strokeWidth={2.2} />
                </ActionIcon>
              </Tooltip>
            </Group>
          ) : null}
        </div>
      }
      padding="md"
    >
      {duplicateModalOpened ? (
        <DuplicateEmailModal
          email={email}
          error={duplicateEmailError}
          isSubmitting={isDuplicatingEmail}
          onClose={() => {
            onResetDuplicateEmail();
            setDuplicateModalOpened(false);
          }}
          onResetError={onResetDuplicateEmail}
          onSubmit={async (emailId, payload) => {
            await onDuplicateEmail(emailId, payload);
            setDuplicateModalOpened(false);
          }}
        />
      ) : null}

      <ArchiveEmailModal
        email={email}
        isSubmitting={isArchivingEmail}
        opened={archiveModalOpened}
        onClose={() => setArchiveModalOpened(false)}
        onSubmit={async (emailId) => {
          await onArchiveEmail(emailId);
          setArchiveModalOpened(false);
        }}
      />

      {isLoading ? (
        <Stack align="center" justify="center" h={320}>
          <Loader />
          <Text c="dimmed">Loading preview</Text>
        </Stack>
      ) : null}

      {isError ? (
        <Alert color="red" title="Failed to load preview">
          Try closing the preview and opening the email again.
        </Alert>
      ) : null}

      {email ? (
        <Stack gap="md">
          <div
            className={
              shouldShowAnalysisPanel
                ? styles.previewWithAnalysis
                : styles.previewOnly
            }
            data-preview-mode={activePreviewMode}
          >
            <PreviewArea
              email={email}
              isScanning={streamStatus === "streaming" && isCurrentStream}
              previewMode={activePreviewMode}
            />

            {shouldShowAnalysisPanel ? (
              <aside className={styles.analysisPanel}>
                <AnalysisPanel
                  analysis={displayedAnalysis}
                  error={streamError}
                  isStreaming={streamStatus === "streaming"}
                  preview={streamPreview}
                  showError={streamStatus === "error"}
                />
              </aside>
            ) : null}
          </div>
        </Stack>
      ) : null}
    </Drawer>
  );
}

function VersionSelect({
  emailGroup,
  onSelectVersion,
  selectedEmailId,
  versions,
}: {
  emailGroup: EmailVersionGroup;
  onSelectVersion: (groupKey: string, emailId: string) => void;
  selectedEmailId: string;
  versions: EmailListItem[];
}) {
  return (
    <label className={styles.versionSelectWrap}>
      <select
        aria-label="Email version"
        className={styles.versionSelect}
        value={selectedEmailId}
        onChange={(event) =>
          onSelectVersion(emailGroup.key, event.currentTarget.value)
        }
      >
        {versions.map((version) => (
          <option key={version.id} value={version.id}>
            {version.language.toUpperCase()}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden="true"
        className={styles.versionSelectIcon}
        size={14}
        strokeWidth={2.2}
      />
    </label>
  );
}

function VariantSwitch({
  availableVariants,
  emailGroup,
  onSelectVersion,
  selectedEmail,
  selectedVariant,
}: {
  availableVariants: EmailVariant[];
  emailGroup: EmailVersionGroup;
  onSelectVersion: (groupKey: string, emailId: string) => void;
  selectedEmail: EmailDetail;
  selectedVariant: EmailVariant;
}) {
  const handleVariantClick = (variant: EmailVariant) => {
    const nextEmail = getVersionForVariant(
      emailGroup.versions,
      variant,
      selectedEmail.language
    );
    if (nextEmail) {
      onSelectVersion(emailGroup.key, nextEmail.id);
    }
  };

  return (
    <Group className={styles.variantSwitch} gap={0}>
      {(["new", "old"] as const).map((variant) => (
        <button
          aria-label={`${variant} email variant`}
          className={styles.variantButton}
          data-active={variant === selectedVariant || undefined}
          disabled={!availableVariants.includes(variant)}
          key={variant}
          type="button"
          onClick={() => handleVariantClick(variant)}
        >
          {variant}
        </button>
      ))}
    </Group>
  );
}

function PreviewModeSwitch({
  activePreviewMode,
  onChange,
}: {
  activePreviewMode: PreviewMode;
  onChange: (mode: PreviewMode) => void;
}) {
  return (
    <Group className={styles.viewportSwitch} gap={0}>
      <Tooltip label="Desktop preview">
        <button
          aria-label="Desktop preview"
          className={styles.viewportButton}
          data-active={activePreviewMode === "desktop" || undefined}
          type="button"
          onClick={() => onChange("desktop")}
        >
          <Monitor aria-hidden="true" size={16} strokeWidth={2.2} />
        </button>
      </Tooltip>
      <Tooltip label="Mobile preview">
        <button
          aria-label="Mobile preview"
          className={styles.viewportButton}
          data-active={activePreviewMode === "mobile" || undefined}
          type="button"
          onClick={() => onChange("mobile")}
        >
          <Smartphone aria-hidden="true" size={16} strokeWidth={2.2} />
        </button>
      </Tooltip>
    </Group>
  );
}

function PreviewArea({
  email,
  isScanning,
  previewMode,
}: {
  email: EmailDetail;
  isScanning: boolean;
  previewMode: PreviewMode;
}) {
  return (
    <MailPreview email={email} isScanning={isScanning} viewport={previewMode} />
  );
}

function ArchiveEmailModal({
  email,
  isSubmitting,
  onClose,
  onSubmit,
  opened,
}: {
  email: EmailDetail | undefined;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (emailId: string) => Promise<void>;
  opened: boolean;
}) {
  const handleArchive = async () => {
    if (!email) {
      return;
    }

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
          Archive {email ? `"${email.title}"` : "this email"}? It will be hidden
          from the active board, but comments and history will stay in the database.
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
            disabled={!email}
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

function DuplicateEmailModal({
  email,
  error,
  isSubmitting,
  onClose,
  onResetError,
  onSubmit,
}: {
  email: EmailDetail | undefined;
  error: Error | null;
  isSubmitting: boolean;
  onClose: () => void;
  onResetError: () => void;
  onSubmit: (emailId: string, payload: DuplicateEmailPayload) => Promise<void>;
}) {
  const [language, setLanguage] = useState("");
  const [variant, setVariant] = useState<EmailVariant>(email?.variant ?? "new");
  const [title, setTitle] = useState(email?.title ?? "");
  const [subject, setSubject] = useState(email?.subject ?? "");
  const [preheader, setPreheader] = useState(email?.preheader ?? "");
  const [languageError, setLanguageError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!email) {
      return;
    }

    const normalizedLanguage = language.trim().toLowerCase();
    if (!normalizedLanguage) {
      setLanguageError("Language is required");
      return;
    }

    setLanguageError(null);
    try {
      await onSubmit(email.id, {
        language: normalizedLanguage,
        variant,
        ...buildOptionalTextPayload("title", title, email.title),
        ...buildOptionalTextPayload("subject", subject, email.subject),
        ...buildOptionalTextPayload("preheader", preheader, email.preheader),
      });
    } catch {
      // React Query stores the error; keep the modal open and show it inline.
    }
  };

  const isConflict = error instanceof ApiError && error.status === 409;

  return (
    <Modal
      centered
      opened
      title="Duplicate email"
      onClose={onClose}
    >
      <form onSubmit={handleSubmit}>
        <Stack gap="sm">
          {error ? (
            <Alert color="red" title="Could not duplicate email">
              {isConflict
                ? "This language and variant already exist for the selected email."
                : "Try again or check that the API server is reachable."}
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
              setLanguage(event.currentTarget.value);
              if (languageError) {
                setLanguageError(null);
              }
            }}
          />

          <Select
            allowDeselect={false}
            data={[
              { label: "New", value: "new" },
              { label: "Old", value: "old" },
            ]}
            disabled={isSubmitting}
            label="Variant"
            value={variant}
            onChange={(value) => {
              onResetError();
              setVariant((value as EmailVariant) ?? "new");
            }}
          />

          <TextInput
            disabled={isSubmitting}
            label="Title"
            value={title}
            onChange={(event) => {
              onResetError();
              setTitle(event.currentTarget.value);
            }}
          />

          <TextInput
            disabled={isSubmitting}
            label="Subject"
            value={subject}
            onChange={(event) => {
              onResetError();
              setSubject(event.currentTarget.value);
            }}
          />

          <TextInput
            disabled={isSubmitting}
            label="Preheader"
            value={preheader}
            onChange={(event) => {
              onResetError();
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
              Create duplicate
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

function formatTimingLabel(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}
