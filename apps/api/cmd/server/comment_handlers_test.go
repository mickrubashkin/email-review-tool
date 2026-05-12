package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestCommentHandlersCreateListResolve(t *testing.T) {
	dbpool := testDBPool(t)
	user := createTestUser(t, dbpool)
	emailID := createTestEmail(t, dbpool)

	router := chi.NewRouter()
	registerCommentRoutes(router, dbpool)

	getRequest := httptest.NewRequest(http.MethodGet, "/api/emails/"+emailID+"/comments", nil)
	getResponse := httptest.NewRecorder()
	router.ServeHTTP(getResponse, getRequest)

	if getResponse.Code != http.StatusOK {
		t.Fatalf("expected GET status 200, got %d: %s", getResponse.Code, getResponse.Body.String())
	}

	var initialComments []EmailComment
	if err := json.NewDecoder(getResponse.Body).Decode(&initialComments); err != nil {
		t.Fatalf("expected no comments, got %d", len(initialComments))
	}

	createBody := []byte(`{
		"review_block": "body-001",
		"selected_text": "selected text",
		"start_offset": 0,
		"end_offset": 13,
		"body": "Please clarify this sentence."
	}`)

	createRequest := httptest.NewRequest(
		http.MethodPost,
		"/api/emails/"+emailID+"/comments",
		bytes.NewReader(createBody),
	)
	createRequest = createRequest.WithContext(
		context.WithValue(createRequest.Context(), authUserContextKey, user),
	)
	createResponse := httptest.NewRecorder()
	router.ServeHTTP(createResponse, createRequest)

	if createResponse.Code != http.StatusCreated {
		t.Fatalf("expected POST status 201, got %d: %s", createResponse.Code, createResponse.Body.String())
	}

	var createdComment EmailComment
	if err := json.NewDecoder(createResponse.Body).Decode(&createdComment); err != nil {
		t.Fatalf("failed to decode created comment: %v", err)
	}
	if createdComment.ID == "" {
		t.Fatalf("expected created commemt id")
	}
	if createdComment.AuthorEmail == nil || *createdComment.AuthorEmail != user.Email {
		t.Fatalf("expected author email %s, got %#v", user.Email, createdComment.AuthorEmail)
	}
	if createdComment.Status != "open" {
		t.Fatalf("expected open comment status, got %q", createdComment.Status)
	}

	resolveRequest := httptest.NewRequest(
		http.MethodPatch,
		"/api/comments/"+createdComment.ID+"/resolve",
		nil,
	)
	resolveRequest = resolveRequest.WithContext(
		context.WithValue(resolveRequest.Context(), authUserContextKey, user),
	)
	resolveResponse := httptest.NewRecorder()
	router.ServeHTTP(resolveResponse, resolveRequest)

	if resolveResponse.Code != http.StatusOK {
		t.Fatalf("expected PATCH status 200, got %d: %s", resolveResponse.Code, resolveResponse.Body.String())
	}

	var resolvedComment EmailComment
	if err := json.NewDecoder(resolveResponse.Body).Decode(&resolvedComment); err != nil {
		t.Fatalf("failed to decode resolved comment: %v", err)
	}
	if resolvedComment.Status != "resolved" {
		t.Fatalf("expected resolved status, got %q", resolvedComment.Status)
	}
	if resolvedComment.ResolvedAt == nil {
		t.Fatalf("expected resolved_at")
	}
	if resolvedComment.ResolvedBy == nil || *resolvedComment.ResolvedBy != user.ID {
		t.Fatalf("expected resolved_by %s, got %#v", user.ID, resolvedComment.ResolvedBy)
	}
	if resolvedComment.ResolvedByEmail == nil || *resolvedComment.ResolvedByEmail != user.Email {
		t.Fatalf("expected resolved_by_email %s, got %#v", user.Email, resolvedComment.ResolvedByEmail)
	}
}

func testDBPool(t *testing.T) *pgxpool.Pool {
	t.Helper()

	databaseURL := os.Getenv("TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("TEST_DATABASE_URL is required for comment handler integration tests")
	}

	dbpool, err := pgxpool.New(context.Background(), databaseURL)
	if err != nil {
		t.Fatalf("failed to create test db pool: %v", err)
	}

	t.Cleanup(dbpool.Close)
	return dbpool
}

func createTestUser(t *testing.T, dbpool *pgxpool.Pool) AuthUser {
	t.Helper()

	var user AuthUser
	err := dbpool.QueryRow(context.Background(), `
		INSERT INTO users (email, role)
		VALUES ('comment-test-user@example.com', 'reviewer')
		ON CONFLICT (email) DO UPDATE SET updated_at = now()
		RETURNING id, email, role;
	`).Scan(&user.ID, &user.Email, &user.Role)
	if err != nil {
		t.Fatalf("failed to create test user: %v", err)
	}

	t.Cleanup(func() {
		_, _ = dbpool.Exec(context.Background(), `DELETE FROM users WHERE id = $1;`, user.ID)
	})

	return user
}

func createTestEmail(t *testing.T, dbpool *pgxpool.Pool) string {
	t.Helper()

	var emailID string
	err := dbpool.QueryRow(context.Background(), `
		INSERT INTO emails (
			slug,
			title,
			stage,
			sort_order,
			language,
			variant,
			original_html,
			review_html,
			template_html,
			editable_fields
		)
		VALUES (
			'comment-test-email',
			'Comment Test Email',
			'test',
			9999,
			'en',
			'new',
			'<html><body>selected text</body></html>',
			'<html><body><p data-review-block="body-001">selected text</p></body></html>',
			'<html><body><p data-review-block="body-001">selected text</p></body></html>',
			'{}'::jsonb
		)
		ON CONFLICT (slug) DO UPDATE SET updated_at = now()
		RETURNING id;
	`).Scan(&emailID)
	if err != nil {
		t.Fatalf("failed to create test email: %v", err)
	}

	t.Cleanup(func() {
		_, _ = dbpool.Exec(context.Background(), `DELETE FROM emails WHERE id = $1;`, emailID)
	})

	return emailID
}
