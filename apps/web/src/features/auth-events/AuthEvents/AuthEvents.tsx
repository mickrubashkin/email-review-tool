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
} from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";

import { AdminTableHeader } from "../../admin-table/AdminTableHeader";
import { usePersistedColumnSizing } from "../../admin-table/usePersistedColumnSizing";
import { usePersistedSort } from "../../admin-table/usePersistedSort";
import { fetchAuthEvents } from "../../emails/api";
import type { AuthEventFilters, AuthEventItem } from "../../emails/types";
import styles from "./AuthEvents.module.css";

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
const sortKeys: readonly AuthEventSortKey[] = [
  "created_at",
  "email",
  "event_type",
  "success",
  "ip_address",
  "user_agent",
];
const emptyAuthEvents: AuthEventItem[] = [];

export function AuthEvents() {
  const [filters, setFilters] = useState<AuthEventFilters>({
    limit: "100",
  });
  const [sort, setSort] = usePersistedSort(
    "reviewdesk:admin-table-sort:auth-events",
    defaultSort,
    sortKeys
  );
  const [columnSizing, setColumnSizing] = usePersistedColumnSizing(
    "reviewdesk:admin-table-column-sizing:auth-events"
  );

  const eventsQuery = useQuery({
    queryKey: ["auth-events", filters],
    queryFn: () => fetchAuthEvents(filters),
    placeholderData: (previous) => previous,
  });

  const columns = useMemo(() => buildColumns(), []);
  const sorting = useMemo<SortingState>(
    () => [{ desc: sort.direction === "desc", id: sort.key }],
    [sort]
  );
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    columnResizeMode: "onChange",
    columns,
    data: eventsQuery.data ?? emptyAuthEvents,
    enableColumnResizing: true,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onColumnSizingChange: setColumnSizing,
    onSortingChange: (updater) => {
      const nextSorting =
        typeof updater === "function" ? updater(sorting) : updater;
      const nextSort = nextSorting[0];
      if (!nextSort || !sortKeys.includes(nextSort.id as AuthEventSortKey)) {
        setSort(defaultSort);
        return;
      }
      setSort({
        direction: nextSort.desc ? "desc" : "asc",
        key: nextSort.id as AuthEventSortKey,
      });
    },
    state: {
      columnSizing,
      sorting,
    },
  });
  const rows = table.getRowModel().rows;
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
      <AdminTableHeader
        subtitle="Login, logout, and one-time code audit trail."
        title="Auth events"
      />

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

        {eventsQuery.isSuccess && rows.length === 0 ? (
          <Stack align="center" justify="center" h={240}>
            <Text fw={600}>No auth events found</Text>
            <Text c="dimmed" size="sm">
              Try changing filters or signing in again.
            </Text>
          </Stack>
        ) : null}

        {eventsQuery.isSuccess && rows.length > 0 ? (
          <ScrollArea type="auto">
            <Table
              className={styles.table}
              highlightOnHover
              horizontalSpacing="md"
              style={{ width: table.getTotalSize() }}
              verticalSpacing="sm"
            >
              <Table.Thead>
                {table.getHeaderGroups().map((headerGroup) => (
                  <Table.Tr key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <Table.Th
                        className={styles.resizableTh}
                        key={header.id}
                        style={{ width: header.getSize() }}
                      >
                        {header.isPlaceholder ? null : (
                          <button
                            className={styles.sortButton}
                            type="button"
                            onClick={header.column.getToggleSortingHandler()}
                          >
                            {flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                            <span className={styles.sortIndicator}>
                              {formatSortIndicator(header.column.getIsSorted())}
                            </span>
                          </button>
                        )}
                        {header.column.getCanResize() ? (
                          <button
                            aria-label={`Resize ${header.column.columnDef.header} column`}
                            className={styles.resizeHandle}
                            type="button"
                            onDoubleClick={() => header.column.resetSize()}
                            onMouseDown={header.getResizeHandler()}
                            onTouchStart={header.getResizeHandler()}
                          />
                        ) : null}
                      </Table.Th>
                    ))}
                  </Table.Tr>
                ))}
              </Table.Thead>
              <Table.Tbody>
                {rows.map((row) => (
                  <Table.Tr key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <Table.Td
                        key={cell.id}
                        style={{ width: cell.column.getSize() }}
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </Table.Td>
                    ))}
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

export default AuthEvents;

function buildColumns(): ColumnDef<AuthEventItem>[] {
  return [
    {
      accessorKey: "created_at",
      cell: ({ row }) => formatDateTime(row.original.created_at),
      header: "Created",
      id: "created_at",
      maxSize: 260,
      minSize: 130,
      size: 170,
    },
    {
      accessorKey: "email",
      cell: ({ row }) => row.original.email,
      header: "Email",
      id: "email",
      maxSize: 360,
      minSize: 180,
      size: 240,
    },
    {
      accessorKey: "event_type",
      cell: ({ row }) => (
        <Badge variant="light">{formatEventType(row.original.event_type)}</Badge>
      ),
      header: "Event",
      id: "event_type",
      maxSize: 260,
      minSize: 140,
      size: 180,
    },
    {
      accessorKey: "success",
      cell: ({ row }) => (
        <Badge color={row.original.success ? "green" : "red"} variant="light">
          {row.original.success ? "success" : "failed"}
        </Badge>
      ),
      header: "Result",
      id: "success",
      maxSize: 160,
      minSize: 100,
      size: 110,
    },
    {
      accessorKey: "ip_address",
      cell: ({ row }) => (
        <span className={styles.monoCell}>{row.original.ip_address ?? "-"}</span>
      ),
      header: "IP",
      id: "ip_address",
      maxSize: 220,
      minSize: 120,
      size: 150,
    },
    {
      accessorKey: "user_agent",
      cell: ({ row }) => (
        <Text
          c="dimmed"
          className={styles.userAgentCell}
          lineClamp={2}
          size="sm"
        >
          {row.original.user_agent ?? "-"}
        </Text>
      ),
      header: "User agent",
      id: "user_agent",
      maxSize: 720,
      minSize: 280,
      size: 440,
    },
  ];
}

function formatSortIndicator(sortState: false | "asc" | "desc") {
  if (sortState === "asc") {
    return "↑";
  }
  if (sortState === "desc") {
    return "↓";
  }
  return "";
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
