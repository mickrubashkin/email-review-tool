import type { EmailAnalysis, EmailDetail, EmailListItem } from "./types";

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);

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

export function analyzeEmail(emailId: string): Promise<EmailAnalysis> {
  return fetchJson<EmailAnalysis>(`/api/emails/${emailId}/ai-analysis`, {
    method: "POST",
  });
}
