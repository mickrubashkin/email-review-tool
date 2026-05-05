import { useState } from "react";
import {
  Alert,
  Button,
  Paper,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { requestMagicLink, signInWithInviteCode } from "../emails/api";
import styles from "./LoginView.module.css";

const allowedDomain = (
  import.meta.env.VITE_AUTH_ALLOWED_DOMAIN ?? "alaio.com"
)
  .trim()
  .toLowerCase()
  .replace(/^@/, "");

export function LoginView() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [domainError, setDomainError] = useState<string | null>(null);

  const requestLinkMutation = useMutation({
    mutationFn: requestMagicLink,
  });
  const inviteCodeMutation = useMutation({
    mutationFn: ({ email, code }: { email: string; code: string }) =>
      signInWithInviteCode(email, code),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    },
  });

  return (
    <main className={styles.page}>
      <Paper className={styles.panel} p="xl" radius="md" shadow="xl">
        <form
          onSubmit={(event) => {
            event.preventDefault();

            const normalizedEmail = email.trim().toLowerCase();
            if (!isAllowedEmailDomain(normalizedEmail)) {
              setDomainError(`Access is only available for ${allowedDomain} emails.`);
              return;
            }

            setDomainError(null);
            requestLinkMutation.mutate(normalizedEmail);
          }}
        >
          <Stack gap="md">
            <Stack gap={4}>
              <Title order={2}>Sign in</Title>
              <Text c="dimmed" size="sm">
                Enter your work email to receive a magic login link.
              </Text>
              <Text c="dimmed" size="sm">Only @alaio.com domain is allowed</Text>
            </Stack>

            <TextInput
              autoComplete="email"
              label="Email"
              placeholder="name@alaio.com"
              required
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(event.currentTarget.value);
                setDomainError(null);
                requestLinkMutation.reset();
                inviteCodeMutation.reset();
              }}
            />

            {domainError ? (
              <Alert color="yellow" title="Email domain is not allowed">
                {domainError}
              </Alert>
            ) : null}

            <Button
              loading={requestLinkMutation.isPending}
              type="submit"
              fullWidth
            >
              Send magic link
            </Button>

            {/* <Stack gap="xs">
              <PasswordInput
                autoComplete="one-time-code"
                label="Invite code"
                placeholder="Enter invite code"
                value={inviteCode}
                onChange={(event) => {
                  setInviteCode(event.currentTarget.value);
                  inviteCodeMutation.reset();
                }}
              />
              <Button
                disabled={inviteCode.trim() === ""}
                loading={inviteCodeMutation.isPending}
                variant="light"
                onClick={() => {
                  const normalizedEmail = email.trim().toLowerCase();
                  if (!isAllowedEmailDomain(normalizedEmail)) {
                    setDomainError(
                      `Access is only available for ${allowedDomain} emails.`
                    );
                    return;
                  }

                  setDomainError(null);
                  inviteCodeMutation.mutate({
                    email: normalizedEmail,
                    code: inviteCode,
                  });
                }}
              >
                Sign in with invite code
              </Button>
            </Stack> */}

            {requestLinkMutation.isSuccess ? (
              <Alert color="green" title="Magic link requested">
                Check your email for the magic link.
              </Alert>
            ) : null}

            {requestLinkMutation.isError ? (
              <Alert color="red" title="Could not request link">
                Check that the API server is reachable.
              </Alert>
            ) : null}

            {inviteCodeMutation.isError ? (
              <Alert color="red" title="Could not sign in">
                Check your email and invite code.
              </Alert>
            ) : null}
          </Stack>
        </form>
      </Paper>
    </main>
  );
}

function isAllowedEmailDomain(email: string) {
  const [, domain] = email.split("@");
  return Boolean(domain) && domain === allowedDomain;
}
