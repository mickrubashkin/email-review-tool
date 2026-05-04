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
import { useMutation } from "@tanstack/react-query";

import { requestMagicLink } from "../emails/api";
import styles from "./LoginView.module.css";

const allowedDomain = (
  import.meta.env.VITE_AUTH_ALLOWED_DOMAIN ?? "alaio.com"
)
  .trim()
  .toLowerCase()
  .replace(/^@/, "");

export function LoginView() {
  const [email, setEmail] = useState("");
  const [domainError, setDomainError] = useState<string | null>(null);

  const requestLinkMutation = useMutation({
    mutationFn: requestMagicLink,
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
            </Stack>

            <TextInput
              autoComplete="email"
              label="Email"
              placeholder="name@example.com"
              required
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(event.currentTarget.value);
                setDomainError(null);
                requestLinkMutation.reset();
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

            {requestLinkMutation.isSuccess ? (
              <Alert color="green" title="Magic link requested">
                Check server logs for the magic link.
              </Alert>
            ) : null}

            {requestLinkMutation.isError ? (
              <Alert color="red" title="Could not request link">
                Check that the API server is reachable.
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
