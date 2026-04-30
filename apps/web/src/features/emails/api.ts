import type { EmailDetail, EmailListItem } from "./types";

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function fetchEmails(): Promise<EmailListItem[]> {
  return fetchJson<EmailListItem[]>("/api/emails");
}

export function fetchEmailDetail(emailId: string): Promise<EmailDetail> {
  return fetchJson<EmailDetail>(`/api/emails/${emailId}`);
}
