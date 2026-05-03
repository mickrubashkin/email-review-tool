import { useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  ScrollArea,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  Code,
} from "@mantine/core";
import { useQuery } from "@tanstack/react-query";

import { fetchAIAnalysisLogs } from "../emails/api";
import type { AIAnalysisLogFilters, AIAnalysisLogItem } from "../emails/types";
import styles from "./AIAnalysisLogsView.module.css";

const limitOptions = ["50", "100", "250", "500"];
const cacheStatusOptions = [
  { value: "hit", label: "Hit" },
  { value: "miss", label: "Miss" },
  { value: "unknown", label: "Unknown" },
];

export function AIAnalysisLogsView() {
  const [filters, setFilters] = useState<AIAnalysisLogFilters>({
    limit: "100",
  });
  const [selectedErrorLog, setSelectedErrorLog] =
    useState<AIAnalysisLogItem | null>(null);

  const logsQuery = useQuery({
    queryKey: ["ai-analysis-logs", filters],
    queryFn: () => fetchAIAnalysisLogs(filters),
  });

  const logs = useMemo(() => logsQuery.data ?? [], [logsQuery.data]);
  const summary = useMemo(() => buildCacheSummary(logs), [logs]);
  const visibleFilters = useMemo(
    () => ({
      cache_status: filters.cache_status ?? "",
      email_id: filters.email_id ?? "",
      limit: filters.limit ?? "100",
      model: filters.model ?? "",
      status: filters.status ?? "",
    }),
    [filters]
  );

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Stack gap={4}>
          <Title order={2}>AI analysis logs</Title>
          <Text c="dimmed" size="sm">
            Stored request metrics and errors from ai_analysis_logs.
          </Text>
        </Stack>
      </header>

      <section className={styles.filters}>
        <Group align="end" gap="sm">
          <Select
            clearable
            data={[
              { value: "success", label: "Success" },
              { value: "error", label: "Error" },
            ]}
            label="Status"
            placeholder="All statuses"
            value={visibleFilters.status || null}
            onChange={(value) =>
              setFilters((current) => ({ ...current, status: value ?? "" }))
            }
          />
          <Select
            clearable
            data={cacheStatusOptions}
            label="Cache"
            placeholder="All cache states"
            value={visibleFilters.cache_status || null}
            onChange={(value) =>
              setFilters((current) => ({
                ...current,
                cache_status: value ?? "",
              }))
            }
          />
          <TextInput
            label="Email ID"
            placeholder="UUID"
            value={visibleFilters.email_id}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                email_id: event.currentTarget.value,
              }))
            }
          />
          <TextInput
            label="Model"
            placeholder="gpt-5-nano"
            value={visibleFilters.model}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                model: event.currentTarget.value,
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
          <Button
            variant="light"
            onClick={() => setFilters({ limit: "100" })}
          >
            Reset
          </Button>
        </Group>
      </section>

      {logsQuery.isSuccess ? (
        <section className={styles.summary}>
          <Group gap="xs">
            <SummaryBadge label="Total" value={summary.total} />
            <SummaryBadge color="green" label="Hits" value={summary.hit} />
            <SummaryBadge color="yellow" label="Misses" value={summary.miss} />
            <SummaryBadge color="gray" label="Unknown" value={summary.unknown} />
            <SummaryBadge
              color="blue"
              label="Avg cached"
              value={summary.averageCachedTokens}
            />
          </Group>
        </section>
      ) : null}

      <section className={styles.tableShell}>
        {logsQuery.isLoading ? (
          <Stack align="center" justify="center" h={240}>
            <Loader />
            <Text c="dimmed">Loading AI logs</Text>
          </Stack>
        ) : null}

        {logsQuery.isError ? (
          <Alert color="red" title="Failed to load AI logs">
            Check that the API server is reachable.
          </Alert>
        ) : null}

        {logsQuery.isSuccess && logs.length === 0 ? (
          <Stack align="center" justify="center" h={240}>
            <Text fw={600}>No AI logs found</Text>
            <Text c="dimmed" size="sm">
              Try changing filters or running a fresh AI analysis.
            </Text>
          </Stack>
        ) : null}

        {logsQuery.isSuccess && logs.length > 0 ? (
          <ScrollArea type="auto">
            <Table
              className={styles.table}
              highlightOnHover
              horizontalSpacing="md"
              verticalSpacing="sm"
            >
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Created</Table.Th>
                  <Table.Th>Email</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Cache</Table.Th>
                  <Table.Th>Model</Table.Th>
                  <Table.Th>Latency</Table.Th>
                  <Table.Th>Tokens</Table.Th>
                  <Table.Th>Cached</Table.Th>
                  <Table.Th>Error</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {logs.map((log) => (
                  <Table.Tr key={log.id}>
                    <Table.Td>{formatDateTime(log.created_at)}</Table.Td>
                    <Table.Td className={styles.emailCell}>
                      <Stack gap={2}>
                        <Text fw={600} size="sm" lineClamp={1}>
                          {log.email_title ?? "Deleted email"}
                        </Text>
                        <Group gap={6}>
                          {log.language ? (
                            <Badge size="xs" variant="light">
                              {log.language.toUpperCase()}
                            </Badge>
                          ) : null}
                          {log.variant ? (
                            <Badge color="gray" size="xs" variant="light">
                              {log.variant}
                            </Badge>
                          ) : null}
                          <Text c="dimmed" className={styles.monoCell}>
                            {log.email_slug ?? log.email_id ?? "no email"}
                          </Text>
                        </Group>
                      </Stack>
                    </Table.Td>
                    <Table.Td>
                      <Badge color={statusColor(log.status)} variant="light">
                        {log.status}
                      </Badge>
                    </Table.Td>
                    <Table.Td>
                      <Badge color={cacheStatusColor(log.cache_status)} variant="light">
                        {log.cache_status}
                      </Badge>
                    </Table.Td>
                    <Table.Td className={styles.monoCell}>{log.model}</Table.Td>
                    <Table.Td>{log.latency_ms} ms</Table.Td>
                    <Table.Td>{formatTokens(log)}</Table.Td>
                    <Table.Td>{formatCachedTokens(log)}</Table.Td>
                    <Table.Td>
                      {log.error_message ? (
                        <button
                          className={styles.errorButton}
                          type="button"
                          onClick={() => setSelectedErrorLog(log)}
                        >
                          View error
                        </button>
                      ) : (
                        <Text c="dimmed" size="sm">
                          -
                        </Text>
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        ) : null}
      </section>

      <Modal
        opened={selectedErrorLog !== null}
        title="AI analysis error"
        onClose={() => setSelectedErrorLog(null)}
      >
        <Stack gap="sm">
          <Text c="dimmed" size="sm">
            {selectedErrorLog
              ? `${selectedErrorLog.model} · ${formatDateTime(selectedErrorLog.created_at)}`
              : ""}
          </Text>
          <Code block className={styles.errorText}>
            {selectedErrorLog?.error_message ?? ""}
          </Code>
        </Stack>
      </Modal>
    </div>
  );
}

function SummaryBadge({
  color,
  label,
  value,
}: {
  color?: string;
  label: string;
  value: number | string;
}) {
  return (
    <Badge color={color} radius="sm" size="lg" variant="light">
      {label}: {value}
    </Badge>
  );
}

function buildCacheSummary(logs: AIAnalysisLogItem[]) {
  const summary = {
    averageCachedTokens: "-",
    hit: 0,
    miss: 0,
    total: logs.length,
    unknown: 0,
  };
  const knownCachedTokenValues = logs
    .map((log) => log.cached_tokens)
    .filter((value): value is number => value !== null);

  logs.forEach((log) => {
    if (log.cache_status === "hit") {
      summary.hit += 1;
    } else if (log.cache_status === "miss") {
      summary.miss += 1;
    } else {
      summary.unknown += 1;
    }
  });

  if (knownCachedTokenValues.length > 0) {
    const totalCachedTokens = knownCachedTokenValues.reduce(
      (total, value) => total + value,
      0
    );
    summary.averageCachedTokens = String(
      Math.round(totalCachedTokens / knownCachedTokenValues.length)
    );
  }

  return summary;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusColor(status: string) {
  if (status === "success") {
    return "green";
  }
  if (status === "error") {
    return "red";
  }

  return "gray";
}

function cacheStatusColor(status: AIAnalysisLogItem["cache_status"]) {
  if (status === "hit") {
    return "green";
  }
  if (status === "miss") {
    return "yellow";
  }

  return "gray";
}

function formatTokens(log: AIAnalysisLogItem) {
  if (
    log.input_tokens === null &&
    log.output_tokens === null &&
    log.total_tokens === null
  ) {
    return "-";
  }

  return `${log.total_tokens ?? "-"} total (${log.input_tokens ?? "-"} in / ${
    log.output_tokens ?? "-"
  } out)`;
}

function formatCachedTokens(log: AIAnalysisLogItem) {
  if (log.cached_tokens === null) {
    return "-";
  }

  if (!log.input_tokens) {
    return `${log.cached_tokens}`;
  }

  const percentage = Math.round((log.cached_tokens / log.input_tokens) * 100);
  return `${log.cached_tokens} (${percentage}%)`;
}
