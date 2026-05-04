import { notifications } from "@mantine/notifications";

import type { EmailDetail } from "./types";

export async function copyOriginalHTML(email: EmailDetail) {
  try {
    await navigator.clipboard.writeText(email.original_html);
    notifications.show({
      color: "green",
      message: "Original HTML copied to clipboard",
      title: "Copied",
    });
  } catch {
    notifications.show({
      color: "red",
      message: "Browser blocked clipboard access. Try downloading the HTML instead.",
      title: "Copy failed",
    });
  }
}

export function downloadOriginalHTML(email: EmailDetail) {
  const blob = new Blob([email.original_html], {
    type: "text/html;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = buildHTMLFileName(email);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  notifications.show({
    color: "green",
    message: `${link.download} is ready`,
    title: "Downloaded",
  });
}

function buildHTMLFileName(email: EmailDetail) {
  const baseName = email.slug || email.title || "email";
  const sanitizedBaseName = baseName
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return `${sanitizedBaseName || "email"}.html`;
}
