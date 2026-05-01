import {
  Alert,
  Badge,
  Button,
  Drawer,
  Group,
  Loader,
  Stack,
  Text,
} from "@mantine/core";

import { formatStageName } from "./stages";
import type { EmailDetail } from "./types";
import styles from "./EmailPreviewDrawer.module.css";

type EmailPreviewDrawerProps = {
  email: EmailDetail | undefined;
  isError: boolean;
  isLoading: boolean;
  isMobile: boolean | undefined;
  onClose: () => void;
  opened: boolean;
};

export function EmailPreviewDrawer({
  email,
  isError,
  isLoading,
  isMobile,
  onClose,
  opened,
}: EmailPreviewDrawerProps) {
  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size={isMobile ? "100%" : "min(900px, 90vw)"}
      title={email?.title ?? "Email preview"}
      padding="md"
    >
      {isLoading ? (
        <Stack align="center" justify="center" h={320}>
          <Loader />
          <Text c="dimmed">Loading preview</Text>
        </Stack>
      ) : null}

      {isError ? (
        <Alert color="red" title="Failed to load preview">
          Try closing the preview and opening the email again.
        </Alert>
      ) : null}

      {email ? (
        <Stack gap="md">
          <Group className={styles.previewToolbar} justify="space-between">
            <Group gap="xs">
              <Badge variant="light" radius="sm">
                {email.language}
              </Badge>
              <Badge variant="outline" radius="sm">
                {formatStageName(email.stage || "uncategorized")}
              </Badge>
            </Group>

            <Group gap="xs">
              <Badge variant="default" radius="sm">
                Soon
              </Badge>
              <Button disabled>Open review</Button>
            </Group>
          </Group>

          <iframe
            className={styles.emailPreviewFrame}
            title={email.title}
            sandbox=""
            srcDoc={email.original_html}
          />
        </Stack>
      ) : null}
    </Drawer>
  );
}
