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

import { fetchOperationalEvents } from "../../emails/api";
import type {
  OperationalEventFilters,
  OperationalEventItem,
} from "../../emails/types";
import styles from "../../auth-events/AuthEvents/AuthEvents.module.css";

const limitOptions = ["50", "100", "250", "500"];
const levelOptions = [
  { value: "error", label: "Error" },
  { value: "warn", label: "Warning" },
  { value: "info", label: "Info" },
];
const eventTypeOptions = [
  { value: "api_request_failed", label: "API request failed" },
  { value: "server_starting", label: "Server starting" },
  { value: "seed_started", label: "Seed started" },
  { value: "seed_completed", label: "Seed completed" },
  { value: "seed_delete_stale_enabled", label: "Seed prune enabled" },
  { value: "ai_analysis_failed", label: "AI analysis failed" },
  { value: "ai_analysis_log_failed", label: "AI log failed" },
  { value: "ai_cache_read_failed", label: "AI cache read failed" },
  { value: "ai_cache_write_failed", label: "AI cache write failed" },
];
type SortDirection = "asc" | "desc";
type OperationalEventSortKey =
  | "created_at"
  | "level"
  | "event_type"
  | "user_email"
  | "path"
  | "status_code"
  | "duration_ms";

const defaultSort = {
  direction: "desc" as SortDirection,
  key: "created_at" as OperationalEventSortKey,
};

export function OperationalEvents() {
  const [filters, setFilters] = useState<OperationalEventFilters>({
    limit: "100",
  });
  const [sort, setSort] = useState(defaultSort);

  const eventsQuery = useQuery({
    queryKey: ["operational-events", filters],
    queryFn: () => fetchOperationalEvents(filters),
  });

  const events = useMemo(
    () => sortItems(eventsQuery.data ?? [], sort),
    [eventsQuery.data, sort]
  );
  const visibleFilters = useMemo(
    () => ({
      event_type: filters.event_type ?? "",
      level: filters.level ?? "",
      limit: filters.limit ?? "100",
      path: filters.path ?? "",
      request_id: filters.request_id ?? "",
      user_email: filters.user_email ?? "",
    }),
    [filters]
  );

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Stack gap={4}>
          <Title order={2}>Operational events</Title>
          <Text c="dimmed" size="sm">
            System events, failed API requests, and operational errors.
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
          <Select
            clearable
            data={levelOptions}
            label="Level"
            placeholder="All levels"
            value={visibleFilters.level || null}
            onChange={(value) =>
              setFilters((current) => ({ ...current, level: value ?? "" }))
            }
          />
          <Select
            clearable
            data={eventTypeOptions}
            label="Event"
            placeholder="All events"
            value={visibleFilters.event_type || null}
            onChange={(value) =>
              setFilters((current) => ({
                ...current,
                event_type: value ?? "",
              }))
            }
          />
          <TextInput
            label="User"
            placeholder="admin@example.com"
            value={visibleFilters.user_email}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                user_email: event.currentTarget.value,
              }))
            }
          />
          <TextInput
            label="Path"
            placeholder="/api/emails"
            value={visibleFilters.path}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                path: event.currentTarget.value,
              }))
            }
          />
          <TextInput
            label="Request ID"
            placeholder="request id"
            value={visibleFilters.request_id}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                request_id: event.currentTarget.value,
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
            <Text c="dimmed">Loading operational events</Text>
          </Stack>
        ) : null}

        {eventsQuery.isError ? (
          <Alert color="red" title="Failed to load operational events">
            Admin access is required.
          </Alert>
        ) : null}

        {eventsQuery.isSuccess && events.length === 0 ? (
          <Stack align="center" justify="center" h={240}>
            <Text fw={600}>No operational events found</Text>
            <Text c="dimmed" size="sm">
              Try changing filters or wait for a new system event.
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
                  <SortableTh label="Created" sort={sort} sortKey="created_at" onSort={setSort} />
                  <SortableTh label="Level" sort={sort} sortKey="level" onSort={setSort} />
                  <SortableTh label="Event" sort={sort} sortKey="event_type" onSort={setSort} />
                  <SortableTh label="User" sort={sort} sortKey="user_email" onSort={setSort} />
                  <SortableTh label="Path" sort={sort} sortKey="path" onSort={setSort} />
                  <SortableTh label="Status" sort={sort} sortKey="status_code" onSort={setSort} />
                  <SortableTh label="Duration" sort={sort} sortKey="duration_ms" onSort={setSort} />
                  <Table.Th>Message</Table.Th>
                  <Table.Th>Request ID</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {events.map((event) => (
                  <Table.Tr key={event.id}>
                    <Table.Td>{formatDateTime(event.created_at)}</Table.Td>
                    <Table.Td>
                      <Badge color={levelColor(event.level)} variant="light">
                        {event.level}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Badge variant="light">{formatEventType(event.event_type)}</Badge>
                    </Table.Td>
                    <Table.Td>{event.user_email ?? "-"}</Table.Td>
                    <Table.Td className={styles.monoCell}>
                      {formatRequestTarget(event)}
                    </Table.Td>
                    <Table.Td>{event.status_code ?? "-"}</Table.Td>
                    <Table.Td>{formatDuration(event.duration_ms)}</Table.Td>
                    <Table.Td>
                      <Text lineClamp={2} size="sm">
                        {event.message}
                      </Text>
                    </Table.Td>
                    <Table.Td className={styles.monoCell}>
                      {event.request_id ?? "-"}
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

export default OperationalEvents;

function SortableTh({
  label,
  onSort,
  sort,
  sortKey,
}: {
  label: string;
  onSort: (sort: { direction: SortDirection; key: OperationalEventSortKey }) => void;
  sort: { direction: SortDirection; key: OperationalEventSortKey };
  sortKey: OperationalEventSortKey;
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
  items: OperationalEventItem[],
  sort: { direction: SortDirection; key: OperationalEventSortKey }
) {
  return [...items].sort((first, second) => {
    const result = compareValues(sortValue(first, sort.key), sortValue(second, sort.key));
    return sort.direction === "asc" ? result : -result;
  });
}

function sortValue(event: OperationalEventItem, key: OperationalEventSortKey) {
  return event[key] ?? "";
}

function compareValues(first: unknown, second: unknown) {
  if (typeof first === "number" && typeof second === "number") {
    return first - second;
  }
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

function levelColor(level: OperationalEventItem["level"]) {
  switch (level) {
    case "error":
      return "red";
    case "warn":
      return "yellow";
    default:
      return "blue";
  }
}

function formatEventType(eventType: string) {
  return eventType.replaceAll("_", " ");
}

function formatRequestTarget(event: OperationalEventItem) {
  if (!event.method && !event.path) {
    return "-";
  }
  return [event.method, event.path].filter(Boolean).join(" ");
}

function formatDuration(durationMS: number | null) {
  return typeof durationMS === "number" ? `${durationMS} ms` : "-";
}
