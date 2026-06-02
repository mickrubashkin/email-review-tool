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
const sortKeys: readonly OperationalEventSortKey[] = [
  "created_at",
  "level",
  "event_type",
  "user_email",
  "path",
  "status_code",
  "duration_ms",
];
const emptyOperationalEvents: OperationalEventItem[] = [];

export function OperationalEvents() {
  const [filters, setFilters] = useState<OperationalEventFilters>({
    limit: "100",
  });
  const [sort, setSort] = usePersistedSort(
    "reviewdesk:admin-table-sort:operational-events",
    defaultSort,
    sortKeys
  );
  const [columnSizing, setColumnSizing] = usePersistedColumnSizing(
    "reviewdesk:admin-table-column-sizing:operational-events"
  );

  const eventsQuery = useQuery({
    queryKey: ["operational-events", filters],
    queryFn: () => fetchOperationalEvents(filters),
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
    data: eventsQuery.data ?? emptyOperationalEvents,
    enableColumnResizing: true,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onColumnSizingChange: setColumnSizing,
    onSortingChange: (updater) => {
      const nextSorting =
        typeof updater === "function" ? updater(sorting) : updater;
      const nextSort = nextSorting[0];
      if (!nextSort || !sortKeys.includes(nextSort.id as OperationalEventSortKey)) {
        setSort(defaultSort);
        return;
      }
      setSort({
        direction: nextSort.desc ? "desc" : "asc",
        key: nextSort.id as OperationalEventSortKey,
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
      <AdminTableHeader
        subtitle="System events, failed API requests, and operational errors."
        title="Operational events"
      />

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

        {eventsQuery.isSuccess && rows.length === 0 ? (
          <Stack align="center" justify="center" h={240}>
            <Text fw={600}>No operational events found</Text>
            <Text c="dimmed" size="sm">
              Try changing filters or wait for a new system event.
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

export default OperationalEvents;

function buildColumns(): ColumnDef<OperationalEventItem>[] {
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
      accessorKey: "level",
      cell: ({ row }) => (
        <Badge color={levelColor(row.original.level)} variant="light">
          {row.original.level}
        </Badge>
      ),
      header: "Level",
      id: "level",
      maxSize: 150,
      minSize: 90,
      size: 110,
    },
    {
      accessorKey: "event_type",
      cell: ({ row }) => (
        <Badge variant="light">{formatEventType(row.original.event_type)}</Badge>
      ),
      header: "Event",
      id: "event_type",
      maxSize: 320,
      minSize: 160,
      size: 220,
    },
    {
      accessorKey: "user_email",
      cell: ({ row }) => row.original.user_email ?? "-",
      header: "User",
      id: "user_email",
      maxSize: 360,
      minSize: 160,
      size: 220,
    },
    {
      accessorFn: formatRequestTarget,
      cell: ({ row }) => (
        <span className={styles.monoCell}>
          {formatRequestTarget(row.original)}
        </span>
      ),
      header: "Path",
      id: "path",
      maxSize: 420,
      minSize: 180,
      size: 240,
    },
    {
      accessorKey: "status_code",
      cell: ({ row }) => row.original.status_code ?? "-",
      header: "Status",
      id: "status_code",
      maxSize: 160,
      minSize: 90,
      size: 100,
    },
    {
      accessorKey: "duration_ms",
      cell: ({ row }) => formatDuration(row.original.duration_ms),
      header: "Duration",
      id: "duration_ms",
      maxSize: 180,
      minSize: 100,
      size: 120,
    },
    {
      accessorKey: "message",
      cell: ({ row }) => (
        <Text lineClamp={2} size="sm">
          {row.original.message}
        </Text>
      ),
      enableSorting: false,
      header: "Message",
      id: "message",
      maxSize: 640,
      minSize: 240,
      size: 340,
    },
    {
      accessorKey: "request_id",
      cell: ({ row }) => (
        <span className={styles.monoCell}>{row.original.request_id ?? "-"}</span>
      ),
      enableSorting: false,
      header: "Request ID",
      id: "request_id",
      maxSize: 360,
      minSize: 160,
      size: 220,
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
