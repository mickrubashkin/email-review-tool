package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func registerAIRoutes(r chi.Router, dbpool *pgxpool.Pool) {
	r.Post("/api/emails/{id}/ai-analysis", analyzeEmailHandler(dbpool))
}

func analyzeEmailHandler(dbpool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
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

		reviewRules, err := loadAIContextFile("email_review_rules.md")
		if err != nil {
			fmt.Fprintf(os.Stderr, "failed to load email review rules: %v\n", err)
			http.Error(w, "failed to load review rules", http.StatusInternalServerError)
			return
		}

		sequenceContext, err := loadAIContextFile("onboarding-sequence.md")
		if err != nil {
			fmt.Fprintf(os.Stderr, "failed to load onboarding sequence context: %v\n", err)
			http.Error(w, "failed to load sequence context", http.StatusInternalServerError)
			return
		}

		model := os.Getenv("OPENAI_MODEL")
		if model == "" {
			model = "gpt-5-nano"
		}

		analysis, err := analyzeEmailWithOpenAI(r.Context(), openAIAPIKey, model, reviewRules, sequenceContext, email)
		if err != nil {
			fmt.Fprintf(os.Stderr, "failed to analyze email %s: %v\n", id, err)
			http.Error(w, "failed to analyze email", http.StatusBadGateway)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(analysis)
	}
}
