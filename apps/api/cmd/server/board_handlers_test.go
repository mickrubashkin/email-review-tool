package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestListBoards(t *testing.T) {
	dbpool := testDBPool(t)

	router := chi.NewRouter()
	registerBoardRoutes(router, dbpool)

	request := httptest.NewRequest(http.MethodGet, "/api/boards", nil)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected GET status 200, got %d: %s", response.Code, response.Body.String())
	}

	var boards []BoardItem
	if err := json.NewDecoder(response.Body).Decode(&boards); err != nil {
		t.Fatalf("failed to decode boards: %v", err)
	}
	if len(boards) == 0 {
		t.Fatal("expected at least one board")
	}
}

func TestCreateBoardCopiesStages(t *testing.T) {
	dbpool := testDBPool(t)
	user := createTestUserWithRole(t, dbpool, "admin")
	sourceKey := createTestBoard(t, dbpool, "source-board", []string{"registered", "qualified"})

	router := chi.NewRouter()
	registerBoardRoutes(router, dbpool)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api/boards",
		bytes.NewReader([]byte(`{ "name": "Launch Board", "source_board_key": "`+sourceKey+`" }`)),
	)
	request = withAuthUser(request, user)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusCreated {
		t.Fatalf("expected POST status 201, got %d: %s", response.Code, response.Body.String())
	}

	var created BoardItem
	if err := json.NewDecoder(response.Body).Decode(&created); err != nil {
		t.Fatalf("failed to decode created board: %v", err)
	}
	t.Cleanup(func() {
		_, _ = dbpool.Exec(context.Background(), `DELETE FROM boards WHERE id = $1;`, created.ID)
	})
	if created.Key != "launch-board" || created.Name != "Launch Board" {
		t.Fatalf("unexpected created board: %#v", created)
	}
	if len(created.Stages) != 2 || created.Stages[0] != "registered" || created.Stages[1] != "qualified" {
		t.Fatalf("expected copied stages, got %#v", created.Stages)
	}
}

func TestCreateBoardConflict(t *testing.T) {
	dbpool := testDBPool(t)
	user := createTestUserWithRole(t, dbpool, "admin")
	createTestBoard(t, dbpool, "duplicate-board", []string{"registered"})

	router := chi.NewRouter()
	registerBoardRoutes(router, dbpool)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api/boards",
		bytes.NewReader([]byte(`{ "name": "Duplicate Board", "key": "duplicate-board", "source_board_key": "duplicate-board" }`)),
	)
	request = withAuthUser(request, user)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusConflict {
		t.Fatalf("expected POST status 409, got %d: %s", response.Code, response.Body.String())
	}
}

func TestCreateBoardRejectsReviewer(t *testing.T) {
	dbpool := testDBPool(t)
	user := createTestUserWithRole(t, dbpool, "reviewer")
	sourceKey := createTestBoard(t, dbpool, "reviewer-source-board", []string{"registered"})

	router := chi.NewRouter()
	registerBoardRoutes(router, dbpool)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api/boards",
		bytes.NewReader([]byte(`{ "name": "Reviewer Board", "source_board_key": "`+sourceKey+`" }`)),
	)
	request = withAuthUser(request, user)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)

	if response.Code != http.StatusForbidden {
		t.Fatalf("expected POST status 403, got %d: %s", response.Code, response.Body.String())
	}
}

func createTestBoard(t *testing.T, dbpool *pgxpool.Pool, key string, stages []string) string {
	t.Helper()
	stagesJSON, err := json.Marshal(stages)
	if err != nil {
		t.Fatalf("failed to encode test board stages: %v", err)
	}

	_, err = dbpool.Exec(context.Background(), `
		INSERT INTO boards (key, name, stages)
		VALUES ($1, $2, $3::jsonb)
		ON CONFLICT (key) DO UPDATE SET
			name = EXCLUDED.name,
			stages = EXCLUDED.stages,
			updated_at = now();
	`, key, key, stagesJSON)
	if err != nil {
		t.Fatalf("failed to create test board: %v", err)
	}
	t.Cleanup(func() {
		_, _ = dbpool.Exec(context.Background(), `DELETE FROM boards WHERE key = $1;`, key)
	})

	return key
}
