import {
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Badge,
  Card,
  Group,
  Popover,
  Stack,
  Text,
  Tooltip,
  ScrollArea,
} from "@mantine/core";
import { useNavigate } from "react-router-dom";

import type { EmailVariant, EmailVersionGroup } from "./types";
import {
  getAvailableVariants,
  getAvailableAdaptations,
  getDefaultVersion,
  getSelectedAdaptation,
  getSelectedVariant,
  getVersionForVariant,
  getVersionsForVariantAndAdaptation,
} from "./stages";
import styles from "./EmailCard.module.css";

type EmailCardProps = {
  emailGroup: EmailVersionGroup;
  selectedEmailId: string | undefined;
  onOpen: (groupKey: string, emailId: string) => void;
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
  const navigate = useNavigate();
  const [commentsPopoverOpened, setCommentsPopoverOpened] = useState(false);
  const selectedEmail =
    emailGroup.versions.find((email) => email.id === selectedEmailId) ??
    getDefaultVersion(emailGroup.versions);
  const selectedVariant = getSelectedVariant(
    emailGroup.versions,
    selectedEmail.id
  );
  const selectedAdaptation = getSelectedAdaptation(
    emailGroup.versions,
    selectedEmail.id
  );
  const variantVersions = getVersionsForVariantAndAdaptation(
    emailGroup.versions,
    selectedVariant,
    selectedAdaptation
  );
  const availableVariants = getAvailableVariants(emailGroup.versions);
  const availableAdaptations = getAvailableAdaptations(
    emailGroup.versions,
    selectedVariant
  );
  const openCommentCount = emailGroup.versions.reduce(
    (count, email) => count + (email.open_comment_count ?? 0),
    0
  );
  const commentedVersions = emailGroup.versions.filter(
    (email) => (email.open_comment_count ?? 0) > 0
  );

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
      selectedEmail.language,
      selectedAdaptation
    );
    if (nextEmail) {
      onSelectVersion(emailGroup.key, nextEmail.id);
    }
  };
  const handleAdaptationChange = (event: ChangeEvent<HTMLSelectElement>) => {
    event.stopPropagation();
    const nextEmail = getVersionForVariant(
      emailGroup.versions,
      selectedVariant,
      selectedEmail.language,
      event.currentTarget.value
    );
    if (nextEmail) {
      onSelectVersion(emailGroup.key, nextEmail.id);
    }
  };
  const handleCardKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setCommentsPopoverOpened(false);
      onOpen(emailGroup.key, selectedEmail.id);
    }
  };

  return (
    <Card
      className={`${styles.emailCardButton} ${styles.emailCard} ${openCommentCount > 0 ? styles.emailCardHasOpenComments : ""}`}
      withBorder
      padding="md"
      radius="md"
      role="button"
      tabIndex={0}
      onClick={() => {
        setCommentsPopoverOpened(false);
        onOpen(emailGroup.key, selectedEmail.id);
      }}
      onKeyDown={handleCardKeyDown}
    >
      <Stack className={styles.emailCardContent} gap={0}>
        <Stack className={styles.emailCardBody} gap={6}>
          <Group justify="space-between" gap={8} align="flex-start" wrap="nowrap">
            <Text
              className={styles.emailCardTitle}
              fw={600}
              size="sm"
              lineClamp={2}
            >
              {formatEmailTitle(selectedEmail.title)}
            </Text>

            {openCommentCount > 0 ? (
              <Popover
                opened={commentsPopoverOpened}
                onChange={setCommentsPopoverOpened}
                position="bottom-end"
                offset={8}
                shadow="md"
                width={260}
                withArrow
                withinPortal
              >
                <Popover.Target>
                  <button
                    className={styles.openCommentButton}
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setCommentsPopoverOpened((value) => !value);
                    }}
                  >
                    <Badge
                      className={styles.openCommentBadge}
                      color="red"
                      size="xs"
                      variant="light"
                    >
                      {openCommentCount}
                    </Badge>
                  </button>
                </Popover.Target>

                <Popover.Dropdown className={styles.commentsPopover}>
                  <Stack gap={4}>
                    <Text fw={700} size="xs" c="dimmed" tt="uppercase">
                      Comments in this group
                    </Text>

                    <ScrollArea h={220} type="auto">
                      <Stack gap={4}>
                        {commentedVersions.map((email) => (
                          <button
                            className={styles.commentVersionRow}
                            key={email.id}
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              navigate(`/emails/${encodeURIComponent(email.id)}/review`);
                              setCommentsPopoverOpened(false);
                            }}
                          >
                            <Group justify="space-between" gap={8} wrap="nowrap">
                              <Stack gap={0} className={styles.commentVersionText}>
                                <Text size="sm" fw={600} lineClamp={1}>
                                  {email.language.toUpperCase()} {email.variant}
                                </Text>
                                <Text size="xs" c="dimmed" lineClamp={1}>
                                  {email.subject ?? "No subject"}
                                </Text>
                              </Stack>

                              <Badge color="red" size="xs" variant="light">
                                {email.open_comment_count}
                              </Badge>
                            </Group>
                          </button>
                        ))}
                      </Stack>
                    </ScrollArea>
                  </Stack>
                </Popover.Dropdown>
              </Popover>
            ) : null}
          </Group>

          <Group className={styles.variantRow} gap={6} wrap="nowrap">
            <Group className={styles.variantSwitch} gap={2} wrap="nowrap">
              {availableVariants.map((variant) => (
                <button
                  className={styles.variantButton}
                  data-active={variant === selectedVariant || undefined}
                  key={variant}
                  type="button"
                  onClick={(event) => handleVariantClick(event, variant)}
                >
                  {variant}
                </button>
              ))}
            </Group>

            <label
              className={styles.adaptationSelectWrap}
              onClick={(event) => event.stopPropagation()}
            >
            <select
              aria-label="Email adaptation"
              className={styles.adaptationSelect}
              value={selectedAdaptation}
              onChange={handleAdaptationChange}
            >
              {availableAdaptations.map((adaptation) => (
                <option
                  key={adaptation.adaptation_key}
                  value={adaptation.adaptation_key}
                >
                  {adaptation.adaptation_label}
                </option>
              ))}
            </select>
            </label>
          </Group>

          <Group gap={3} wrap="wrap">
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
