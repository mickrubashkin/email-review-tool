package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
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

var (
	htmlTagPattern    = regexp.MustCompile(`(?is)<[^>]*>`)
	whitespacePattern = regexp.MustCompile(`\s+`)
	namedEntities     = strings.NewReplacer(
		"&amp;", "&",
		"&lt;", "<",
		"&gt;", ">",
		"&quot;", `"`,
		"&#39;", "'",
		"&apos;", "'",
		"&nbsp;", " ",
		"&zwnj;", " ",
		"&ndash;", "-",
		"&mdash;", "-",
	)
)

func main() {
	_ = godotenv.Load("../../.env")
	databaseURL := os.Getenv("DATABASE_URL")
	ctx := context.Background()
	if databaseURL == "" {
		fmt.Fprintln(os.Stderr, "DATABASE_URL is required")
		os.Exit(1)
	}

	dbpool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Unable to create connection pool: %v\n", err)
		os.Exit(1)
	}
	defer dbpool.Close()

	err = dbpool.Ping(ctx)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Unable to ping database: %v\n", err)
		os.Exit(1)
	}

	r := chi.NewRouter()

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		err := dbpool.Ping(r.Context())
		if err != nil {
			w.WriteHeader(http.StatusServiceUnavailable)
			_ = json.NewEncoder(w).Encode(map[string]string{
				"status":   "error",
				"database": "error",
			})
			return
		}

		_ = json.NewEncoder(w).Encode(map[string]string{
			"status":   "ok",
			"database": "ok",
		})
	})

	r.Get("/api/emails", func(w http.ResponseWriter, r *http.Request) {
		rows, err := dbpool.Query(r.Context(), `
			SELECT
				id,
				sequence,
				title,
				subject,
				preheader,
				send_timing,
				stage,
				sort_order,
				language
			FROM emails
			ORDER BY sort_order, created_at;
		`)
		if err != nil {
			http.Error(w, "failed to load emails", http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		emails := []EmailListItem{}

		for rows.Next() {
			var email EmailListItem

			err := rows.Scan(
				&email.ID,
				&email.Sequence,
				&email.Title,
				&email.Subject,
				&email.Preheader,
				&email.SendTiming,
				&email.Stage,
				&email.SortOrder,
				&email.Language,
			)
			if err != nil {
				fmt.Fprintf(os.Stderr, "failed to scan email row: %v\n", err)
				http.Error(w, "failed to read emails", http.StatusInternalServerError)
				return
			}

			emails = append(emails, email)
		}

		if err := rows.Err(); err != nil {
			http.Error(w, "failed to read emails", http.StatusInternalServerError)
			return
		}

		_ = json.NewEncoder(w).Encode(emails)
	})

	r.Get("/api/emails/{id}", func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")

		var email EmailDetail

		err := dbpool.QueryRow(r.Context(), `
			SELECT
				id,
				slug,
				sequence,
				title,
				subject,
				preheader,
				send_timing,
				stage,
				sort_order,
				language,
				original_html
			FROM emails
			WHERE id = $1;
		`, id).Scan(
			&email.ID,
			&email.Slug,
			&email.Sequence,
			&email.Title,
			&email.Subject,
			&email.Preheader,
			&email.SendTiming,
			&email.Stage,
			&email.SortOrder,
			&email.Language,
			&email.OriginalHTML,
		)

		if err != nil {
			fmt.Fprintf(os.Stderr, "failed to get email %s: %v\n", id, err)
			http.Error(w, "email not found", http.StatusNotFound)
			return
		}

		_ = json.NewEncoder(w).Encode(email)
	})

	r.Post("/api/emails/{id}/ai-analysis", func(w http.ResponseWriter, r *http.Request) {
		openAIAPIKey := os.Getenv("OPENAI_API_KEY")
		if openAIAPIKey == "" {
			http.Error(w, "OPENAI_API_KEY is not configured", http.StatusServiceUnavailable)
			return
		}

		id := chi.URLParam(r, "id")
		var email EmailDetail

		err := dbpool.QueryRow(r.Context(), `
			SELECT
				id,
				slug,
				sequence,
				title,
				subject,
				preheader,
				send_timing,
				stage,
				sort_order,
				language,
				original_html
			FROM emails
			WHERE id = $1;
		`, id).Scan(
			&email.ID,
			&email.Slug,
			&email.Sequence,
			&email.Title,
			&email.Subject,
			&email.Preheader,
			&email.SendTiming,
			&email.Stage,
			&email.SortOrder,
			&email.Language,
			&email.OriginalHTML,
		)
		if err != nil {
			fmt.Fprintf(os.Stderr, "failed to get email %s for ai analysis: %v\n", id, err)
			http.Error(w, "email not found", http.StatusNotFound)
			return
		}

		rules, err := loadEmailReviewRules()
		if err != nil {
			fmt.Fprintf(os.Stderr, "failed to load email review rules: %v\n", err)
			http.Error(w, "failed to load review rules", http.StatusInternalServerError)
			return
		}

		model := os.Getenv("OPENAI_MODEL")
		if model == "" {
			model = "gpt-5-nano"
		}

		analysis, err := analyzeEmailWithOpenAI(r.Context(), openAIAPIKey, model, rules, email)
		if err != nil {
			fmt.Fprintf(os.Stderr, "failed to analyze email %s: %v\n", id, err)
			http.Error(w, "failed to analyze email", http.StatusBadGateway)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(analysis)
	})

	http.ListenAndServe(":8080", r)
}

func analyzeEmailWithOpenAI(ctx context.Context, apiKey string, model string, rules string, email EmailDetail) (EmailAnalysis, error) {
	requestBody := map[string]any{
		"model": model,
		"instructions": strings.TrimSpace(`
You are an email review assistant for a partner onboarding workflow.
Analyze only the email text and metadata. Do not review HTML, CSS, layout, rendering, accessibility, or template implementation.
Use the review rules and common email marketing best practices.
Return only valid JSON with this exact shape:
{
  "summary": "one sentence overall assessment",
  "score": 7,
  "recommendations": [
    { "title": "Improve CTA clarity", "details": "specific recommendation under 180 characters" }
  ]
}
Use a score from 1 to 10. Return at most 3 recommendations. Keep every recommendation practical, text-focused, and specific.
`),
		"input": buildEmailAnalysisInput(rules, email),
	}

	bodyBytes, err := json.Marshal(requestBody)
	if err != nil {
		return EmailAnalysis{}, err
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.openai.com/v1/responses", bytes.NewReader(bodyBytes))
	if err != nil {
		return EmailAnalysis{}, err
	}
	request.Header.Set("Authorization", "Bearer "+apiKey)
	request.Header.Set("Content-Type", "application/json")

	client := http.Client{Timeout: 45 * time.Second}
	response, err := client.Do(request)
	if err != nil {
		return EmailAnalysis{}, err
	}
	defer response.Body.Close()

	responseBytes, err := io.ReadAll(response.Body)
	if err != nil {
		return EmailAnalysis{}, err
	}

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return EmailAnalysis{}, fmt.Errorf("openai returned %d: %s", response.StatusCode, string(responseBytes))
	}

	outputText, err := extractOpenAIOutputText(responseBytes)
	if err != nil {
		return EmailAnalysis{}, err
	}

	var analysis EmailAnalysis
	if err := json.Unmarshal([]byte(outputText), &analysis); err != nil {
		return EmailAnalysis{}, fmt.Errorf("failed to parse analysis json: %w", err)
	}

	return analysis, nil
}

func buildEmailAnalysisInput(rules string, email EmailDetail) string {
	return fmt.Sprintf(`Review rules:
%s

Email metadata:
- Title: %s
- Subject: %s
- Preheader: %s
- Send timing: %s
- Stage: %s
- Language: %s

Email body text:
%s`,
		rules,
		email.Title,
		stringValue(email.Subject),
		stringValue(email.Preheader),
		stringValue(email.SendTiming),
		email.Stage,
		email.Language,
		limitText(htmlToText(email.OriginalHTML), 6000),
	)
}

func limitText(value string, maxLength int) string {
	if len(value) <= maxLength {
		return value
	}

	return strings.TrimSpace(value[:maxLength])
}

func extractOpenAIOutputText(responseBytes []byte) (string, error) {
	var response struct {
		OutputText string `json:"output_text"`
		Output     []struct {
			Content []struct {
				Text string `json:"text"`
			} `json:"content"`
		} `json:"output"`
	}
	if err := json.Unmarshal(responseBytes, &response); err != nil {
		return "", err
	}

	if strings.TrimSpace(response.OutputText) != "" {
		return strings.TrimSpace(response.OutputText), nil
	}

	var builder strings.Builder
	for _, output := range response.Output {
		for _, content := range output.Content {
			if strings.TrimSpace(content.Text) != "" {
				builder.WriteString(content.Text)
			}
		}
	}

	text := strings.TrimSpace(builder.String())
	if text == "" {
		return "", fmt.Errorf("openai response did not include output text")
	}

	return stripMarkdownCodeFence(text), nil
}

func stripMarkdownCodeFence(text string) string {
	text = strings.TrimSpace(text)
	if !strings.HasPrefix(text, "```") {
		return text
	}

	text = strings.TrimPrefix(text, "```json")
	text = strings.TrimPrefix(text, "```JSON")
	text = strings.TrimPrefix(text, "```")
	text = strings.TrimSuffix(text, "```")

	return strings.TrimSpace(text)
}

func loadEmailReviewRules() (string, error) {
	workingDir, err := os.Getwd()
	if err != nil {
		return "", err
	}

	for dir := workingDir; ; dir = filepath.Dir(dir) {
		candidates := []string{
			filepath.Join(dir, "ai", "email_review_rules.md"),
			filepath.Join(dir, "apps", "api", "ai", "email_review_rules.md"),
		}
		for _, candidate := range candidates {
			rulesBytes, err := os.ReadFile(candidate)
			if err == nil {
				return string(rulesBytes), nil
			}
			if err != nil && !os.IsNotExist(err) {
				return "", err
			}
		}

		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
	}

	return "", fmt.Errorf("ai/email_review_rules.md was not found from %s or its parents", workingDir)
}

func htmlToText(value string) string {
	value = htmlTagPattern.ReplaceAllString(value, " ")
	value = namedEntities.Replace(value)
	value = strings.ReplaceAll(value, "\u200c", " ")
	value = whitespacePattern.ReplaceAllString(value, " ")

	return strings.TrimSpace(value)
}

func stringValue(value *string) string {
	if value == nil {
		return ""
	}

	return *value
}
