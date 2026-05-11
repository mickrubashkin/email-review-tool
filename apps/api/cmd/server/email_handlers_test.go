package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
)

func TestListEmailsIncludesOpenCommentCount(t *testing.T) {
	dbpool := testDBPool(t)
	emailID := createTestEmail(t, dbpool)

	_, err := dbpool.Exec(context.Background(), `
		INSERT INTO comments (
			email_id,
			review_block,
			selected_text,
			start_offset,
			end_offset,
			body,
			status
		)
		VALUES
			($1, 'body-001', 'open comment', 0, 12, 'Open comment body', 'open'),
			($1, 'body-002', 'resolved comment', 0, 16, 'Resolved comment body', 'resolved');
	`, emailID)
	if err != nil {
		t.Fatalf("failed to seed comments: %v", err)
	}

	router := chi.NewRouter()
	registerEmailRoutes(router, dbpool)

	request := httptest.NewRequest(http.MethodGet, "/api/emails", nil)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected GET status 200, got %d: %s", response.Code, response.Body.String())
	}

	var emails []EmailListItem
	if err := json.NewDecoder(response.Body).Decode(&emails); err != nil {
		t.Fatalf("failed to decode emails: %v", err)
	}

	for _, email := range emails {
		if email.ID == emailID {
			if email.OpenCommentCount != 1 {
				t.Fatalf("expected open comment count 1, got %d", email.OpenCommentCount)
			}
			return
		}
	}

	t.Fatalf("seed email %s not returned by list emails", emailID)
}
