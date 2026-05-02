package main

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
	ID           string  `json:"id"`
	Slug         string  `json:"slug"`
	Sequence     string  `json:"sequence"`
	Title        string  `json:"title"`
	Subject      *string `json:"subject"`
	Preheader    *string `json:"preheader"`
	SendTiming   *string `json:"send_timing"`
	Stage        string  `json:"stage"`
	SortOrder    int     `json:"sort_order"`
	Language     string  `json:"language"`
	BodyText     *string `json:"-"`
	OriginalHTML string  `json:"original_html"`
}

type EmailAnalysis struct {
	Summary         string                `json:"summary"`
	Score           int                   `json:"score"`
	Recommendations []EmailRecommendation `json:"recommendations"`
}

type EmailRecommendation struct {
	Title   string `json:"title"`
	Details string `json:"details"`
}
