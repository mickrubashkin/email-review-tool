package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
)

type EmailListItem struct {
	ID        string `json:"id"`
	Sequence  string `json:"sequence"`
	Title     string `json:"title"`
	Subject   string `json:"subject"`
	Preheader string `json:"preheader"`
	Stage     string `json:"stage"`
	SortOrder int    `json:"sort_order"`
	Language  string `json:"language"`
}

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
			SELECT id, sequence, title, subject, preheader, stage, sort_order, language
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
				&email.Stage,
				&email.SortOrder,
				&email.Language,
			)
			if err != nil {
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

	http.ListenAndServe(":8080", r)
}
