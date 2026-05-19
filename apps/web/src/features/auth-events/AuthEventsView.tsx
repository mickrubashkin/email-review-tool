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

import { fetchAuthEvents } from "../emails/api";
import type { AuthEventFilters, AuthEventItem } from "../emails/types";
import styles from "./AuthEventsView.module.css";

const limitOptions = ["50", "100", "250", "500"];
const eventTypeOptions = [
  { value: "otp_requested", label: "OTP requested" },
  { value: "otp_login", label: "OTP login" },
  { value: "failed_otp", label: "Failed OTP" },
  { value: "logout", label: "Logout" },
];
type SortDirection = "asc" | "desc";
type AuthEventSortKey = keyof Pick<
  AuthEventItem,
  "created_at" | "email" | "event_type" | "success" | "ip_address" | "user_agent"
>;

const defaultSort = {
  direction: "desc" as SortDirection,
  key: "created_at" as AuthEventSortKey,
};

export function AuthEventsView() {
  const [filters, setFilters] = useState<AuthEventFilters>({
    limit: "100",
  });
  const [sort, setSort] = useState(defaultSort);

  const eventsQuery = useQuery({
    queryKey: ["auth-events", filters],
    queryFn: () => fetchAuthEvents(filters),
  });

  const events = useMemo(
    () => sortItems(eventsQuery.data ?? [], sort),
    [eventsQuery.data, sort]
  );
  const visibleFilters = useMemo(
    () => ({
      email: filters.email ?? "",
      event_type: filters.event_type ?? "",
      limit: filters.limit ?? "100",
      success: filters.success ?? "",
    }),
    [filters]
  );

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Stack gap={4}>
          <Title order={2}>Auth events</Title>
          <Text c="dimmed" size="sm">
            Login, logout, and one-time code audit trail.
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
            label="Email"
            placeholder="user@alaio.com"
            value={visibleFilters.email}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                email: event.currentTarget.value,
              }))
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
          <Select
            clearable
            data={[
              { value: "true", label: "Success" },
              { value: "false", label: "Failed" },
            ]}
            label="Result"
            placeholder="All results"
            value={visibleFilters.success || null}
            onChange={(value) =>
              setFilters((current) => ({ ...current, success: value ?? "" }))
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
            <Text c="dimmed">Loading auth events</Text>
          </Stack>
        ) : null}

        {eventsQuery.isError ? (
          <Alert color="red" title="Failed to load auth events">
            Admin access is required.
          </Alert>
        ) : null}

        {eventsQuery.isSuccess && events.length === 0 ? (
          <Stack align="center" justify="center" h={240}>
            <Text fw={600}>No auth events found</Text>
            <Text c="dimmed" size="sm">
              Try changing filters or signing in again.
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
                  <SortableTh label="Email" sortKey="email" sort={sort} onSort={setSort} />
                  <SortableTh label="Event" sortKey="event_type" sort={sort} onSort={setSort} />
                  <SortableTh label="Result" sortKey="success" sort={sort} onSort={setSort} />
                  <SortableTh label="IP" sortKey="ip_address" sort={sort} onSort={setSort} />
                  <SortableTh label="User agent" sortKey="user_agent" sort={sort} onSort={setSort} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {events.map((event) => (
                  <Table.Tr key={event.id}>
                    <Table.Td>{formatDateTime(event.created_at)}</Table.Td>
                    <Table.Td>{event.email}</Table.Td>
                    <Table.Td>
                      <Badge variant="light">{formatEventType(event.event_type)}</Badge>
                    </Table.Td>
                    <Table.Td>
                      <Badge color={event.success ? "green" : "red"} variant="light">
                        {event.success ? "success" : "failed"}
                      </Badge>
                    </Table.Td>
                    <Table.Td className={styles.monoCell}>
                      {event.ip_address ?? "-"}
                    </Table.Td>
                    <Table.Td className={styles.userAgentCell}>
                      <Text c="dimmed" lineClamp={2} size="sm">
                        {event.user_agent ?? "-"}
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
  onSort: (sort: { direction: SortDirection; key: AuthEventSortKey }) => void;
  sort: { direction: SortDirection; key: AuthEventSortKey };
  sortKey: AuthEventSortKey;
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
  items: AuthEventItem[],
  sort: { direction: SortDirection; key: AuthEventSortKey }
) {
  return [...items].sort((first, second) => {
    const result = compareValues(first[sort.key], second[sort.key]);
    return sort.direction === "asc" ? result : -result;
  });
}

function compareValues(first: unknown, second: unknown) {
  if (typeof first === "boolean" && typeof second === "boolean") {
    return Number(first) - Number(second);
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

function formatEventType(eventType: AuthEventItem["event_type"]) {
  return eventType.replaceAll("_", " ");
}
