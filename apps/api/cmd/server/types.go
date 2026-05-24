package main

import (
	"encoding/json"
	"time"

	"github.com/mickrubashkin/email-review-tool/apps/api/internal/emailtext"
)

type EmailListItem struct {
	ID                       string  `json:"id"`
	Sequence                 string  `json:"sequence"`
	Title                    string  `json:"title"`
	Subject                  *string `json:"subject"`
	Preheader                *string `json:"preheader"`
	SendTiming               *string `json:"send_timing"`
	Stage                    string  `json:"stage"`
	SortOrder                int     `json:"sort_order"`
	Language                 string  `json:"language"`
	Variant                  string  `json:"variant"`
	AdaptationKey            string  `json:"adaptation_key"`
	AdaptationLabel          string  `json:"adaptation_label"`
	ReviewStatus             string  `json:"review_status"`
	OpenCommentCount         int     `json:"open_comment_count"`
	OpenBlockingCommentCount int     `json:"open_blocking_comment_count"`
}

type EmailDetail struct {
	ID                       string          `json:"id"`
	Slug                     string          `json:"slug"`
	Sequence                 string          `json:"sequence"`
	Title                    string          `json:"title"`
	Subject                  *string         `json:"subject"`
	Preheader                *string         `json:"preheader"`
	SendTiming               *string         `json:"send_timing"`
	Stage                    string          `json:"stage"`
	SortOrder                int             `json:"sort_order"`
	Language                 string          `json:"language"`
	Variant                  string          `json:"variant"`
	AdaptationKey            string          `json:"adaptation_key"`
	AdaptationLabel          string          `json:"adaptation_label"`
	ReviewStatus             string          `json:"review_status"`
	OpenCommentCount         int             `json:"open_comment_count"`
	OpenBlockingCommentCount int             `json:"open_blocking_comment_count"`
	BodyText                 *string         `json:"-"`
	ContentParts             *string         `json:"-"`
	UpdatedAt                time.Time       `json:"-"`
	OriginalHTML             string          `json:"original_html"`
	ReviewHTML               *string         `json:"review_html"`
	TemplateHTML             string          `json:"template_html"`
	TemplateHash             *string         `json:"template_hash"`
	TemplateVersion          *string         `json:"template_version"`
	EditableFields           json.RawMessage `json:"editable_fields"`
}

type EmailContentParts = emailtext.ContentParts
type LinkGroups = emailtext.LinkGroups

type BoardItem struct {
	ID        string    `json:"id"`
	Key       string    `json:"key"`
	Name      string    `json:"name"`
	Stages    []string  `json:"stages"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type EmailAnalysis struct {
	Summary         string                `json:"summary"`
	Score           int                   `json:"score"`
	Verdict         string                `json:"verdict"`
	Checks          EmailAnalysisChecks   `json:"checks"`
	Recommendations []EmailRecommendation `json:"recommendations"`
}

type EmailAnalysisChecks struct {
	Subject        string `json:"subject"`
	Preheader      string `json:"preheader"`
	Focus          string `json:"focus"`
	CTA            string `json:"cta"`
	StageAlignment string `json:"stage_alignment"`
	Readability    string `json:"readability"`
}

type EmailRecommendation struct {
	Priority string `json:"priority"`
	Title    string `json:"title"`
	Details  string `json:"details"`
}

type AIAnalysisResult struct {
	Analysis EmailAnalysis
	Metrics  AIAnalysisMetrics
}

type AIAnalysisMetrics struct {
	Model        string
	Status       string
	LatencyMS    int
	InputTokens  *int
	OutputTokens *int
	TotalTokens  *int
	CachedTokens *int
	ErrorMessage *string
}

type AIAnalysisLogItem struct {
	ID           string    `json:"id"`
	EmailID      *string   `json:"email_id"`
	EmailTitle   *string   `json:"email_title"`
	EmailSlug    *string   `json:"email_slug"`
	Language     *string   `json:"language"`
	Variant      *string   `json:"variant"`
	UserID       *string   `json:"user_id"`
	UserEmail    *string   `json:"user_email"`
	Model        string    `json:"model"`
	Status       string    `json:"status"`
	CacheStatus  string    `json:"cache_status"`
	LatencyMS    int       `json:"latency_ms"`
	InputTokens  *int      `json:"input_tokens"`
	OutputTokens *int      `json:"output_tokens"`
	TotalTokens  *int      `json:"total_tokens"`
	CachedTokens *int      `json:"cached_tokens"`
	ErrorMessage *string   `json:"error_message"`
	CreatedAt    time.Time `json:"created_at"`
}

type AuthUser struct {
	ID    string `json:"-"`
	Email string `json:"email"`
	Role  string `json:"role"`
}

type UserAdminItem struct {
	ID         string     `json:"id"`
	Email      string     `json:"email"`
	Role       string     `json:"role"`
	CreatedAt  time.Time  `json:"created_at"`
	UpdatedAt  time.Time  `json:"updated_at"`
	LastSeenAt *time.Time `json:"last_seen_at"`
}

type AuthEventItem struct {
	ID        string    `json:"id"`
	UserID    *string   `json:"user_id"`
	Email     string    `json:"email"`
	EventType string    `json:"event_type"`
	Success   bool      `json:"success"`
	IPAddress *string   `json:"ip_address"`
	UserAgent *string   `json:"user_agent"`
	CreatedAt time.Time `json:"created_at"`
}

type OperationalEventItem struct {
	ID         string          `json:"id"`
	Level      string          `json:"level"`
	EventType  string          `json:"event_type"`
	Message    string          `json:"message"`
	UserID     *string         `json:"user_id"`
	UserEmail  *string         `json:"user_email"`
	RequestID  *string         `json:"request_id"`
	Method     *string         `json:"method"`
	Path       *string         `json:"path"`
	StatusCode *int            `json:"status_code"`
	DurationMS *int            `json:"duration_ms"`
	Metadata   json.RawMessage `json:"metadata"`
	CreatedAt  time.Time       `json:"created_at"`
}

type EmailEventItem struct {
	ID          string          `json:"id"`
	ActorUserID *string         `json:"actor_user_id"`
	ActorEmail  string          `json:"actor_email"`
	Action      string          `json:"action"`
	EmailID     *string         `json:"email_id"`
	EmailSlug   *string         `json:"email_slug"`
	EmailTitle  *string         `json:"email_title"`
	Metadata    json.RawMessage `json:"metadata"`
	Changes     json.RawMessage `json:"changes"`
	CreatedAt   time.Time       `json:"created_at"`
}

type EmailActivityItem struct {
	ID         string          `json:"id"`
	Type       string          `json:"type"`
	ActorEmail *string         `json:"actor_email"`
	CreatedAt  time.Time       `json:"created_at"`
	Summary    string          `json:"summary"`
	Metadata   json.RawMessage `json:"metadata"`
	Changes    json.RawMessage `json:"changes"`
}

type EmailComment struct {
	ID              string                `json:"id"`
	EmailID         string                `json:"email_id"`
	UserID          *string               `json:"user_id"`
	AuthorEmail     *string               `json:"author_email"`
	ReviewBlock     string                `json:"review_block"`
	SelectedText    string                `json:"selected_text"`
	StartOffset     int                   `json:"start_offset"`
	EndOffset       int                   `json:"end_offset"`
	Body            string                `json:"body"`
	Status          string                `json:"status"`
	Severity        string                `json:"severity"`
	CreatedAt       time.Time             `json:"created_at"`
	ResolvedAt      *time.Time            `json:"resolved_at"`
	ResolvedBy      *string               `json:"resolved_by"`
	ResolvedByEmail *string               `json:"resolved_by_email"`
	Messages        []EmailCommentMessage `json:"messages"`
}

type EmailCommentMessage struct {
	ID          string    `json:"id"`
	CommentID   string    `json:"comment_id"`
	UserID      *string   `json:"user_id"`
	AuthorEmail *string   `json:"author_email"`
	Body        string    `json:"body"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}
