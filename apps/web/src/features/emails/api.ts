import type {
  AIAnalysisLogFilters,
  AIAnalysisLogItem,
  AuthEventFilters,
  AuthEventItem,
  AuthUser,
  EmailAnalysis,
  EmailDetail,
  EmailListItem,
} from "./types";

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function requestMagicLink(email: string): Promise<{ ok: boolean }> {
  return fetchJson<{ ok: boolean }>("/api/auth/request-link", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email }),
  });
}

export function signInWithInviteCode(
  email: string,
  code: string
): Promise<{ ok: boolean }> {
  return fetchJson<{ ok: boolean }>("/api/auth/invite-code", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, code }),
  });
}

export function fetchCurrentUser(): Promise<AuthUser> {
  return fetchJson<AuthUser>("/api/auth/me");
}

export function fetchAuthEvents(
  filters: AuthEventFilters
): Promise<AuthEventItem[]> {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    const trimmedValue = value?.trim();
    if (trimmedValue) {
      params.set(key, trimmedValue);
    }
  });

  const query = params.toString();
  return fetchJson<AuthEventItem[]>(
    `/api/auth/events${query ? `?${query}` : ""}`
  );
}

export function logout(): Promise<{ ok: boolean }> {
  return fetchJson<{ ok: boolean }>("/api/auth/logout", {
    method: "POST",
  });
}

export function fetchEmails(): Promise<EmailListItem[]> {
  return fetchJson<EmailListItem[]>("/api/emails");
}

export function fetchEmailDetail(emailId: string): Promise<EmailDetail> {
  return fetchJson<EmailDetail>(`/api/emails/${emailId}`);
}

export function fetchAIAnalysisLogs(
  filters: AIAnalysisLogFilters
): Promise<AIAnalysisLogItem[]> {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    const trimmedValue = value?.trim();
    if (trimmedValue) {
      params.set(key, trimmedValue);
    }
  });

  const query = params.toString();
  return fetchJson<AIAnalysisLogItem[]>(
    `/api/ai-analysis-logs${query ? `?${query}` : ""}`
  );
}

export function analyzeEmail(emailId: string): Promise<EmailAnalysis> {
  return fetchJson<EmailAnalysis>(`/api/emails/${emailId}/ai-analysis`, {
    method: "POST",
  });
}

export function analyzeEmailStream(
  emailId: string,
  handlers: {
    onDelta: (text: string) => void;
    onResult?: (analysis: EmailAnalysis) => void;
    onDone?: () => void;
    onError?: (error: string) => void;
  },
  options: {
    refresh?: boolean;
  } = {}
) {
  const searchParams = new URLSearchParams();
  if (options.refresh) {
    searchParams.set("refresh", "true");
  }
  const query = searchParams.toString();
  const url = `/api/emails/${emailId}/ai-analysis-stream${query ? `?${query}` : ""}`;

  const source = new EventSource(url, { withCredentials: true });

  source.addEventListener("delta", (event) => {
    try {
      const text = JSON.parse((event as MessageEvent).data);
      handlers.onDelta(text);
    } catch {
      handlers.onDelta((event as MessageEvent).data);
    }
  });

  source.addEventListener("result", (event) => {
    try {
      const analysis = JSON.parse((event as MessageEvent).data) as EmailAnalysis;
      handlers.onResult?.(analysis);
    } catch {
      handlers.onError?.("failed to parse stream result");
      source.close();
    }
  });

  source.addEventListener("done", () => {
    handlers.onDone?.();
    source.close();
  });

  source.addEventListener("error", () => {
    handlers.onError?.("stream error");
    source.close();
  });

  return () => {
    source.close();
  };
}
