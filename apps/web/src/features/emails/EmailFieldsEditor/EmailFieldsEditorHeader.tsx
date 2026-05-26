import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Select,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import { Link } from "react-router-dom";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  Copy,
  DownloadSimple,
  FloppyDisk,
  HouseIcon,
} from "@phosphor-icons/react";

import { copyRenderedHTML, downloadRenderedHTML } from "../exportHtml";
import type { EmailDetail, EmailListItem, EmailVariant } from "../types";

import {
  formatEmailTitle,
  formatVariantOptionLabel,
} from "./EmailFieldsEditor.helpers";
import styles from "./EmailFieldsEditor.module.css";

export function EmailFieldsEditorHeader({
  adaptations,
  availableVariants,
  currentStageTitle,
  email,
  isDirty,
  isSaving,
  languageVersions,
  nextBoardEmail,
  previousBoardEmail,
  renderedHTML,
  selectedAdaptation,
  selectedVariant,
  onAdaptationSelect,
  onNavigateToEdit,
  onSave,
  onVariantSelect,
}: {
  adaptations: Array<Pick<EmailListItem, "adaptation_key" | "adaptation_label">>;
  availableVariants: EmailVariant[];
  currentStageTitle: string;
  email: EmailDetail;
  isDirty: boolean;
  isSaving: boolean;
  languageVersions: Array<Pick<EmailListItem, "id" | "language">>;
  nextBoardEmail: EmailListItem | undefined;
  previousBoardEmail: EmailListItem | undefined;
  renderedHTML: string;
  selectedAdaptation: string;
  selectedVariant: EmailVariant;
  onAdaptationSelect: (adaptationKey: string) => void;
  onNavigateToEdit: (emailId: string) => void;
  onSave: () => void;
  onVariantSelect: (variant: EmailVariant) => void;
}) {
  return (
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
                    onNavigateToEdit(previousBoardEmail.id);
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
                    onNavigateToEdit(nextBoardEmail.id);
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
              {currentStageTitle}
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
              onSelect={onNavigateToEdit}
            />
            <VariantSwitch
              availableVariants={availableVariants}
              selectedVariant={selectedVariant}
              onSelect={onVariantSelect}
            />
            <AdaptationSelect
              adaptations={adaptations}
              selectedAdaptation={selectedAdaptation}
              onSelect={onAdaptationSelect}
            />
          </Group>
        </Group>

        <Group className={styles.headerActions} gap="xs" wrap="nowrap">
          <Button
            disabled={!isDirty}
            leftSection={<FloppyDisk aria-hidden="true" size={16} />}
            loading={isSaving}
            onClick={onSave}
          >
            Save
          </Button>
          <Button
            disabled={isDirty || isSaving}
            leftSection={<Copy aria-hidden="true" size={16} />}
            variant="light"
            onClick={() => void copyRenderedHTML(renderedHTML)}
          >
            Copy HTML
          </Button>
          <Button
            disabled={isDirty || isSaving}
            leftSection={<DownloadSimple aria-hidden="true" size={16} />}
            variant="light"
            onClick={() => downloadRenderedHTML(email, renderedHTML)}
          >
            Download
          </Button>
        </Group>
      </div>
    </header>
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
