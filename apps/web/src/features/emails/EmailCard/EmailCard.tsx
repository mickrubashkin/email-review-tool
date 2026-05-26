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

import type {
  EmailReviewStatus,
  EmailVariant,
  EmailVersionGroup,
} from "../types";
import {
  emailReviewStatusOptions,
  formatEmailReviewStatus,
} from "../reviewStatus";
import {
  getAvailableVariants,
  getAvailableAdaptations,
  getDefaultVersion,
  getSelectedAdaptation,
  getSelectedVariant,
  getVersionForVariant,
  getVersionsForVariantAndAdaptation,
} from "../stages";
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

function parseDateOnly(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }

  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day));
}

function formatDueDate(value: string) {
  const dueDate = parseDateOnly(value);
  if (!dueDate) {
    return value;
  }

  return dueDate.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function getDueDateTone(value: string) {
  const dueDate = parseDateOnly(value);
  if (!dueDate) {
    return undefined;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  dueDate.setHours(0, 0, 0, 0);

  const daysUntilDue = Math.round(
    (dueDate.getTime() - today.getTime()) / 86_400_000
  );

  if (daysUntilDue < 0) {
    return "overdue";
  }
  if (daysUntilDue <= 2) {
    return "soon";
  }

  return undefined;
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
  const openBlockingCommentCount = emailGroup.versions.reduce(
    (count, email) => count + (email.open_blocking_comment_count ?? 0),
    0
  );
  const selectedEmailApprovalBlocked =
    selectedEmail.review_status !== "approved" &&
    (selectedEmail.open_blocking_comment_count ?? 0) > 0;
  const commentedVersions = emailGroup.versions.filter(
    (email) => (email.open_comment_count ?? 0) > 0
  );
  const dueDateTone = selectedEmail.due_date
    ? getDueDateTone(selectedEmail.due_date)
    : undefined;

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
    if (reviewStatus === "approved" && selectedEmailApprovalBlocked) {
      return;
    }
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
                color={openBlockingCommentCount > 0 ? "red" : "yellow"}
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
              width={190}
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
                <Menu.Sub position="right-start">
                  <Menu.Sub.Target>
                    <Menu.Sub.Item
                      rightSection={
                        <Text className={styles.cardMenuValue}>
                          {selectedEmail.language.toUpperCase()}
                        </Text>
                      }
                    >
                      Language
                    </Menu.Sub.Item>
                  </Menu.Sub.Target>
                  <Menu.Sub.Dropdown className={styles.cardMenuSubDropdown}>
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
                  </Menu.Sub.Dropdown>
                </Menu.Sub>

                <Menu.Sub position="right-start">
                  <Menu.Sub.Target>
                    <Menu.Sub.Item
                      rightSection={
                        <Text className={styles.cardMenuValue}>
                          {formatVariantOptionLabel(
                            selectedVariant,
                            availableVariants
                          )}
                        </Text>
                      }
                    >
                      Version
                    </Menu.Sub.Item>
                  </Menu.Sub.Target>
                  <Menu.Sub.Dropdown className={styles.cardMenuSubDropdown}>
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
                  </Menu.Sub.Dropdown>
                </Menu.Sub>

                <Menu.Sub position="right-start">
                  <Menu.Sub.Target>
                    <Menu.Sub.Item
                      rightSection={
                        <Text className={styles.cardMenuValue} lineClamp={1}>
                          {selectedEmail.adaptation_label}
                        </Text>
                      }
                    >
                      Adaptation
                    </Menu.Sub.Item>
                  </Menu.Sub.Target>
                  <Menu.Sub.Dropdown className={styles.cardMenuSubDropdown}>
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
                  </Menu.Sub.Dropdown>
                </Menu.Sub>

                <Menu.Sub position="right-start">
                  <Menu.Sub.Target>
                    <Menu.Sub.Item
                      rightSection={
                        <Text className={styles.cardMenuValue} lineClamp={1}>
                          {formatEmailReviewStatus(selectedEmail.review_status)}
                        </Text>
                      }
                    >
                      Status
                    </Menu.Sub.Item>
                  </Menu.Sub.Target>
                  <Menu.Sub.Dropdown className={styles.cardMenuSubDropdown}>
                    {emailReviewStatusOptions.map((option) => (
                      <Menu.Item
                        disabled={
                          option.value === "approved" &&
                          selectedEmailApprovalBlocked
                        }
                        key={option.value}
                        rightSection={
                          option.value === selectedEmail.review_status ? (
                            <CheckIcon aria-hidden="true" size={14} weight="bold" />
                          ) : option.value === "approved" &&
                            selectedEmailApprovalBlocked ? (
                            <Text c="red" size="xs">
                              Resolve blockers
                            </Text>
                          ) : null
                        }
                        onClick={(event) =>
                          handleReviewStatusSelect(event, option.value)
                        }
                      >
                        {formatEmailReviewStatus(option.value)}
                      </Menu.Item>
                    ))}
                  </Menu.Sub.Dropdown>
                </Menu.Sub>

                <Menu.Divider />

                <Menu.Item
                  rightSection={
                    <Text className={styles.cardMenuValue} lineClamp={1}>
                      {selectedEmail.owner_email ?? "Unassigned"}
                    </Text>
                  }
                >
                  Owner
                </Menu.Item>
                <Menu.Item
                  rightSection={
                    <Text className={styles.cardMenuValue} lineClamp={1}>
                      {selectedEmail.reviewer_email ?? "Unassigned"}
                    </Text>
                  }
                >
                  Reviewer
                </Menu.Item>
                <Menu.Item
                  rightSection={
                    <Text
                      className={styles.cardMenuValue}
                      data-tone={dueDateTone}
                      lineClamp={1}
                    >
                      {selectedEmail.due_date
                        ? formatDueDate(selectedEmail.due_date)
                        : "None"}
                    </Text>
                  }
                >
                  Due date
                </Menu.Item>

                {commentedVersions.length > 0 ? (
                  <Menu.Sub position="right-start">
                    <Menu.Sub.Target>
                      <Menu.Sub.Item
                        rightSection={
                          <Badge
                            color={openBlockingCommentCount > 0 ? "red" : "yellow"}
                            size="xs"
                            variant="light"
                          >
                            {openBlockingCommentCount > 0
                              ? `${openBlockingCommentCount} blocking`
                              : openCommentCount}
                          </Badge>
                        }
                      >
                        Open comments
                      </Menu.Sub.Item>
                    </Menu.Sub.Target>
                    <Menu.Sub.Dropdown className={styles.cardMenuCommentsDropdown}>
                      <ScrollArea.Autosize mah={156} type="auto">
                        <Stack gap={0}>
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
                                  <Text
                                    className={styles.commentVersionSubject}
                                    c="dimmed"
                                    lineClamp={1}
                                  >
                                    {email.subject ?? "No subject"}
                                  </Text>
                                </Stack>

                                <Badge
                                  className={styles.commentVersionBadge}
                                  color={
                                    (email.open_blocking_comment_count ?? 0) > 0
                                      ? "red"
                                      : "yellow"
                                  }
                                  size="xs"
                                  variant="light"
                                >
                                  {(email.open_blocking_comment_count ?? 0) > 0
                                    ? `${email.open_blocking_comment_count} blocking`
                                    : email.open_comment_count}
                                </Badge>
                              </Group>
                            </button>
                          ))}
                        </Stack>
                      </ScrollArea.Autosize>
                    </Menu.Sub.Dropdown>
                  </Menu.Sub>
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

export default EmailCard;
