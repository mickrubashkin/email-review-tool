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
	BodyText     *string   `json:"-"`
	ContentParts *string   `json:"-"`
	UpdatedAt    time.Time `json:"-"`
	OriginalHTML string    `json:"original_html"`
}

type EmailContentParts = emailtext.ContentParts

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
	ErrorMessage *string
}
