import { useMemo } from "react";
import {
  Alert,
  Badge,
  Group,
  Loader,
  ScrollArea,
  Select,
  Stack,
  Table,
  Text,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchAdminUsers, updateAdminUserRole } from "../emails/api";
import type { UserAdminItem, UserRole } from "../emails/types";
import styles from "../auth-events/AuthEventsView.module.css";

const roleOptions: { label: string; value: UserRole }[] = [
  { label: "Super admin", value: "super_admin" },
  { label: "Admin", value: "admin" },
  { label: "Reviewer", value: "reviewer" },
];

export function AdminUsersView() {
  const queryClient = useQueryClient();
  const usersQuery = useQuery({
    queryKey: ["admin", "users"],
    queryFn: fetchAdminUsers,
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

  const users = useMemo(() => usersQuery.data ?? [], [usersQuery.data]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Stack gap={4}>
          <Title order={2}>Users</Title>
          <Text c="dimmed" size="sm">
            Manage ReviewDesk access roles.
          </Text>
        </Stack>
      </header>

      <section className={styles.tableShell}>
        {usersQuery.isLoading ? (
          <Stack align="center" justify="center" h={240}>
            <Loader />
            <Text c="dimmed">Loading users</Text>
          </Stack>
        ) : null}

        {usersQuery.isError ? (
          <Alert color="red" title="Failed to load users">
            Super admin access is required.
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
                  <Table.Th>Email</Table.Th>
                  <Table.Th>Role</Table.Th>
                  <Table.Th>Created</Table.Th>
                  <Table.Th>Updated</Table.Th>
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
                    <Table.Td>{formatDateTime(user.created_at)}</Table.Td>
                    <Table.Td>{formatDateTime(user.updated_at)}</Table.Td>
                    <Table.Td>
                      <Group gap="xs" wrap="nowrap">
                        <Select
                          allowDeselect={false}
                          data={roleOptions}
                          disabled={updateRoleMutation.isPending}
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

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
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
