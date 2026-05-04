import {
  ActionIcon,
  Alert,
  Drawer,
  Group,
  Loader,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import {
  ChevronDown,
  Copy,
  Download,
  ExternalLink,
  Monitor,
  RefreshCcw,
  Smartphone,
} from "lucide-react";
import { useState } from "react";

import { AISparkleIcon } from "./AISparkleIcon";
import { AnalysisPanel } from "./AnalysisPanel";
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
  EmailDetail,
  EmailListItem,
  EmailVariant,
  EmailVersionGroup,
} from "./types";
import { useEmailAnalysisStream } from "./useEmailAnalysisStream";
import styles from "./EmailPreviewDrawer.module.css";

type PreviewMode = "desktop" | "mobile";

type EmailPreviewDrawerProps = {
  email: EmailDetail | undefined;
  emailGroup: EmailVersionGroup | undefined;
  isError: boolean;
  isLoading: boolean;
  isMobile: boolean | undefined;
  onClose: () => void;
  onSelectVersion: (groupKey: string, emailId: string) => void;
  opened: boolean;
  selectedEmailId: string | null;
};

export function EmailPreviewDrawer({
  email,
  emailGroup,
  isError,
  isLoading,
  isMobile,
  onClose,
  onSelectVersion,
  opened,
  selectedEmailId,
}: EmailPreviewDrawerProps) {
  const [previewMode, setPreviewMode] = useState<PreviewMode>("desktop");
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

function formatTimingLabel(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}
