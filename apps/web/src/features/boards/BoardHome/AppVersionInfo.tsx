import { Text } from "@mantine/core";

import styles from "../../../App.module.css";

const updatedAt = new Date(__APP_UPDATED_AT__);
const updatedLabel = Number.isNaN(updatedAt.getTime())
  ? ""
  : updatedAt.toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

export function AppVersionInfo({ onDark = false }: { onDark?: boolean }) {
  const parts = [
    `v${__APP_VERSION__}`,
    __APP_COMMIT__,
    updatedLabel && `updated ${updatedLabel}`,
  ].filter(Boolean);

  return (
    <Text
      c={onDark ? undefined : "dimmed"}
      className={onDark ? styles.appVersionInfo : undefined}
      size="xs"
      title={`Last update: ${updatedAt.toLocaleString()}`}
    >
      {parts.join(" · ")}
    </Text>
  );
}
