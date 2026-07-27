import { fetchJson } from "../../shared/api";
import type {
  CreateCommentMessagePayload,
  EmailAnalysis,
  EmailDetail,
  EmailHTMLInspection,
  EmailListItem,
  EmailVersionDetail,
  EmailVersionListItem,
  CreateEmailPayload,
  CreateEmailCommentPayload,
  DuplicateEmailPayload,
  EmailActivityItem,
  EmailAreaApproval,
  EmailComment,
  EmailCommentMessage,
  RenderedEmail,
  UpdateEmailAreaApprovalPayload,
  UpdateEmailPlanningFieldsPayload,
  UpdateEmailPlanningFieldsResponse,
  EmailReviewArea,
  UpdateEmailReviewStatusPayload,
  UpdateEmailReviewStatusResponse,
  UpdateEditableFieldsPayload,
} from "./types";

export function fetchEmailActivity(emailId: string): Promise<EmailActivityItem[]> {
  return fetchJson<EmailActivityItem[]>(
    `/api/emails/${encodeURIComponent(emailId)}/activity`
  );
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
