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

import { requestLoginCode, verifyLoginCode } from "../emails/api";
import styles from "./LoginView.module.css";

const allowedDomains = getAllowedDomains();
const allowedDomainsLabel = allowedDomains.map((domain) => `@${domain}`).join(", ");

export function LoginView() {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [otpCode, setOTPCode] = useState("");
  const [domainError, setDomainError] = useState<string | null>(null);

  const requestCodeMutation = useMutation({
    mutationFn: requestLoginCode,
  });
  const verifyCodeMutation = useMutation({
    mutationFn: ({ email, code }: { email: string; code: string }) =>
      verifyLoginCode(email, code),
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
              setDomainError(
                `Access is only available for ${allowedDomainsLabel} emails.`
              );
              return;
            }

            setDomainError(null);
            requestCodeMutation.mutate(normalizedEmail);
          }}
        >
          <Stack gap="md">
            <Stack gap={4}>
              <Title order={2}>ReviewDesk</Title>
              <Text c="dimmed" size="sm">
                Private workspace for authorized email review teams.
              </Text>
              <Text c="dimmed" size="sm">
                Operated by Mikhail Rubashkin for collaborative email review.
              </Text>
              <Text c="dimmed" size="sm">
                This tool never asks for your email password.
              </Text>
            </Stack>

            <TextInput
              autoComplete="email"
              label="Email"
              placeholder={`name@${allowedDomains[0] ?? "alaio.com"}`}
              required
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(event.currentTarget.value);
                setDomainError(null);
                requestCodeMutation.reset();
                verifyCodeMutation.reset();
              }}
            />

            {domainError ? (
              <Alert color="yellow" title="Email domain is not allowed">
                {domainError}
              </Alert>
            ) : null}

            <Button
              loading={requestCodeMutation.isPending}
              type="submit"
              fullWidth
            >
              Send one-time code
            </Button>

            <Stack gap="xs">
              <TextInput
                autoComplete="one-time-code"
                inputMode="numeric"
                label="One-time code"
                maxLength={6}
                placeholder="123456"
                value={otpCode}
                onChange={(event) => {
                  setOTPCode(event.currentTarget.value.replace(/\D/g, "").slice(0, 6));
                  verifyCodeMutation.reset();
                }}
              />
              <Text c="dimmed" size="xs">
                Enter the 6-digit code sent to your email. Do not enter your email
                password.
              </Text>
              <Button
                disabled={otpCode.trim().length !== 6}
                loading={verifyCodeMutation.isPending}
                variant="light"
                onClick={() => {
                  const normalizedEmail = email.trim().toLowerCase();
                  if (!isAllowedEmailDomain(normalizedEmail)) {
                    setDomainError(
                      `Access is only available for ${allowedDomainsLabel} emails.`
                    );
                    return;
                  }

                  setDomainError(null);
                  verifyCodeMutation.mutate({
                    email: normalizedEmail,
                    code: otpCode,
                  });
                }}
              >
                Sign in
              </Button>
            </Stack>

            {requestCodeMutation.isSuccess ? (
              <Alert color="green" title="Code sent">
                Check your email for the one-time code.
              </Alert>
            ) : null}

            {requestCodeMutation.isError ? (
              <Alert color="red" title="Could not send code">
                Check that the API server is reachable.
              </Alert>
            ) : null}

            {verifyCodeMutation.isError ? (
              <Alert color="red" title="Could not sign in">
                Check your email and one-time code.
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
  return Boolean(domain) && allowedDomains.includes(domain);
}

function getAllowedDomains() {
  const value = String(
    import.meta.env.VITE_AUTH_ALLOWED_DOMAINS ??
      import.meta.env.VITE_AUTH_ALLOWED_DOMAIN ??
      "alaio.com"
  );

  return value
    .split(",")
    .map((domain) => domain.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
}
