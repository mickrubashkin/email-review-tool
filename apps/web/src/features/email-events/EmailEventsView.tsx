import { useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  ScrollArea,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { HouseIcon } from "@phosphor-icons/react";
import { Link } from "react-router-dom";

import { fetchEmailEvents } from "../emails/api";
import { formatEmailReviewStatus } from "../emails/reviewStatus";
import type {
  EmailEventAction,
  EmailEventFilters,
  EmailEventItem,
} from "../emails/types";
import styles from "../auth-events/AuthEventsView.module.css";

const limitOptions = ["50", "100", "250", "500"];
const actionOptions: { value: EmailEventAction; label: string }[] = [
  { value: "email_updated", label: "Updated" },
  { value: "email_duplicated", label: "Duplicated" },
  { value: "email_adaptation_created", label: "Adaptation created" },
  { value: "email_archived", label: "Archived" },
  { value: "email_created", label: "Created" },
  { value: "email_review_status_updated", label: "Review status updated" },
];
type SortDirection = "asc" | "desc";
type EmailEventSortKey =
  | "created_at"
  | "actor_email"
  | "action"
  | "email"
  | "summary"
  | "changed_fields";
const defaultSort = {
  direction: "desc" as SortDirection,
  key: "created_at" as EmailEventSortKey,
};

export function EmailEventsView() {
  const [filters, setFilters] = useState<EmailEventFilters>({
    limit: "100",
  });
  const [sort, setSort] = useState(defaultSort);

  const eventsQuery = useQuery({
    queryKey: ["email-events", filters],
    queryFn: () => fetchEmailEvents(filters),
  });

  const events = useMemo(
    () => sortItems(eventsQuery.data ?? [], sort),
    [eventsQuery.data, sort]
  );
  const visibleFilters = useMemo(
    () => ({
      action: filters.action ?? "",
      actor_email: filters.actor_email ?? "",
      email: filters.email ?? "",
      limit: filters.limit ?? "100",
    }),
    [filters]
  );

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Stack gap={4}>
          <Title order={2}>Email events</Title>
          <Text c="dimmed" size="sm">
            Admin changes to email content and lifecycle.
          </Text>
        </Stack>
        <Button
          component={Link}
          leftSection={<HouseIcon aria-hidden="true" size={16} />}
          to="/"
          variant="light"
        >
          Home
        </Button>
      </header>

      <section className={styles.filters}>
        <Group align="end" gap="sm">
          <TextInput
            label="Actor"
            placeholder="admin@example.com"
            value={visibleFilters.actor_email}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                actor_email: event.currentTarget.value,
              }))
            }
          />
          <Select
            clearable
            data={actionOptions}
            label="Action"
            placeholder="All actions"
            value={visibleFilters.action || null}
            onChange={(value) =>
              setFilters((current) => ({
                ...current,
                action: value ?? "",
              }))
            }
          />
          <TextInput
            label="Email"
            placeholder="Title or slug"
            value={visibleFilters.email}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                email: event.currentTarget.value,
              }))
            }
          />
          <Select
            data={limitOptions}
            label="Limit"
            value={visibleFilters.limit}
            onChange={(value) =>
              setFilters((current) => ({ ...current, limit: value ?? "100" }))
            }
          />
          <Button variant="light" onClick={() => setFilters({ limit: "100" })}>
            Reset
          </Button>
        </Group>
      </section>

      <section className={styles.tableShell}>
        {eventsQuery.isLoading ? (
          <Stack align="center" justify="center" h={240}>
            <Loader />
            <Text c="dimmed">Loading email events</Text>
          </Stack>
        ) : null}

        {eventsQuery.isError ? (
          <Alert color="red" title="Failed to load email events">
            Super admin access is required.
          </Alert>
        ) : null}

        {eventsQuery.isSuccess && events.length === 0 ? (
          <Stack align="center" justify="center" h={240}>
            <Text fw={600}>No email events found</Text>
            <Text c="dimmed" size="sm">
              Try changing filters or editing an email.
            </Text>
          </Stack>
        ) : null}

        {eventsQuery.isSuccess && events.length > 0 ? (
          <ScrollArea type="auto">
            <Table
              className={styles.table}
              highlightOnHover
              horizontalSpacing="md"
              verticalSpacing="sm"
            >
              <Table.Thead>
                <Table.Tr>
                  <SortableTh label="Created" sortKey="created_at" sort={sort} onSort={setSort} />
                  <SortableTh label="Actor" sortKey="actor_email" sort={sort} onSort={setSort} />
                  <SortableTh label="Action" sortKey="action" sort={sort} onSort={setSort} />
                  <SortableTh label="Email" sortKey="email" sort={sort} onSort={setSort} />
                  <SortableTh label="Summary" sortKey="summary" sort={sort} onSort={setSort} />
                  <SortableTh label="Changed fields" sortKey="changed_fields" sort={sort} onSort={setSort} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {events.map((event) => (
                  <Table.Tr key={event.id}>
                    <Table.Td>{formatDateTime(event.created_at)}</Table.Td>
                    <Table.Td>{event.actor_email}</Table.Td>
                    <Table.Td>
                      <Badge color={getActionColor(event.action)} variant="light">
                        {formatAction(event.action)}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Stack gap={0}>
                        <Text size="sm">{event.email_title ?? "-"}</Text>
                        <Text c="dimmed" className={styles.monoCell}>
                          {event.email_slug ?? event.email_id ?? "-"}
                        </Text>
                      </Stack>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{formatSummary(event)}</Text>
                    </Table.Td>
                    <Table.Td>
                      <Text c="dimmed" size="sm">
                        {formatChangedFields(event)}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        ) : null}
      </section>
    </div>
  );
}

function SortableTh({
  label,
  onSort,
  sort,
  sortKey,
}: {
  label: string;
  onSort: (sort: { direction: SortDirection; key: EmailEventSortKey }) => void;
  sort: { direction: SortDirection; key: EmailEventSortKey };
  sortKey: EmailEventSortKey;
}) {
  const isActive = sort.key === sortKey;
  return (
    <Table.Th>
      <button
        className={styles.sortButton}
        type="button"
        onClick={() =>
          onSort({
            key: sortKey,
            direction: isActive && sort.direction === "asc" ? "desc" : "asc",
          })
        }
      >
        {label}
        <span className={styles.sortIndicator}>
          {isActive ? (sort.direction === "asc" ? "↑" : "↓") : ""}
        </span>
      </button>
    </Table.Th>
  );
}

function sortItems(
  items: EmailEventItem[],
  sort: { direction: SortDirection; key: EmailEventSortKey }
) {
  return [...items].sort((first, second) => {
    const result = compareValues(sortValue(first, sort.key), sortValue(second, sort.key));
    return sort.direction === "asc" ? result : -result;
  });
}

function sortValue(event: EmailEventItem, key: EmailEventSortKey) {
  switch (key) {
    case "email":
      return event.email_title ?? event.email_slug ?? event.email_id ?? "";
    case "summary":
      return formatSummary(event);
    case "changed_fields":
      return formatChangedFields(event);
    default:
      return event[key];
  }
}

function compareValues(first: unknown, second: unknown) {
  return String(first ?? "").localeCompare(String(second ?? ""), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatAction(action: EmailEventAction) {
  return action.replace("email_", "").replaceAll("_", " ");
}

function getActionColor(action: EmailEventAction) {
  switch (action) {
    case "email_archived":
      return "red";
    case "email_duplicated":
      return "blue";
    case "email_adaptation_created":
      return "teal";
    case "email_created":
      return "green";
    case "email_updated":
      return "yellow";
    case "email_review_status_updated":
      return "violet";
    default:
      return "gray";
  }
}

function formatSummary(event: EmailEventItem) {
  switch (event.action) {
    case "email_duplicated":
      return `Duplicated from ${stringMetadata(event, "source_slug") || "source email"}`;
    case "email_adaptation_created":
      return `Adaptation ${stringMetadata(event, "adaptation_label") || "created"} from ${stringMetadata(event, "source_slug") || "source email"}`;
    case "email_archived":
      return "Archived from the active board";
    case "email_created":
      return "Created email";
    case "email_updated":
      return "Updated editable content";
    case "email_review_status_updated":
      return `Changed review status to ${formatChangedReviewStatus(event)}`;
    default:
      return "Changed email";
  }
}

function formatChangedFields(event: EmailEventItem) {
  if (event.action !== "email_updated" && event.action !== "email_review_status_updated") {
    return "-";
  }

  const fields = Object.keys(event.changes);
  const editableFields = event.changes.editable_fields;
  if (isRecord(editableFields)) {
    const editableFieldsIndex = fields.indexOf("editable_fields");
    if (editableFieldsIndex >= 0) {
      fields.splice(editableFieldsIndex, 1);
    }
    fields.push(
      ...Object.keys(editableFields).map((field) => `editable_fields.${field}`)
    );
  }

  return fields.length > 0 ? fields.join(", ") : "-";
}

function formatChangedReviewStatus(event: EmailEventItem) {
  const reviewStatus = event.changes.review_status;
  if (!isRecord(reviewStatus)) {
    return "new value";
  }

  const nextStatus = reviewStatus.after;
  return typeof nextStatus === "string"
    ? formatEmailReviewStatus(nextStatus)
    : "new value";
}

function stringMetadata(event: EmailEventItem, key: string) {
  const value = event.metadata[key];
  return typeof value === "string" ? value : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
