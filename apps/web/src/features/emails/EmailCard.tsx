import {
  type KeyboardEvent,
  type MouseEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Card,
  Group,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";

import type { EmailVariant, EmailVersionGroup } from "./types";
import {
  getAvailableVariants,
  getDefaultVersion,
  getSelectedVariant,
  getVersionForVariant,
  getVersionsForVariant,
} from "./stages";
import styles from "./EmailCard.module.css";

type EmailCardProps = {
  emailGroup: EmailVersionGroup;
  selectedEmailId: string | undefined;
  onOpen: (groupKey: string) => void;
  onSelectVersion: (groupKey: string, emailId: string) => void;
};

type OverflowTooltipTextProps = {
  c?: string;
  lineClamp: number;
  size: string;
  text: string;
};

function OverflowTooltipText({
  c,
  lineClamp,
  size,
  text,
}: OverflowTooltipTextProps) {
  const textRef = useRef<HTMLParagraphElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  useEffect(() => {
    const textElement = textRef.current;
    if (!textElement) {
      return;
    }

    const updateOverflow = () => {
      setIsOverflowing(
        textElement.scrollHeight > textElement.clientHeight ||
        textElement.scrollWidth > textElement.clientWidth
      );
    };

    updateOverflow();

    const resizeObserver = new ResizeObserver(updateOverflow);
    resizeObserver.observe(textElement);

    return () => resizeObserver.disconnect();
  }, [text]);

  return (
    <Tooltip
      disabled={!isOverflowing}
      label={text}
      multiline
      w={220}
      position="top-start"
      withArrow
    >
      <Text ref={textRef} size={size} c={c} lineClamp={lineClamp}>
        {text}
      </Text>
    </Tooltip>
  );
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

export function EmailCard({
  emailGroup,
  selectedEmailId,
  onOpen,
  onSelectVersion,
}: EmailCardProps) {
  const selectedEmail =
    emailGroup.versions.find((email) => email.id === selectedEmailId) ??
    getDefaultVersion(emailGroup.versions);
  const selectedVariant = getSelectedVariant(
    emailGroup.versions,
    selectedEmail.id
  );
  const variantVersions = getVersionsForVariant(
    emailGroup.versions,
    selectedVariant
  );
  const availableVariants = getAvailableVariants(emailGroup.versions);

  const handleVersionClick = (
    event: MouseEvent<HTMLButtonElement>,
    emailId: string
  ) => {
    event.stopPropagation();
    onSelectVersion(emailGroup.key, emailId);
  };

  const handleVariantClick = (
    event: MouseEvent<HTMLButtonElement>,
    variant: EmailVariant
  ) => {
    event.stopPropagation();
    const nextEmail = getVersionForVariant(
      emailGroup.versions,
      variant,
      selectedEmail.language
    );
    if (nextEmail) {
      onSelectVersion(emailGroup.key, nextEmail.id);
    }
  };
  const handleCardKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen(emailGroup.key);
    }
  };

  return (
    <Card
      className={`${styles.emailCardButton} ${styles.emailCard}`}
      withBorder
      padding="md"
      radius="md"
      role="button"
      tabIndex={0}
      onClick={() => onOpen(emailGroup.key)}
      onKeyDown={handleCardKeyDown}
    >
      <Stack className={styles.emailCardContent} gap={0}>
        <Stack className={styles.emailCardBody} gap={6}>
          <Group justify="space-between" gap="xs" align="flex-start">
            <Text
              className={styles.emailCardTitle}
              fw={600}
              size="sm"
              lineClamp={2}
            >
              {formatEmailTitle(selectedEmail.title)}
            </Text>
            <Group className={styles.variantSwitch} gap={2}>
              {(["new", "old"] as const).map((variant) => (
                <button
                  className={styles.variantButton}
                  data-active={variant === selectedVariant || undefined}
                  disabled={!availableVariants.includes(variant)}
                  key={variant}
                  type="button"
                  onClick={(event) => handleVariantClick(event, variant)}
                >
                  {variant}
                </button>
              ))}
            </Group>
          </Group>

          <Group gap={4}>
            {variantVersions.map((email) => (
              <button
                className={styles.versionButton}
                data-active={email.id === selectedEmail.id || undefined}
                key={email.id}
                type="button"
                onClick={(event) => handleVersionClick(event, email.id)}
              >
                {email.language}
              </button>
            ))}
          </Group>

          {selectedEmail.subject ? (
            <OverflowTooltipText
              text={selectedEmail.subject}
              size="sm"
              c="dimmed"
              lineClamp={2}
            />
          ) : null}

          {selectedEmail.preheader ? (
            <OverflowTooltipText
              text={selectedEmail.preheader}
              size="xs"
              c="dimmed"
              lineClamp={2}
            />
          ) : null}
        </Stack>

        <Group className={styles.emailCardFooter} justify="space-between" wrap="nowrap">
          <Text size="xs" lineClamp={1}>
            {selectedEmail.send_timing ?? "No timing"}
          </Text>
        </Group>
      </Stack>
    </Card>
  );
}
