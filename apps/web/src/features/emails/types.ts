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
  adaptation_key: string;
  adaptation_label: string;
  review_status: EmailReviewStatus;
  open_comment_count: number;
  open_blocking_comment_count: number;
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

export type EmailVariant = string;

export type EmailReviewStatus =
  | "draft"
  | "in_review"
  | "changes_requested"
  | "approved";

export type EmailCommentSeverity = "suggestion" | "issue" | "blocking";

export type Board = {
  id: string;
  key: string;
  name: string;
  stages: string[];
  created_at: string;
  updated_at: string;
};

export type CreateBoardPayload = {
  name: string;
  key?: string;
  source_board_key?: string;
};

export type CreateBoardStagePayload = {
  name: string;
  key?: string;
};

export type UpdateBoardStagePayload = {
  name: string;
};

export type ReorderBoardStagesPayload = {
  stages: string[];
};

export type CreateEmailPayload = {
  sequence?: string;
  title: string;
  subject?: string;
  preheader?: string;
  send_timing?: string;
  stage: string;
  sort_order: number;
  language: string;
  variant: EmailVariant;
  adaptation_label?: string;
  original_html: string;
};

export type EmailHTMLInspection = {
  review_block_count: number;
  original_review_block_count: number;
  editable_field_count: number;
  editable_fields: Array<{
    key: string;
    type: EditableFieldType;
    value_preview: string;
  }>;
  warnings: string[];
  review_html: string;
};

export type DuplicateEmailPayload = {
  language: string;
  variant?: EmailVariant;
  title?: string;
  subject?: string;
  preheader?: string;
};

export type CreateEmailAdaptationPayload = {
  label: string;
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
  original_html?: string;
};

export type UpdateEmailReviewStatusPayload = {
  review_status: EmailReviewStatus;
};

export type UpdateEmailReviewStatusResponse = {
  review_status: EmailReviewStatus;
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
  user_id: string | null;
  user_email: string | null;
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
  last_seen_at: string | null;
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

export type OperationalEventItem = {
  id: string;
  level: "info" | "warn" | "error";
  event_type: string;
  message: string;
  user_id: string | null;
  user_email: string | null;
  request_id: string | null;
  method: string | null;
  path: string | null;
  status_code: number | null;
  duration_ms: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type OperationalEventFilters = {
  level?: string;
  event_type?: string;
  user_email?: string;
  request_id?: string;
  path?: string;
  limit?: string;
};

export type EmailEventAction =
  | "email_duplicated"
  | "email_adaptation_created"
  | "email_created"
  | "email_archived"
  | "email_updated"
  | "email_review_status_updated"
  | "comment_created"
  | "comment_replied"
  | "comment_resolved"
  | "board_created"
  | "board_stage_created"
  | "board_stage_renamed"
  | "board_stage_deleted"
  | "board_stages_reordered";

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

export type EmailActivityType =
  | "comment_created"
  | "comment_replied"
  | "comment_resolved"
  | "email_created"
  | "email_updated"
  | "email_review_status_updated"
  | "email_duplicated"
  | "email_adaptation_created"
  | "email_archived"
  | "ai_analysis_run";

export type EmailActivityItem = {
  id: string;
  type: EmailActivityType;
  actor_email: string | null;
  created_at: string;
  summary: string;
  metadata: Record<string, unknown>;
  changes: Record<string, unknown>;
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
  severity: EmailCommentSeverity;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  resolved_by_email: string | null;
  messages: EmailCommentMessage[];
};

export type EmailCommentMessage = {
  id: string;
  comment_id: string;
  user_id: string | null;
  author_email: string | null;
  body: string;
  created_at: string;
  updated_at: string;
};

export type CreateEmailCommentPayload = {
  review_block: string;
  selected_text: string;
  start_offset: number;
  end_offset: number;
  body: string;
  severity: EmailCommentSeverity;
};

export type CreateCommentMessagePayload = {
  body: string;
};
