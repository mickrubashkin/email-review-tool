export type EmailListItem = {
  id: string;
  sequence: string;
  title: string;
  subject: string | null;
  preheader: string | null;
  send_timing: string | null;
  stage: string | null;
  sort_order: number;
  language: string;
  variant: EmailVariant;
  open_comment_count: number;
};

export type EmailDetail = EmailListItem & {
  slug: string;
  original_html: string;
  review_html: string | null;
  template_html: string;
  template_hash: string | null;
  template_version: string | null;
  editable_fields: EditableFields;
};

export type EmailVariant = "new" | "old";

export type DuplicateEmailPayload = {
  language: string;
  variant?: EmailVariant;
  title?: string;
  subject?: string;
  preheader?: string;
};

export type EditableFieldType = "text" | "url" | "image" | "number";

export type EditableField = {
  type: EditableFieldType;
  value: string | number;
  order?: number;
};

export type EditableFields = Record<string, EditableField>;

export type UpdateEditableFieldsPayload = {
  title: string;
  subject: string;
  preheader: string;
  editable_fields: EditableFields;
};

export type RenderedEmail = {
  html: string;
};

export type EmailAnalysis = {
  summary: string;
  score: number;
  verdict: EmailAnalysisVerdict;
  checks: EmailAnalysisChecks;
  recommendations: EmailRecommendation[];
};

export type EmailAnalysisVerdict = "ready" | "minor_fixes" | "needs_work";

export type EmailAnalysisCheckStatus = "good" | "weak" | "bad";

export type EmailAnalysisChecks = {
  subject: EmailAnalysisCheckStatus;
  preheader: EmailAnalysisCheckStatus;
  focus: EmailAnalysisCheckStatus;
  cta: EmailAnalysisCheckStatus;
  stage_alignment: EmailAnalysisCheckStatus;
  readability: EmailAnalysisCheckStatus;
};

export type EmailAnalysisStreamEvent =
  | {
    type: "delta";
    text: string;
  }
  | {
    type: "done";
  }
  | {
    type: "error";
    message: string;
  };

export type EmailAnalysisStreamState = {
  status: "idle" | "streaming" | "done" | "error";
  text: string;
  error: string | null;
};

export type EmailRecommendation = {
  priority: "high" | "medium" | "low";
  title: string;
  details: string;
};

export type AIAnalysisLogItem = {
  id: string;
  email_id: string | null;
  email_title: string | null;
  email_slug: string | null;
  language: string | null;
  variant: string | null;
  model: string;
  status: string;
  cache_status: "hit" | "miss" | "unknown";
  latency_ms: number;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  cached_tokens: number | null;
  error_message: string | null;
  created_at: string;
};

export type AIAnalysisLogFilters = {
  status?: string;
  cache_status?: string;
  email_id?: string;
  model?: string;
  limit?: string;
};

export type AuthUser = {
  email: string;
  role: UserRole;
};

export type UserRole = "super_admin" | "admin" | "reviewer";

export type UserAdminItem = {
  id: string;
  email: string;
  role: UserRole;
  created_at: string;
  updated_at: string;
};

export type AuthEventItem = {
  id: string;
  user_id: string | null;
  email: string;
  event_type: string;
  success: boolean;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
};

export type AuthEventFilters = {
  email?: string;
  event_type?: string;
  success?: string;
  limit?: string;
};

export type EmailEventAction =
  | "email_duplicated"
  | "email_created"
  | "email_archived"
  | "email_updated";

export type EmailEventItem = {
  id: string;
  actor_user_id: string | null;
  actor_email: string;
  action: EmailEventAction;
  email_id: string | null;
  email_slug: string | null;
  email_title: string | null;
  metadata: Record<string, unknown>;
  changes: Record<string, unknown>;
  created_at: string;
};

export type EmailEventFilters = {
  actor_email?: string;
  action?: string;
  email?: string;
  limit?: string;
};

export type EmailVersionGroup = {
  key: string;
  stage: string;
  sortOrder: number;
  versions: EmailListItem[];
};

export type StageColumn = {
  stage: string;
  title: string;
  sortOrder: number;
  emailGroups: EmailVersionGroup[];
};

export type EmailComment = {
  id: string;
  email_id: string;
  user_id: string | null;
  author_email: string | null;
  review_block: string;
  selected_text: string;
  start_offset: number;
  end_offset: number;
  body: string;
  status: "open" | "resolved";
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  resolved_by_email: string | null;
};

export type CreateEmailCommentPayload = {
  review_block: string;
  selected_text: string;
  start_offset: number;
  end_offset: number;
  body: string;
};
