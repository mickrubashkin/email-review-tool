import { type MouseEvent, useEffect, useRef, useState } from "react";
import {
  Badge,
  Card,
  Group,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";

import type { EmailVersionGroup } from "./types";
import { getDefaultVersion } from "./stages";
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

  const handleVersionClick = (
    event: MouseEvent<HTMLButtonElement>,
    emailId: string
  ) => {
    event.stopPropagation();
    onSelectVersion(emailGroup.key, emailId);
  };

  return (
    <UnstyledButton
      className={styles.emailCardButton}
      onClick={() => onOpen(emailGroup.key)}
    >
      <Card className={styles.emailCard} withBorder padding="md" radius="md">
        <Stack className={styles.emailCardContent} gap={0}>
          <Stack className={styles.emailCardBody} gap={6}>
            <Group justify="space-between" gap="xs">
              <Text
                className={styles.emailCardTitle}
                fw={600}
                size="sm"
                lineClamp={2}
              >
                {formatEmailTitle(selectedEmail.title)}
              </Text>
              <Badge size="xs" variant="light" radius="sm">
                {selectedEmail.language}
              </Badge>
            </Group>

            <Group gap={4}>
              {emailGroup.versions.map((email) => (
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

          <Group className={styles.emailCardFooter} justify="space-between">
            <Text size="xs" lineClamp={1}>
              {selectedEmail.send_timing ?? "No timing"}
            </Text>
            {/* <Text size="xs">{emailGroup.versions.length} version(s)</Text> */}
          </Group>
        </Stack>
      </Card>
    </UnstyledButton>
  );
}
