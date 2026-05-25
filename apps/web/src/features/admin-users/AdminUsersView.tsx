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
import { notifications } from "@mantine/notifications";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { HouseIcon } from "@phosphor-icons/react";
import { Link } from "react-router-dom";

import { createAdminUser, fetchAdminUsers, updateAdminUserRole } from "../emails/api";
import type { UserAdminItem, UserRole } from "../emails/types";
import styles from "../auth-events/AuthEventsView.module.css";

const roleOptions: { label: string; value: UserRole }[] = [
  { label: "Super admin", value: "super_admin" },
  { label: "Admin", value: "admin" },
  { label: "Reviewer", value: "reviewer" },
];
type SortDirection = "asc" | "desc";
type UserSortKey = keyof Pick<
  UserAdminItem,
  "email" | "role" | "last_seen_at" | "created_at" | "updated_at"
>;
const defaultSort = {
  direction: "asc" as SortDirection,
  key: "email" as UserSortKey,
};

type AdminUsersViewProps = {
  currentUserRole: UserRole;
};

export function AdminUsersView({ currentUserRole }: AdminUsersViewProps) {
  const queryClient = useQueryClient();
  const [sort, setSort] = useState(defaultSort);
  const [emailDraft, setEmailDraft] = useState("");
  const [roleDraft, setRoleDraft] = useState<UserRole>(
    currentUserRole === "super_admin" ? "reviewer" : "reviewer"
  );
  const usersQuery = useQuery({
    queryKey: ["admin", "users"],
    queryFn: fetchAdminUsers,
  });
  const createUserMutation = useMutation({
    mutationFn: ({ email, role }: { email: string; role: UserRole }) =>
      createAdminUser({ email, role }),
    onSuccess: (createdUser) => {
      queryClient.setQueryData<UserAdminItem[]>(
        ["admin", "users"],
        (currentUsers) => [...(currentUsers ?? []), createdUser]
      );
      setEmailDraft("");
      setRoleDraft("reviewer");
      notifications.show({
        color: "green",
        message: `${createdUser.email} can now log in with OTP.`,
        title: "User added",
      });
    },
    onError: () => {
      notifications.show({
        color: "red",
        message: "Check the email, role, and whether the user already exists.",
        title: "User add failed",
      });
    },
  });
  const updateRoleMutation = useMutation({
    mutationFn: ({ role, userId }: { role: UserRole; userId: string }) =>
      updateAdminUserRole(userId, role),
    onSuccess: (updatedUser) => {
      queryClient.setQueryData<UserAdminItem[]>(
        ["admin", "users"],
        (currentUsers) =>
          currentUsers?.map((user) =>
            user.id === updatedUser.id ? updatedUser : user
          ) ?? [updatedUser]
      );
      void queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      notifications.show({
        color: "green",
        message: `${updatedUser.email} is now ${formatRole(updatedUser.role)}`,
        title: "Role updated",
      });
    },
    onError: () => {
      notifications.show({
        color: "red",
        message: "Only super admins can update roles. You also cannot demote yourself.",
        title: "Role update failed",
      });
    },
  });

  const users = useMemo(
    () => sortItems(usersQuery.data ?? [], sort),
    [usersQuery.data, sort]
  );
  const createRoleOptions =
    currentUserRole === "super_admin"
      ? roleOptions
      : roleOptions.filter((option) => option.value === "reviewer");
  const canUpdateRoles = currentUserRole === "super_admin";
  const trimmedEmailDraft = emailDraft.trim();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Stack gap={4}>
          <Title order={2}>Users</Title>
          <Text c="dimmed" size="sm">
            Manage ReviewDesk access roles.
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
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!trimmedEmailDraft) {
              return;
            }
            createUserMutation.mutate({
              email: trimmedEmailDraft,
              role: roleDraft,
            });
          }}
        >
          <Group align="end" gap="sm">
            <TextInput
              label="Email"
              placeholder="new.user@example.com"
              value={emailDraft}
              onChange={(event) => setEmailDraft(event.currentTarget.value)}
            />
            <Select
              allowDeselect={false}
              data={createRoleOptions}
              label="Role"
              value={roleDraft}
              w={180}
              onChange={(value) => setRoleDraft((value as UserRole | null) ?? "reviewer")}
            />
            <Button
              disabled={!trimmedEmailDraft}
              loading={createUserMutation.isPending}
              type="submit"
            >
              Add user
            </Button>
          </Group>
        </form>
      </section>

      <section className={styles.tableShell}>
        {usersQuery.isLoading ? (
          <Stack align="center" justify="center" h={240}>
            <Loader />
            <Text c="dimmed">Loading users</Text>
          </Stack>
        ) : null}

        {usersQuery.isError ? (
          <Alert color="red" title="Failed to load users">
            Admin access is required.
          </Alert>
        ) : null}

        {usersQuery.isSuccess && users.length === 0 ? (
          <Stack align="center" justify="center" h={240}>
            <Text fw={600}>No users found</Text>
          </Stack>
        ) : null}

        {usersQuery.isSuccess && users.length > 0 ? (
          <ScrollArea type="auto">
            <Table
              className={styles.table}
              highlightOnHover
              horizontalSpacing="md"
              verticalSpacing="sm"
            >
              <Table.Thead>
                <Table.Tr>
                  <SortableTh label="Email" sortKey="email" sort={sort} onSort={setSort} />
                  <SortableTh label="Role" sortKey="role" sort={sort} onSort={setSort} />
                  <SortableTh label="Last seen" sortKey="last_seen_at" sort={sort} onSort={setSort} />
                  <SortableTh label="Created" sortKey="created_at" sort={sort} onSort={setSort} />
                  <SortableTh label="Updated" sortKey="updated_at" sort={sort} onSort={setSort} />
                  <Table.Th>Change role</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {users.map((user) => (
                  <Table.Tr key={user.id}>
                    <Table.Td>{user.email}</Table.Td>
                    <Table.Td>
                      <Badge color={getRoleColor(user.role)} variant="light">
                        {formatRole(user.role)}
                      </Badge>
                    </Table.Td>
                    <Table.Td>{formatOptionalDateTime(user.last_seen_at)}</Table.Td>
                    <Table.Td>{formatDateTime(user.created_at)}</Table.Td>
                    <Table.Td>{formatDateTime(user.updated_at)}</Table.Td>
                    <Table.Td>
                      <Group gap="xs" wrap="nowrap">
                        <Select
                          allowDeselect={false}
                          data={roleOptions}
                          disabled={!canUpdateRoles || updateRoleMutation.isPending}
                          size="xs"
                          value={user.role}
                          w={160}
                          onChange={(value) => {
                            const role = value as UserRole | null;
                            if (!role || role === user.role) {
                              return;
                            }
                            updateRoleMutation.mutate({
                              role,
                              userId: user.id,
                            });
                          }}
                        />
                      </Group>
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
  onSort: (sort: { direction: SortDirection; key: UserSortKey }) => void;
  sort: { direction: SortDirection; key: UserSortKey };
  sortKey: UserSortKey;
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
  items: UserAdminItem[],
  sort: { direction: SortDirection; key: UserSortKey }
) {
  return [...items].sort((first, second) => {
    const result = compareValues(first[sort.key], second[sort.key]);
    return sort.direction === "asc" ? result : -result;
  });
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

function formatOptionalDateTime(value: string | null) {
  return value ? formatDateTime(value) : "Never";
}

function formatRole(role: UserRole) {
  return role.replaceAll("_", " ");
}

function getRoleColor(role: UserRole) {
  switch (role) {
    case "super_admin":
      return "violet";
    case "admin":
      return "blue";
    default:
      return "gray";
  }
}
