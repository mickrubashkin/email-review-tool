import { useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  Loader,
  NumberInput,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate, useNavigate } from "react-router-dom";

import { AdminTableHeader } from "../../admin-table/AdminTableHeader";
import { fetchBoards } from "../../boards/api";
import { formatStageName } from "../../emails/stages";
import type { UserRole } from "../../emails/types";
import {
  fetchPortalCategories,
  fetchPortalOverview,
  startPortalSync,
  type PortalGroup,
  type PortalStage,
} from "../api";
import { GroupDrawer } from "./GroupDrawer";
import { topStages } from "./portalHelpers";
import styles from "../../auth-events/AuthEvents/AuthEvents.module.css";

type Filter = "review" | "differs" | "unmatched" | "matched" | "decided" | "all";

const filterOptions: Array<{ label: string; value: Filter }> = [
  { label: "Needs review", value: "review" },
  { label: "Differs", value: "differs" },
  { label: "Not in service", value: "unmatched" },
  { label: "Matches", value: "matched" },
  { label: "Decided", value: "decided" },
  { label: "All", value: "all" },
];

function matchesFilter(group: PortalGroup, filter: Filter) {
  switch (filter) {
    case "review":
      return group.decision === null && group.match_status !== "matched";
    case "decided":
      return group.decision !== null;
    case "all":
      return true;
    default:
      return group.decision === null && group.match_status === filter;
  }
}

export function PortalSync({ currentUserRole }: { currentUserRole: UserRole }) {
  const queryClient = useQueryClient();
  const [boardKey, setBoardKey] = useState("onboarding");
  const [categoryID, setCategoryID] = useState<string | null>(null);
  const [days, setDays] = useState<number | string>(90);
  const [filter, setFilter] = useState<Filter>("review");
  const [openGroupID, setOpenGroupID] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const navigate = useNavigate();
  const isSuperAdmin = currentUserRole === "super_admin";

  const boardsQuery = useQuery({ queryKey: ["boards"], queryFn: fetchBoards, enabled: isSuperAdmin });
  const categoriesQuery = useQuery({
    queryKey: ["portal-categories"],
    queryFn: fetchPortalCategories,
    enabled: isSuperAdmin,
    retry: false,
    staleTime: Infinity,
  });
  const overviewQuery = useQuery({
    queryKey: ["portal-overview", boardKey],
    queryFn: () => fetchPortalOverview(boardKey),
    enabled: isSuperAdmin,
    refetchInterval: (query) => (query.state.data?.latest_run?.status === "running" ? 2000 : false),
    refetchIntervalInBackground: true,
  });
  const syncMutation = useMutation({
    mutationFn: (payload: { category_id: number; days: number }) => startPortalSync(boardKey, payload),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["portal-overview", boardKey] }),
    onError: (error) =>
      notifications.show({ color: "red", message: error.message, title: "Sync did not start" }),
  });

  const overview = overviewQuery.data;
  const run = overview?.latest_run ?? null;
  const stageNames = useMemo(
    () => new Map((overview?.stages ?? []).map((s: PortalStage) => [s.id, s.name])),
    [overview?.stages]
  );
  const groups = overview?.groups ?? [];
  const visibleGroups = groups.filter((g) => matchesFilter(g, filter));
  const counts = Object.fromEntries(
    filterOptions.map((o) => [o.value, groups.filter((g) => matchesFilter(g, o.value)).length])
  ) as Record<Filter, number>;

  const categories = categoriesQuery.data ?? [];
  const defaultCategory =
    run?.category_id ?? categories.find((c) => /onboarding/i.test(c.name))?.id ?? categories[0]?.id;
  const selectedCategory = categoryID ?? (defaultCategory !== undefined ? String(defaultCategory) : null);

  if (!isSuperAdmin) {
    return <Navigate replace to="/" />;
  }

  return (
    <div className={styles.page}>
      <AdminTableHeader
        subtitle="What CRM robots actually send, matched against the board."
        title="Portal sync"
      />
      <Stack p="md">
        <Paper p="md" withBorder>
          <Group align="flex-end">
            <Select
              allowDeselect={false}
              data={(boardsQuery.data ?? []).map((b) => ({ label: b.name, value: b.key }))}
              label="Board"
              value={boardKey}
              onChange={(value) => value && setBoardKey(value)}
            />
            <Select
              allowDeselect={false}
              data={categories.map((c) => ({ label: `${c.name} (${c.id})`, value: String(c.id) }))}
              error={categoriesQuery.isError ? "Bitrix24 is not reachable or not configured" : undefined}
              label="Bitrix24 funnel"
              miw={260}
              value={selectedCategory}
              onChange={setCategoryID}
            />
            <NumberInput label="Days back" max={365} min={1} value={days} w={110} onChange={setDays} />
            <Button
              disabled={!selectedCategory || run?.status === "running"}
              loading={syncMutation.isPending}
              onClick={() =>
                syncMutation.mutate({ category_id: Number(selectedCategory), days: Number(days) || 90 })
              }
            >
              Load sent emails
            </Button>
          </Group>
          {run ? (
            <Group gap="xs" mt="sm">
              <Badge color={run.status === "done" ? "green" : run.status === "failed" ? "red" : "blue"}>
                {run.status}
              </Badge>
              <Text size="sm">
                {run.status === "running"
                  ? run.progress
                  : `${new Date(run.started_at).toLocaleString()} · ${run.days} days · ${run.emails_stored} emails from the funnel · ${run.groups_count} distinct`}
              </Text>
              {run.status === "running" ? <Loader size="xs" /> : null}
              {run.error ? <Text c="red" size="sm">{run.error}</Text> : null}
            </Group>
          ) : (
            <Text c="dimmed" mt="sm" size="sm">
              Nothing loaded yet. Only reads from Bitrix24.
            </Text>
          )}
        </Paper>

        {overviewQuery.isError ? <Alert color="red">Failed to load portal data.</Alert> : null}

        <Group justify="space-between">
          <Title order={4}>Sent emails ({groups.length} distinct)</Title>
          {selected.length > 0 ? (
            <Button
              size="xs"
              onClick={() =>
                navigate(`/slots/new?${selected.map((id) => `portal_group=${encodeURIComponent(id)}`).join("&")}`)
              }
            >
              Create slot from {selected.length} selected
            </Button>
          ) : null}
          <SegmentedControl
            data={filterOptions.map((o) => ({ label: `${o.label} ${counts[o.value] ?? 0}`, value: o.value }))}
            size="xs"
            value={filter}
            onChange={(value) => setFilter(value as Filter)}
          />
        </Group>
        <Paper withBorder>
          <Table highlightOnHover striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th />
                <Table.Th>Last sent</Table.Th>
                <Table.Th>Sends</Table.Th>
                <Table.Th>Lang</Table.Th>
                <Table.Th>Portal stage</Table.Th>
                <Table.Th>Subject</Table.Th>
                <Table.Th>In the service</Table.Th>
                <Table.Th>Decision</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {visibleGroups.map((group) => (
                <Table.Tr key={group.id} style={{ cursor: "pointer" }} onClick={() => setOpenGroupID(group.id)}>
                  <Table.Td onClick={(event) => event.stopPropagation()}>
                    <Checkbox
                      aria-label="Select for a new slot"
                      checked={selected.includes(group.id)}
                      onChange={(event) => {
                        const checked = event.currentTarget.checked;
                        setSelected((current) =>
                          checked ? [...current, group.id] : current.filter((id) => id !== group.id)
                        );
                      }}
                    />
                  </Table.Td>
                  <Table.Td>{new Date(group.last_sent_at).toLocaleDateString()}</Table.Td>
                  <Table.Td>{group.send_count}</Table.Td>
                  <Table.Td>{group.language.toUpperCase() || "?"}</Table.Td>
                  <Table.Td>
                    <Text size="xs">{topStages(group.stages, stageNames)}</Text>
                  </Table.Td>
                  <Table.Td maw={380}>
                    <Text fw={500} lineClamp={1} size="sm">
                      {group.subject || "(no subject)"}
                    </Text>
                    <Text c="dimmed" lineClamp={1} size="xs">
                      {group.excerpt}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <MatchCell group={group} />
                  </Table.Td>
                  <Table.Td>
                    {group.decision ? <Badge variant="light">{group.decision}</Badge> : null}
                  </Table.Td>
                </Table.Tr>
              ))}
              {visibleGroups.length === 0 ? (
                <Table.Tr>
                  <Table.Td colSpan={8}>
                    <Text c="dimmed" size="sm" ta="center">
                      Nothing here.
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ) : null}
            </Table.Tbody>
          </Table>
        </Paper>

        <Title order={4}>Board emails never seen on the portal ({overview?.unseen.length ?? 0})</Title>
        <Text c="dimmed" size="sm">
          Either the robot condition has not fired in this period, or the email is no longer used. Check these by hand.
        </Text>
        <Paper withBorder>
          <Table striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Stage</Table.Th>
                <Table.Th>#</Table.Th>
                <Table.Th>Title</Table.Th>
                <Table.Th>Lang</Table.Th>
                <Table.Th>Version</Table.Th>
                <Table.Th>Adaptation</Table.Th>
                <Table.Th>Timing / condition</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(overview?.unseen ?? []).map((email) => (
                <Table.Tr key={email.id}>
                  <Table.Td>{formatStageName(email.stage)}</Table.Td>
                  <Table.Td>{email.sort_order}</Table.Td>
                  <Table.Td>
                    <a href={`/emails/${email.id}/review`}>{email.title}</a>
                  </Table.Td>
                  <Table.Td>{email.language.toUpperCase()}</Table.Td>
                  <Table.Td>{email.variant}</Table.Td>
                  <Table.Td>{email.adaptation_label}</Table.Td>
                  <Table.Td>
                    {[email.send_timing, email.send_condition].filter(Boolean).join(" · ")}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Paper>
      </Stack>

      {openGroupID ? (
        <GroupDrawer
          boardKey={boardKey}
          groupID={openGroupID}
          stageNames={stageNames}
          onClose={() => setOpenGroupID(null)}
          onDecided={() => void queryClient.invalidateQueries({ queryKey: ["portal-overview", boardKey] })}
        />
      ) : null}
    </div>
  );
}

function MatchCell({ group }: { group: PortalGroup }) {
  if (!group.match_email_title) {
    return <Badge color="orange" variant="light">not in service</Badge>;
  }
  return (
    <Stack gap={2}>
      <Group gap={6} wrap="nowrap">
        <Badge color={group.match_status === "matched" ? "green" : "yellow"} variant="light">
          {Math.round(group.match_score * 100)}%
        </Badge>
        <Text lineClamp={1} size="sm">
          {group.match_email_title}
        </Text>
      </Group>
      {group.match_email_stage ? (
        <Text c="dimmed" size="xs">
          {formatStageName(group.match_email_stage)}
        </Text>
      ) : null}
    </Stack>
  );
}
