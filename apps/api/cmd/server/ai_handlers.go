package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func registerAIRoutes(r chi.Router, dbpool *pgxpool.Pool, aiService AIAnalysisService) {
	r.Post("/api/emails/{id}/ai-analysis", analyzeEmailHandler(dbpool, aiService))
}

func analyzeEmailHandler(dbpool *pgxpool.Pool, aiService AIAnalysisService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if aiService.APIKey == "" {
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
				body_text,
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
			&email.BodyText,
			&email.OriginalHTML,
		)
		if err != nil {
			fmt.Fprintf(os.Stderr, "failed to get email %s for ai analysis: %v\n", id, err)
			http.Error(w, "email not found", http.StatusNotFound)
			return
		}

		result, err := aiService.AnalyzeEmail(r.Context(), email)
		if err != nil {
			if logErr := insertAIAnalysisLog(r.Context(), dbpool, email.ID, result.Metrics); logErr != nil {
				fmt.Fprintf(os.Stderr, "failed to log ai analysis error for email %s: %v\n", id, logErr)
			}
			fmt.Fprintf(os.Stderr, "failed to analyze email %s: %v\n", id, err)
			http.Error(w, "failed to analyze email", http.StatusBadGateway)
			return
		}

		if logErr := insertAIAnalysisLog(r.Context(), dbpool, email.ID, result.Metrics); logErr != nil {
			fmt.Fprintf(os.Stderr, "failed to log ai analysis success for email %s: %v\n", id, logErr)
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(result.Analysis)
	}
}

func insertAIAnalysisLog(ctx context.Context, dbpool *pgxpool.Pool, emailID string, metrics AIAnalysisMetrics) error {
	_, err := dbpool.Exec(ctx, `
		INSERT INTO ai_analysis_logs (
			email_id,
			model,
			status,
			latency_ms,
			input_tokens,
			output_tokens,
			total_tokens,
			error_message
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8);
	`,
		emailID,
		metrics.Model,
		metrics.Status,
		metrics.LatencyMS,
		metrics.InputTokens,
		metrics.OutputTokens,
		metrics.TotalTokens,
		metrics.ErrorMessage,
	)

	return err
}
