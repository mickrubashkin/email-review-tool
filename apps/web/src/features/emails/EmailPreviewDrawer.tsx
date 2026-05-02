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
import { ChevronDown, Columns2, Monitor, Smartphone } from "lucide-react";
import { useState } from "react";

import { AISparkleIcon } from "./AISparkleIcon";
import { AnalysisPanel } from "./AnalysisPanel";
import { MailPreview } from "./MailPreview";
import { buildStreamPreview } from "./streamPreview";
import type { EmailDetail, EmailVersionGroup } from "./types";
import { useEmailAnalysisStream } from "./useEmailAnalysisStream";
import styles from "./EmailPreviewDrawer.module.css";

type PreviewMode = "desktop" | "mobile" | "both";

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
  const activePreviewMode = isMobile
    ? "mobile"
    : shouldShowAnalysisPanel && previewMode === "both"
      ? "desktop"
      : previewMode;
  const selectedVersion = emailGroup?.versions.find(
    (version) => version.id === selectedEmailId
  );
  const headerTitle = email
    ? `${email.title}${email.send_timing ? ` (${formatTimingLabel(email.send_timing)})` : ""}`
    : "";

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size={
        isMobile
          ? "100%"
          : activePreviewMode === "both"
            ? "min(1680px, 98vw)"
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
                  selectedEmailId={selectedEmailId ?? selectedVersion?.id ?? ""}
                  onSelectVersion={onSelectVersion}
                />
              ) : null}

              {!isMobile ? (
                <PreviewModeSwitch
                  activePreviewMode={activePreviewMode}
                  showBoth={!shouldShowAnalysisPanel}
                  onChange={setPreviewMode}
                />
              ) : null}

              <Tooltip label="Analyze with AI">
                <ActionIcon
                  aria-label="Analyze with AI"
                  className={styles.aiAction}
                  loading={streamStatus === "streaming" && isCurrentStream}
                  onClick={analyze}
                  radius="md"
                  size="lg"
                  variant="light"
                >
                  <AISparkleIcon />
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
}: {
  emailGroup: EmailVersionGroup;
  onSelectVersion: (groupKey: string, emailId: string) => void;
  selectedEmailId: string;
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
        {emailGroup.versions.map((version) => (
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

function PreviewModeSwitch({
  activePreviewMode,
  onChange,
  showBoth,
}: {
  activePreviewMode: PreviewMode;
  onChange: (mode: PreviewMode) => void;
  showBoth: boolean;
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
      {showBoth ? (
        <Tooltip label="Compare desktop and mobile">
          <button
            aria-label="Compare desktop and mobile"
            className={styles.viewportButton}
            data-active={activePreviewMode === "both" || undefined}
            type="button"
            onClick={() => onChange("both")}
          >
            <Columns2 aria-hidden="true" size={16} strokeWidth={2.2} />
          </button>
        </Tooltip>
      ) : null}
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
  if (previewMode === "both") {
    return (
      <div className={styles.previewCompareGrid}>
        <MailPreview email={email} isScanning={isScanning} viewport="desktop" />
        <MailPreview email={email} isScanning={isScanning} viewport="mobile" />
      </div>
    );
  }

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
