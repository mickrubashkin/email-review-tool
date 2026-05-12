import type {
  AIAnalysisLogFilters,
  AIAnalysisLogItem,
  AuthEventFilters,
  AuthEventItem,
  AuthUser,
  EmailAnalysis,
  EmailDetail,
  EmailListItem,
  CreateEmailCommentPayload,
  DuplicateEmailPayload,
  EmailComment,
  UserAdminItem,
  UserRole,
  RenderedEmail,
  UpdateEditableFieldsPayload,
} from "./types";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: "include",
  });

  if (!response.ok) {
    const message = await response.text();
    throw new ApiError(response.status, message || `Request failed: ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export function requestLoginCode(email: string): Promise<{ ok: boolean }> {
  return fetchJson<{ ok: boolean }>("/api/auth/request-code", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email }),
  });
}

export function verifyLoginCode(
  email: string,
  code: string
): Promise<{ ok: boolean }> {
  return fetchJson<{ ok: boolean }>("/api/auth/verify-code", {
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
  return fetchJson<{ ok: boolean }>("/api/auth/logout",
    {
      method: "POST",
    }
  );
}

export function fetchEmails(): Promise<EmailListItem[]> {
  return fetchJson<EmailListItem[]>("/api/emails");
}

export function fetchEmailDetail(emailId: string): Promise<EmailDetail> {
  return fetchJson<EmailDetail>(`/api/emails/${encodeURIComponent(emailId)}`);
}

export function fetchRenderedEmail(emailId: string): Promise<RenderedEmail> {
  return fetchJson<RenderedEmail>(
    `/api/emails/${encodeURIComponent(emailId)}/rendered`
  );
}

export function updateEmailEditableFields(
  emailId: string,
  payload: UpdateEditableFieldsPayload
): Promise<void> {
  return fetchJson<void>(
    `/api/emails/${encodeURIComponent(emailId)}/editable-fields`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );
}

export function duplicateEmail(
  emailId: string,
  payload: DuplicateEmailPayload
): Promise<EmailDetail> {
  return fetchJson<EmailDetail>(
    `/api/emails/${encodeURIComponent(emailId)}/duplicate`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );
}

export function archiveEmail(emailId: string): Promise<void> {
  return fetchJson<void>(`/api/emails/${encodeURIComponent(emailId)}/archive`, {
    method: "PATCH",
  });
}

export function fetchAdminUsers(): Promise<UserAdminItem[]> {
  return fetchJson<UserAdminItem[]>("/api/admin/users");
}

export function updateAdminUserRole(
  userId: string,
  role: UserRole
): Promise<UserAdminItem> {
  return fetchJson<UserAdminItem>(
    `/api/admin/users/${encodeURIComponent(userId)}/role`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ role }),
    }
  );
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
  return fetchJson<EmailAnalysis>(
    `/api/emails/${encodeURIComponent(emailId)}/ai-analysis`,
    {
      method: "POST",
    }
  );
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
  const url = `/api/emails/${encodeURIComponent(emailId)}/ai-analysis-stream${query ? `?${query}` : ""}`;

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

export function fetchEmailComments(emailId: string): Promise<EmailComment[]> {
  return fetchJson<EmailComment[]>(
    `/api/emails/${encodeURIComponent(emailId)}/comments`
  );
}

export function createEmailComment(
  emailId: string,
  payload: CreateEmailCommentPayload
): Promise<EmailComment> {
  return fetchJson<EmailComment>(
    `/api/emails/${encodeURIComponent(emailId)}/comments`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );
}

export function resolveComment(commentId: string): Promise<EmailComment> {
  return fetchJson<EmailComment>(
    `/api/comments/${encodeURIComponent(commentId)}/resolve`,
    {
      method: "PATCH",
    }
  );
}
