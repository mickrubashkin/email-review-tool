import {
  type KeyboardEvent,
  type MouseEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ActionIcon,
  Badge,
  Card,
  Group,
  Menu,
  Stack,
  Text,
  Tooltip,
  ScrollArea,
} from "@mantine/core";
import { CheckIcon, DotsThreeVerticalIcon } from "@phosphor-icons/react";
import { useNavigate } from "react-router-dom";

import type { EmailReviewStatus, EmailVariant, EmailVersionGroup } from "./types";
import {
  emailReviewStatusOptions,
  formatEmailReviewStatus,
} from "./reviewStatus";
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
  onReviewStatusChange: (emailId: string, reviewStatus: EmailReviewStatus) => void;
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

function formatVariantLabel(variant: EmailVariant) {
  const normalizedVariant = variant.trim().toLowerCase();
  if (normalizedVariant === "old") {
    return "v0";
  }
  if (normalizedVariant === "new") {
    return "v1";
  }

  return variant;
}

function isLegacyVariant(variant: EmailVariant) {
  const normalizedVariant = variant.trim().toLowerCase();
  return normalizedVariant === "old" || normalizedVariant === "new";
}

function formatVariantOptionLabel(
  variant: EmailVariant,
  variants: EmailVariant[]
) {
  const label = formatVariantLabel(variant);
  const hasLabelCollision = variants.some(
    (otherVariant) =>
      otherVariant !== variant && formatVariantLabel(otherVariant) === label
  );

  if (hasLabelCollision && isLegacyVariant(variant)) {
    return `${label} legacy`;
  }

  return label;
}

export function EmailCard({
  emailGroup,
  selectedEmailId,
  onOpen,
  onReviewStatusChange,
  onSelectVersion,
}: EmailCardProps) {
  const navigate = useNavigate();
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
  const handleCommentVersionClick = (
    event: MouseEvent<HTMLButtonElement>,
    emailId: string
  ) => {
    event.stopPropagation();
    navigate(`/emails/${encodeURIComponent(emailId)}/review`);
  };

  const handleVariantSelect = (
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
  const handleAdaptationSelect = (
    event: MouseEvent<HTMLButtonElement>,
    adaptationKey: string
  ) => {
    event.stopPropagation();
    const nextEmail = getVersionForVariant(
      emailGroup.versions,
      selectedVariant,
      selectedEmail.language,
      adaptationKey
    );
    if (nextEmail) {
      onSelectVersion(emailGroup.key, nextEmail.id);
    }
  };
  const handleReviewStatusSelect = (
    event: MouseEvent<HTMLButtonElement>,
    reviewStatus: EmailReviewStatus
  ) => {
    event.stopPropagation();
    if (reviewStatus !== selectedEmail.review_status) {
      onReviewStatusChange(selectedEmail.id, reviewStatus);
    }
  };
  const handleCardKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen(emailGroup.key, selectedEmail.id);
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
      onClick={() => {
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
              <Badge
                className={styles.openCommentCornerBadge}
                color="red"
                radius="xl"
                size="xs"
                variant="light"
              >
                {openCommentCount}
              </Badge>
            ) : null}

            <Menu
              classNames={{
                dropdown: styles.cardMenuDropdown,
                divider: styles.cardMenuDivider,
                item: styles.cardMenuItem,
                itemLabel: styles.cardMenuItemLabel,
                label: styles.cardMenuLabel,
              }}
              position="bottom-end"
              shadow="md"
              width={220}
              withinPortal
            >
              <Menu.Target>
                <ActionIcon
                  aria-label="Email options"
                  className={styles.cardMenuButton}
                  size="sm"
                  variant="subtle"
                  onClick={(event) => event.stopPropagation()}
                >
                  <DotsThreeVerticalIcon aria-hidden="true" size={18} weight="bold" />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown onClick={(event) => event.stopPropagation()}>
                <Menu.Label>Language</Menu.Label>
                {variantVersions.map((email) => (
                  <Menu.Item
                    key={email.id}
                    rightSection={
                      email.id === selectedEmail.id ? (
                    <CheckIcon aria-hidden="true" size={14} weight="bold" />
                      ) : null
                    }
                    onClick={(event) => handleVersionClick(event, email.id)}
                  >
                    {email.language.toUpperCase()}
                  </Menu.Item>
                ))}

                <Menu.Divider />
                <Menu.Label>Version</Menu.Label>
                {availableVariants.map((variant) => (
                  <Menu.Item
                    key={variant}
                    rightSection={
                      variant === selectedVariant ? (
                        <CheckIcon aria-hidden="true" size={14} weight="bold" />
                      ) : null
                    }
                    onClick={(event) => handleVariantSelect(event, variant)}
                  >
                    {formatVariantOptionLabel(variant, availableVariants)}
                  </Menu.Item>
                ))}

                <Menu.Divider />
                <Menu.Label>Adaptation</Menu.Label>
                {availableAdaptations.map((adaptation) => (
                  <Menu.Item
                    key={adaptation.adaptation_key}
                    rightSection={
                      adaptation.adaptation_key === selectedAdaptation ? (
                        <CheckIcon aria-hidden="true" size={14} weight="bold" />
                      ) : null
                    }
                    onClick={(event) =>
                      handleAdaptationSelect(event, adaptation.adaptation_key)
                    }
                  >
                    {adaptation.adaptation_label}
                  </Menu.Item>
                ))}

                <Menu.Divider />
                <Menu.Label>Status</Menu.Label>
                {emailReviewStatusOptions.map((option) => (
                  <Menu.Item
                    key={option.value}
                    rightSection={
                      option.value === selectedEmail.review_status ? (
                        <CheckIcon aria-hidden="true" size={14} weight="bold" />
                      ) : null
                    }
                    onClick={(event) =>
                      handleReviewStatusSelect(event, option.value)
                    }
                  >
                    {formatEmailReviewStatus(option.value)}
                  </Menu.Item>
                ))}

                {commentedVersions.length > 0 ? (
                  <>
                    <Menu.Divider />
                    <Menu.Label>Open comments</Menu.Label>
                    <ScrollArea.Autosize mah={132} type="auto">
                      <Stack gap={5}>
                        {commentedVersions.map((email) => (
                          <button
                            className={styles.commentVersionRow}
                            key={email.id}
                            type="button"
                            onClick={(event) =>
                              handleCommentVersionClick(event, email.id)
                            }
                          >
                            <Group justify="space-between" gap={8} wrap="nowrap">
                              <Stack gap={1} className={styles.commentVersionText}>
                                <Text size="xs" fw={700} lineClamp={1}>
                                  {email.language.toUpperCase()}{" "}
                                  {formatVariantOptionLabel(
                                    email.variant,
                                    availableVariants
                                  )}
                                </Text>
                                <Text className={styles.commentVersionSubject} c="dimmed" lineClamp={1}>
                                  {email.subject ?? "No subject"}
                                </Text>
                              </Stack>

                              <Badge
                                className={styles.commentVersionBadge}
                                color="red"
                                size="xs"
                                variant="light"
                              >
                                {email.open_comment_count}
                              </Badge>
                            </Group>
                          </button>
                        ))}
                      </Stack>
                    </ScrollArea.Autosize>
                  </>
                ) : null}
              </Menu.Dropdown>
            </Menu>
          </Group>

          <Stack className={styles.emailCardCopy} gap={10}>
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
