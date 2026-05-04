package main

import (
	"time"

	"github.com/mickrubashkin/email-review-tool/apps/api/internal/emailtext"
)

type EmailListItem struct {
	ID         string  `json:"id"`
	Sequence   string  `json:"sequence"`
	Title      string  `json:"title"`
	Subject    *string `json:"subject"`
	Preheader  *string `json:"preheader"`
	SendTiming *string `json:"send_timing"`
	Stage      string  `json:"stage"`
	SortOrder  int     `json:"sort_order"`
	Language   string  `json:"language"`
	Variant    string  `json:"variant"`
}

type EmailDetail struct {
	ID           string    `json:"id"`
	Slug         string    `json:"slug"`
	Sequence     string    `json:"sequence"`
	Title        string    `json:"title"`
	Subject      *string   `json:"subject"`
	Preheader    *string   `json:"preheader"`
	SendTiming   *string   `json:"send_timing"`
	Stage        string    `json:"stage"`
	SortOrder    int       `json:"sort_order"`
	Language     string    `json:"language"`
	Variant      string    `json:"variant"`
	BodyText     *string   `json:"-"`
	ContentParts *string   `json:"-"`
	UpdatedAt    time.Time `json:"-"`
	OriginalHTML string    `json:"original_html"`
}

type EmailContentParts = emailtext.ContentParts
type LinkGroups = emailtext.LinkGroups

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
