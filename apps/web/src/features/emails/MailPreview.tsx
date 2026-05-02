import { Group, Stack, Text } from "@mantine/core";

import type { EmailDetail } from "./types";
import styles from "./EmailPreviewDrawer.module.css";

export type PreviewViewport = "desktop" | "mobile";

type MailPreviewProps = {
  email: EmailDetail;
  isScanning: boolean;
  viewport: PreviewViewport;
};

export function MailPreview({ email, isScanning, viewport }: MailPreviewProps) {
  return (
    <div className={styles.emailPreviewWrap} data-viewport={viewport}>
      <div className={styles.mailClient}>
        <article className={styles.mailReadPane}>
          <header className={styles.mailHeader}>
            <Group className={styles.mailMetaRow} justify="space-between" gap="sm">
              <Group gap="sm" wrap="nowrap">
                <div className={styles.mailAvatar}>B</div>
                <Stack gap={0}>
                  <Text size="sm" fw={600}>
                    Bitrix24 Partners
                  </Text>
                  <Text size="sm">{email.subject ?? email.title}</Text>
                  {email.subject ? (
                    <Text size="xs" c="dimmed">
                      {email.subject}
                    </Text>
                  ) : null}
                  {email.preheader ? (
                    <Text size="xs" c="dimmed">
                      {email.preheader}
                    </Text>
                  ) : null}
                  <Text size="xs" c="dimmed">
                    Reply-To: partners@bitrix24.com
                  </Text>
                </Stack>
              </Group>
            </Group>
          </header>

          <iframe
            className={styles.emailPreviewFrame}
            title={email.title}
            sandbox=""
            srcDoc={email.original_html}
          />
        </article>
      </div>
      {isScanning ? (
        <div className={styles.emailScanOverlay} aria-hidden="true" />
      ) : null}
    </div>
  );
}
