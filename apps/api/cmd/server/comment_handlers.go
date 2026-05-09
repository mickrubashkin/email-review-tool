package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type createEmailCommentRequest struct {
	ReviewBlock  string `json:"review_block"`
	SelectedText string `json:"selected_text"`
	StartOffset  int    `json:"start_offset"`
	EndOffset    int    `json:"end_offset"`
	Body         string `json:"body"`
}

func registerCommentRoutes(r chi.Router, dbpool *pgxpool.Pool) {
	r.Get("/api/emails/{id}/comments", listEmailCommentsHandler(dbpool))
	r.Post("/api/emails/{id}/comments", createEmailCommentHandler(dbpool))
	r.Patch("/api/comments/{id}/resolve", resolveCommentHandler(dbpool))
}

func listEmailCommentsHandler(dbpool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		emailID := chi.URLParam(r, "id")
		rows, err := dbpool.Query(r.Context(), `
			SELECT
				comments.id,
				comments.email_id,
				comments.user_id,
				authors.email AS author_email,
				comments.review_block,
				comments.selected_text,
				comments.start_offset,
				comments.end_offset,
				comments.body,
				comments.status,
				comments.created_at,
				comments.resolved_at,
				comments.resolved_by,
				resolvers.email AS resolved_by_email
			FROM comments
			LEFT JOIN users AS authors ON authors.id = comments.user_id
			LEFT JOIN users AS resolvers ON resolvers.id = comments.resolved_by
			WHERE comments.email_id = $1
			ORDER BY comments.created_at;
		`, emailID)
		if err != nil {
			http.Error(w, "failed to load comments", http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		comments := []EmailComment{}

		for rows.Next() {
			var comment EmailComment

			err := rows.Scan(
				&comment.ID,
				&comment.EmailID,
				&comment.UserID,
				&comment.AuthorEmail,
				&comment.ReviewBlock,
				&comment.SelectedText,
				&comment.StartOffset,
				&comment.EndOffset,
				&comment.Body,
				&comment.Status,
				&comment.CreatedAt,
				&comment.ResolvedAt,
				&comment.ResolvedBy,
				&comment.ResolvedByEmail,
			)
			if err != nil {
				fmt.Fprintf(os.Stderr, "failed to scan comment row for email %s: %v\n", emailID, err)
				http.Error(w, "failed to read email comments", http.StatusInternalServerError)
				return
			}

			comments = append(comments, comment)
		}

		if err := rows.Err(); err != nil {
			http.Error(w, "failed to read email comments", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(comments)
	}
}

func createEmailCommentHandler(dbpool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		emailID := chi.URLParam(r, "id")
		user, ok := authUserFromContext(r)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		var payload createEmailCommentRequest
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			http.Error(w, "invalid comment payload", http.StatusBadRequest)
			return
		}

		payload.ReviewBlock = strings.TrimSpace(payload.ReviewBlock)
		payload.SelectedText = strings.TrimSpace(payload.SelectedText)
		payload.Body = strings.TrimSpace(payload.Body)

		if payload.ReviewBlock == "" ||
			payload.SelectedText == "" ||
			payload.Body == "" ||
			payload.StartOffset < 0 ||
			payload.EndOffset <= payload.StartOffset {
			http.Error(w, "invalid comment payload", http.StatusBadRequest)
			return
		}

		var comment EmailComment
		err := dbpool.QueryRow(r.Context(), `
			INSERT INTO comments (
				email_id,
				user_id,
				review_block,
				selected_text,
				start_offset,
				end_offset,
				body
			)
				VALUES ($1, $2, $3, $4, $5, $6, $7)
				RETURNING
					id,
					email_id,
					user_id,
					review_block,
					selected_text,
					start_offset,
					end_offset,
					body,
					status,
					created_at,
					resolved_at;
		`, emailID,
			user.ID,
			payload.ReviewBlock,
			payload.SelectedText,
			payload.StartOffset,
			payload.EndOffset,
			payload.Body).Scan(
			&comment.ID,
			&comment.EmailID,
			&comment.UserID,
			&comment.ReviewBlock,
			&comment.SelectedText,
			&comment.StartOffset,
			&comment.EndOffset,
			&comment.Body,
			&comment.Status,
			&comment.CreatedAt,
			&comment.ResolvedAt,
		)
		if err != nil {
			http.Error(w, "failed to create comment", http.StatusInternalServerError)
			return
		}

		comment.AuthorEmail = &user.Email
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(comment)
	}
}

func resolveCommentHandler(dbpool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		commentID := chi.URLParam(r, "id")

		user, ok := authUserFromContext(r)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}

		var comment EmailComment
		err := dbpool.QueryRow(r.Context(), `
			WITH updated_comment AS (
				UPDATE comments
				SET
					status = 'resolved',
					resolved_at = now(),
					resolved_by = $2
				WHERE id = $1
				RETURNING *
			)
			SELECT
				updated_comment.id,
				updated_comment.email_id,
				updated_comment.user_id,
				authors.email AS author_email,
				updated_comment.review_block,
				updated_comment.selected_text,
				updated_comment.start_offset,
				updated_comment.end_offset,
				updated_comment.body,
				updated_comment.status,
				updated_comment.created_at,
				updated_comment.resolved_at,
				updated_comment.resolved_by,
				resolvers.email AS resolved_by_email
			FROM updated_comment
			LEFT JOIN users AS authors ON authors.id = updated_comment.user_id
			LEFT JOIN users AS resolvers ON resolvers.id = updated_comment.resolved_by;
		`, commentID, user.ID).Scan(
			&comment.ID,
			&comment.EmailID,
			&comment.UserID,
			&comment.AuthorEmail,
			&comment.ReviewBlock,
			&comment.SelectedText,
			&comment.StartOffset,
			&comment.EndOffset,
			&comment.Body,
			&comment.Status,
			&comment.CreatedAt,
			&comment.ResolvedAt,
			&comment.ResolvedBy,
			&comment.ResolvedByEmail,
		)
		if err != nil {
			http.Error(w, "failed to resolve comment", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(comment)
	}
}

func authUserFromContext(r *http.Request) (AuthUser, bool) {
	user, ok := r.Context().Value(authUserContextKey).(AuthUser)
	return user, ok
}
