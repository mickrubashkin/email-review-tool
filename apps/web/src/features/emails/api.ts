import type {
  AIAnalysisLogFilters,
  AIAnalysisLogItem,
  AuthEventFilters,
  AuthEventItem,
  AuthUser,
  Board,
  BoardApprovalArea,
  CreateBoardApprovalAreaPayload,
  CreateAdminUserPayload,
  CreateBoardPayload,
  CreateBoardStagePayload,
  CreateCommentMessagePayload,
  EmailAnalysis,
  EmailDetail,
  EmailEventFilters,
  EmailEventItem,
  EmailHTMLInspection,
  EmailListItem,
  EmailVersionDetail,
  EmailVersionListItem,
  OperationalEventFilters,
  OperationalEventItem,
  CreateEmailPayload,
  CreateEmailCommentPayload,
  DuplicateEmailPayload,
  EmailActivityItem,
  EmailAreaApproval,
  EmailComment,
  EmailCommentMessage,
  UserAdminItem,
  UserRole,
  RenderedEmail,
  ReorderBoardApprovalAreasPayload,
  ReorderBoardStagesPayload,
  UpdateBoardStagePayload,
  UpdateBoardApprovalAreaPayload,
  UpdateEmailAreaApprovalPayload,
  UpdateEmailPlanningFieldsPayload,
  UpdateEmailPlanningFieldsResponse,
  EmailReviewArea,
  UpdateEmailReviewStatusPayload,
  UpdateEmailReviewStatusResponse,
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

export function devLogin(email: string): Promise<{ ok: boolean }> {
  return fetchJson<{ ok: boolean }>("/api/auth/dev-login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email }),
  });
}

export function demoLogin(): Promise<{ ok: boolean }> {
  return fetchJson<{ ok: boolean }>("/api/auth/demo-login", {
    method: "POST",
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

export function fetchEmailEvents(
  filters: EmailEventFilters
): Promise<EmailEventItem[]> {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    const trimmedValue = value?.trim();
    if (trimmedValue) {
      params.set(key, trimmedValue);
    }
  });

  const query = params.toString();
  return fetchJson<EmailEventItem[]>(
    `/api/admin/email-events${query ? `?${query}` : ""}`
  );
}

export function fetchEmailActivity(emailId: string): Promise<EmailActivityItem[]> {
  return fetchJson<EmailActivityItem[]>(
    `/api/emails/${encodeURIComponent(emailId)}/activity`
  );
}

export function fetchOperationalEvents(
  filters: OperationalEventFilters
): Promise<OperationalEventItem[]> {
  const params = new URLSearchParams();

  Object.entries(filters).forEach(([key, value]) => {
    const trimmedValue = value?.trim();
    if (trimmedValue) {
      params.set(key, trimmedValue);
    }
  });

  const query = params.toString();
  return fetchJson<OperationalEventItem[]>(
    `/api/admin/operational-events${query ? `?${query}` : ""}`
  );
}

export function logout(): Promise<{ ok: boolean }> {
  return fetchJson<{ ok: boolean }>("/api/auth/logout",
    {
      method: "POST",
    }
  );
}

export function fetchBoards(): Promise<Board[]> {
  return fetchJson<Board[]>("/api/boards");
}

export function createBoard(payload: CreateBoardPayload): Promise<Board> {
  return fetchJson<Board>("/api/boards", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export function fetchBoardApprovalAreas(
  boardKey: string
): Promise<BoardApprovalArea[]> {
  return fetchJson<BoardApprovalArea[]>(
    `/api/boards/${encodeURIComponent(boardKey)}/approval-areas`
  );
}

export function createBoardApprovalArea(
  boardKey: string,
  payload: CreateBoardApprovalAreaPayload
): Promise<BoardApprovalArea> {
  return fetchJson<BoardApprovalArea>(
    `/api/boards/${encodeURIComponent(boardKey)}/approval-areas`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );
}

export function updateBoardApprovalArea(
  boardKey: string,
  areaKey: string,
  payload: UpdateBoardApprovalAreaPayload
): Promise<BoardApprovalArea> {
  return fetchJson<BoardApprovalArea>(
    `/api/boards/${encodeURIComponent(boardKey)}/approval-areas/${encodeURIComponent(areaKey)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );
}

export function deleteBoardApprovalArea(
  boardKey: string,
  areaKey: string
): Promise<BoardApprovalArea> {
  return fetchJson<BoardApprovalArea>(
    `/api/boards/${encodeURIComponent(boardKey)}/approval-areas/${encodeURIComponent(areaKey)}`,
    {
      method: "DELETE",
    }
  );
}

export function reorderBoardApprovalAreas(
  boardKey: string,
  payload: ReorderBoardApprovalAreasPayload
): Promise<BoardApprovalArea[]> {
  return fetchJson<BoardApprovalArea[]>(
    `/api/boards/${encodeURIComponent(boardKey)}/approval-areas`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );
}

export function createBoardStage(
  boardKey: string,
  payload: CreateBoardStagePayload
): Promise<Board> {
  return fetchJson<Board>(`/api/boards/${encodeURIComponent(boardKey)}/stages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export function updateBoardStage(
  boardKey: string,
  stage: string,
  payload: UpdateBoardStagePayload
): Promise<Board> {
  return fetchJson<Board>(
    `/api/boards/${encodeURIComponent(boardKey)}/stages/${encodeURIComponent(stage)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );
}

export function deleteBoardStage(boardKey: string, stage: string): Promise<Board> {
  return fetchJson<Board>(
    `/api/boards/${encodeURIComponent(boardKey)}/stages/${encodeURIComponent(stage)}`,
    {
      method: "DELETE",
    }
  );
}

export function reorderBoardStages(
  boardKey: string,
  payload: ReorderBoardStagesPayload
): Promise<Board> {
  return fetchJson<Board>(`/api/boards/${encodeURIComponent(boardKey)}/stages`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export function fetchEmails(boardKey?: string): Promise<EmailListItem[]> {
  const query = boardKey ? `?board=${encodeURIComponent(boardKey)}` : "";
  return fetchJson<EmailListItem[]>(`/api/emails${query}`);
}

export function fetchEmailDetail(emailId: string): Promise<EmailDetail> {
  return fetchJson<EmailDetail>(`/api/emails/${encodeURIComponent(emailId)}`);
}

export function createEmail(payload: CreateEmailPayload): Promise<EmailDetail> {
  return fetchJson<EmailDetail>("/api/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export function inspectEmailHTML(originalHTML: string): Promise<EmailHTMLInspection> {
  return fetchJson<EmailHTMLInspection>("/api/emails/inspect-html", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ original_html: originalHTML }),
  });
}

export function fetchRenderedEmail(emailId: string): Promise<RenderedEmail> {
  return fetchJson<RenderedEmail>(
    `/api/emails/${encodeURIComponent(emailId)}/rendered`
  );
}

export function fetchEmailVersions(
  emailId: string
): Promise<EmailVersionListItem[]> {
  return fetchJson<EmailVersionListItem[]>(
    `/api/emails/${encodeURIComponent(emailId)}/versions`
  );
}

export function fetchEmailVersion(
  emailId: string,
  versionId: string
): Promise<EmailVersionDetail> {
  return fetchJson<EmailVersionDetail>(
    `/api/emails/${encodeURIComponent(emailId)}/versions/${encodeURIComponent(versionId)}`
  );
}

export function restoreEmailVersion(
  emailId: string,
  versionId: string
): Promise<void> {
  return fetchJson<void>(
    `/api/emails/${encodeURIComponent(emailId)}/versions/${encodeURIComponent(versionId)}/restore`,
    {
      method: "POST",
    }
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

export function updateEmailReviewStatus(
  emailId: string,
  payload: UpdateEmailReviewStatusPayload
): Promise<UpdateEmailReviewStatusResponse> {
  return fetchJson<UpdateEmailReviewStatusResponse>(
    `/api/emails/${encodeURIComponent(emailId)}/review-status`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );
}

export function listEmailAreaApprovals(
  emailId: string
): Promise<EmailAreaApproval[]> {
  return fetchJson<EmailAreaApproval[]>(
    `/api/emails/${encodeURIComponent(emailId)}/area-approvals`
  );
}

export function updateEmailAreaApproval(
  emailId: string,
  area: EmailReviewArea,
  payload: UpdateEmailAreaApprovalPayload
): Promise<EmailAreaApproval> {
  return fetchJson<EmailAreaApproval>(
    `/api/emails/${encodeURIComponent(emailId)}/area-approvals/${encodeURIComponent(area)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );
}

export function updateEmailPlanningFields(
  emailId: string,
  payload: UpdateEmailPlanningFieldsPayload
): Promise<UpdateEmailPlanningFieldsResponse> {
  return fetchJson<UpdateEmailPlanningFieldsResponse>(
    `/api/emails/${encodeURIComponent(emailId)}/planning-fields`,
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
    `/api/emails/${encodeURIComponent(emailId)}/duplicate-as`,
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

export function createAdminUser(
  payload: CreateAdminUserPayload
): Promise<UserAdminItem> {
  return fetchJson<UserAdminItem>("/api/admin/users", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
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

export async function fetchSharedEmailAnalysis(
  emailId: string
): Promise<EmailAnalysis | null> {
  const response = await fetch(`/api/emails/${encodeURIComponent(emailId)}/ai-analysis`, {
    credentials: "include",
  });

  if (response.status === 204) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Request failed with ${response.status}`);
  }

  return (await response.json()) as EmailAnalysis;
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

  source.addEventListener("error", (event) => {
    if (event instanceof MessageEvent && typeof event.data === "string" && event.data) {
      try {
        handlers.onError?.(JSON.parse(event.data) as string);
      } catch {
        handlers.onError?.(event.data);
      }
    } else {
      handlers.onError?.("stream error");
    }
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

export function createCommentMessage(
  commentId: string,
  payload: CreateCommentMessagePayload
): Promise<EmailCommentMessage> {
  return fetchJson<EmailCommentMessage>(
    `/api/comments/${encodeURIComponent(commentId)}/messages`,
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
