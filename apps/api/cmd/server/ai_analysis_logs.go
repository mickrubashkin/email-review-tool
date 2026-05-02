package main

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

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
