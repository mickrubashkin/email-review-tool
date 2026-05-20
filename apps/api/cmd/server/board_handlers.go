package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

type createBoardRequest struct {
	Name           string  `json:"name"`
	Key            *string `json:"key"`
	SourceBoardKey *string `json:"source_board_key"`
}

type createBoardStageRequest struct {
	Name string  `json:"name"`
	Key  *string `json:"key"`
}

type updateBoardStageRequest struct {
	Name string `json:"name"`
}

type reorderBoardStagesRequest struct {
	Stages []string `json:"stages"`
}

var (
	errBoardNotFound     = errors.New("board not found")
	errStageExists       = errors.New("stage already exists")
	errStageNotFound     = errors.New("stage not found")
	errStageNotEmpty     = errors.New("stage is not empty")
	errInvalidStageOrder = errors.New("invalid stage order")
)

func registerBoardRoutes(r chi.Router, dbpool *pgxpool.Pool) {
	r.Get("/api/boards", listBoardsHandler(dbpool))
	r.Post("/api/boards", createBoardHandler(dbpool))
	r.Post("/api/boards/{boardKey}/stages", createBoardStageHandler(dbpool))
	r.Patch("/api/boards/{boardKey}/stages", reorderBoardStagesHandler(dbpool))
	r.Patch("/api/boards/{boardKey}/stages/{stage}", updateBoardStageHandler(dbpool))
	r.Delete("/api/boards/{boardKey}/stages/{stage}", deleteBoardStageHandler(dbpool))
}

func listBoardsHandler(dbpool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		boards, err := listBoards(r.Context(), dbpool)
		if err != nil {
			fmt.Fprintf(os.Stderr, "failed to list boards: %v\n", err)
			http.Error(w, "failed to load boards", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(boards)
	}
}

func createBoardStageHandler(dbpool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !requireAdmin(w, r) {
			return
		}

		var request createBoardStageRequest
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}

		name := strings.TrimSpace(request.Name)
		keySource := name
		if request.Key != nil {
			keySource = *request.Key
		}
		stage := normalizeStageKey(keySource)
		if name == "" || stage == "" {
			http.Error(w, "name is required", http.StatusBadRequest)
			return
		}

		board, err := addBoardStage(r.Context(), dbpool, chi.URLParam(r, "boardKey"), stage)
		writeBoardStageResponse(w, err, board)
	}
}

func updateBoardStageHandler(dbpool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !requireAdmin(w, r) {
			return
		}

		var request updateBoardStageRequest
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}

		newStage := normalizeStageKey(request.Name)
		if newStage == "" {
			http.Error(w, "name is required", http.StatusBadRequest)
			return
		}

		board, err := renameBoardStage(r.Context(), dbpool, chi.URLParam(r, "boardKey"), chi.URLParam(r, "stage"), newStage)
		writeBoardStageResponse(w, err, board)
	}
}

func deleteBoardStageHandler(dbpool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !requireAdmin(w, r) {
			return
		}

		board, err := deleteBoardStage(r.Context(), dbpool, chi.URLParam(r, "boardKey"), chi.URLParam(r, "stage"))
		writeBoardStageResponse(w, err, board)
	}
}

func reorderBoardStagesHandler(dbpool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !requireAdmin(w, r) {
			return
		}

		var request reorderBoardStagesRequest
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}

		stages := make([]string, 0, len(request.Stages))
		for _, stage := range request.Stages {
			normalizedStage := normalizeStageKey(stage)
			if normalizedStage == "" {
				http.Error(w, "stages must not contain empty values", http.StatusBadRequest)
				return
			}
			stages = append(stages, normalizedStage)
		}

		board, err := reorderBoardStages(r.Context(), dbpool, chi.URLParam(r, "boardKey"), stages)
		writeBoardStageResponse(w, err, board)
	}
}

func requireAdmin(w http.ResponseWriter, r *http.Request) bool {
	user, ok := authUserFromContext(r)
	if !ok {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return false
	}
	if !isAdminUser(user) {
		http.Error(w, "forbidden", http.StatusForbidden)
		return false
	}

	return true
}

func writeBoardStageResponse(w http.ResponseWriter, err error, board BoardItem) {
	if err != nil {
		switch {
		case errors.Is(err, errBoardNotFound):
			http.Error(w, "board not found", http.StatusNotFound)
		case errors.Is(err, errStageExists):
			http.Error(w, "stage already exists", http.StatusConflict)
		case errors.Is(err, errStageNotFound):
			http.Error(w, "stage not found", http.StatusNotFound)
		case errors.Is(err, errStageNotEmpty):
			http.Error(w, "stage is not empty", http.StatusConflict)
		case errors.Is(err, errInvalidStageOrder):
			http.Error(w, "stage order must contain the same stages exactly once", http.StatusBadRequest)
		default:
			fmt.Fprintf(os.Stderr, "failed to update board stages: %v\n", err)
			http.Error(w, "failed to update board stages", http.StatusInternalServerError)
		}
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(board)
}

func createBoardHandler(dbpool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user, ok := authUserFromContext(r)
		if !ok {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		if !isAdminUser(user) {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}

		var request createBoardRequest
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}

		name := strings.TrimSpace(request.Name)
		if name == "" {
			http.Error(w, "name is required", http.StatusBadRequest)
			return
		}

		keySource := name
		if request.Key != nil {
			keySource = *request.Key
		}
		key := normalizeBoardKey(keySource)
		if key == "" {
			http.Error(w, "key is required", http.StatusBadRequest)
			return
		}

		sourceBoardKey := strings.TrimSpace(stringFromPointer(request.SourceBoardKey))
		if sourceBoardKey == "" {
			sourceBoardKey = "onboarding"
		}

		board, err := createBoardFromSource(r.Context(), dbpool, name, key, sourceBoardKey)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				http.Error(w, "source board not found", http.StatusBadRequest)
				return
			}
			if isBoardKeyConflict(err) {
				http.Error(w, "board already exists", http.StatusConflict)
				return
			}
			fmt.Fprintf(os.Stderr, "failed to create board %s: %v\n", key, err)
			http.Error(w, "failed to create board", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(board)
	}
}

func createBoardFromSource(ctx context.Context, dbpool *pgxpool.Pool, name string, key string, sourceBoardKey string) (BoardItem, error) {
	var stages []byte
	err := dbpool.QueryRow(ctx, `
		SELECT stages
		FROM boards
		WHERE key = $1;
	`, sourceBoardKey).Scan(&stages)
	if err != nil {
		return BoardItem{}, err
	}

	var board BoardItem
	var createdStages []byte
	err = dbpool.QueryRow(ctx, `
		INSERT INTO boards (key, name, stages)
		VALUES ($1, $2, $3::jsonb)
		RETURNING id, key, name, stages, created_at, updated_at;
	`, key, name, stages).Scan(
		&board.ID,
		&board.Key,
		&board.Name,
		&createdStages,
		&board.CreatedAt,
		&board.UpdatedAt,
	)
	if err != nil {
		return BoardItem{}, err
	}
	if err := json.Unmarshal(createdStages, &board.Stages); err != nil {
		return BoardItem{}, err
	}

	return board, nil
}

func listBoards(ctx context.Context, dbpool *pgxpool.Pool) ([]BoardItem, error) {
	rows, err := dbpool.Query(ctx, `
		SELECT id, key, name, stages, created_at, updated_at
		FROM boards
		ORDER BY created_at, name;
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	boards := []BoardItem{}
	for rows.Next() {
		var board BoardItem
		var stages []byte
		if err := rows.Scan(
			&board.ID,
			&board.Key,
			&board.Name,
			&stages,
			&board.CreatedAt,
			&board.UpdatedAt,
		); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(stages, &board.Stages); err != nil {
			return nil, err
		}
		boards = append(boards, board)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return boards, nil
}

func addBoardStage(ctx context.Context, dbpool *pgxpool.Pool, boardKey string, stage string) (BoardItem, error) {
	tx, err := dbpool.Begin(ctx)
	if err != nil {
		return BoardItem{}, err
	}
	defer tx.Rollback(ctx)

	board, err := getBoardForUpdate(ctx, tx, boardKey)
	if err != nil {
		return BoardItem{}, err
	}
	if containsStage(board.Stages, stage) {
		return BoardItem{}, errStageExists
	}

	board.Stages = append(board.Stages, stage)
	updated, err := updateBoardStages(ctx, tx, board.Key, board.Stages)
	if err != nil {
		return BoardItem{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return BoardItem{}, err
	}

	return updated, nil
}

func renameBoardStage(ctx context.Context, dbpool *pgxpool.Pool, boardKey string, oldStage string, newStage string) (BoardItem, error) {
	oldStage = normalizeStageKey(oldStage)
	if oldStage == "" {
		return BoardItem{}, errStageNotFound
	}

	tx, err := dbpool.Begin(ctx)
	if err != nil {
		return BoardItem{}, err
	}
	defer tx.Rollback(ctx)

	board, err := getBoardForUpdate(ctx, tx, boardKey)
	if err != nil {
		return BoardItem{}, err
	}

	stageIndex := indexOfStage(board.Stages, oldStage)
	if stageIndex == -1 {
		return BoardItem{}, errStageNotFound
	}
	if oldStage != newStage && containsStage(board.Stages, newStage) {
		return BoardItem{}, errStageExists
	}

	board.Stages[stageIndex] = newStage
	updated, err := updateBoardStages(ctx, tx, board.Key, board.Stages)
	if err != nil {
		return BoardItem{}, err
	}
	if oldStage != newStage {
		if _, err := tx.Exec(ctx, `
			UPDATE emails
			SET stage = $1, updated_at = now()
			WHERE sequence = $2 AND stage = $3;
		`, newStage, board.Key, oldStage); err != nil {
			return BoardItem{}, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return BoardItem{}, err
	}

	return updated, nil
}

func deleteBoardStage(ctx context.Context, dbpool *pgxpool.Pool, boardKey string, stage string) (BoardItem, error) {
	stage = normalizeStageKey(stage)
	if stage == "" {
		return BoardItem{}, errStageNotFound
	}

	tx, err := dbpool.Begin(ctx)
	if err != nil {
		return BoardItem{}, err
	}
	defer tx.Rollback(ctx)

	board, err := getBoardForUpdate(ctx, tx, boardKey)
	if err != nil {
		return BoardItem{}, err
	}

	stageIndex := indexOfStage(board.Stages, stage)
	if stageIndex == -1 {
		return BoardItem{}, errStageNotFound
	}

	var emailCount int
	if err := tx.QueryRow(ctx, `
		SELECT count(*)
		FROM emails
		WHERE sequence = $1 AND stage = $2 AND archived_at IS NULL;
	`, board.Key, stage).Scan(&emailCount); err != nil {
		return BoardItem{}, err
	}
	if emailCount > 0 {
		return BoardItem{}, errStageNotEmpty
	}

	board.Stages = append(board.Stages[:stageIndex], board.Stages[stageIndex+1:]...)
	updated, err := updateBoardStages(ctx, tx, board.Key, board.Stages)
	if err != nil {
		return BoardItem{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return BoardItem{}, err
	}

	return updated, nil
}

func reorderBoardStages(ctx context.Context, dbpool *pgxpool.Pool, boardKey string, stages []string) (BoardItem, error) {
	tx, err := dbpool.Begin(ctx)
	if err != nil {
		return BoardItem{}, err
	}
	defer tx.Rollback(ctx)

	board, err := getBoardForUpdate(ctx, tx, boardKey)
	if err != nil {
		return BoardItem{}, err
	}
	if !sameStageSet(board.Stages, stages) {
		return BoardItem{}, errInvalidStageOrder
	}

	updated, err := updateBoardStages(ctx, tx, board.Key, stages)
	if err != nil {
		return BoardItem{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return BoardItem{}, err
	}

	return updated, nil
}

func getBoardForUpdate(ctx context.Context, tx pgx.Tx, boardKey string) (BoardItem, error) {
	var board BoardItem
	var stages []byte
	err := tx.QueryRow(ctx, `
		SELECT id, key, name, stages, created_at, updated_at
		FROM boards
		WHERE key = $1
		FOR UPDATE;
	`, boardKey).Scan(
		&board.ID,
		&board.Key,
		&board.Name,
		&stages,
		&board.CreatedAt,
		&board.UpdatedAt,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return BoardItem{}, errBoardNotFound
	}
	if err != nil {
		return BoardItem{}, err
	}
	if err := json.Unmarshal(stages, &board.Stages); err != nil {
		return BoardItem{}, err
	}

	return board, nil
}

func updateBoardStages(ctx context.Context, tx pgx.Tx, boardKey string, stages []string) (BoardItem, error) {
	stagesJSON, err := json.Marshal(stages)
	if err != nil {
		return BoardItem{}, err
	}

	var board BoardItem
	var updatedStages []byte
	err = tx.QueryRow(ctx, `
		UPDATE boards
		SET stages = $2::jsonb, updated_at = now()
		WHERE key = $1
		RETURNING id, key, name, stages, created_at, updated_at;
	`, boardKey, stagesJSON).Scan(
		&board.ID,
		&board.Key,
		&board.Name,
		&updatedStages,
		&board.CreatedAt,
		&board.UpdatedAt,
	)
	if err != nil {
		return BoardItem{}, err
	}
	if err := json.Unmarshal(updatedStages, &board.Stages); err != nil {
		return BoardItem{}, err
	}

	return board, nil
}

func boardExists(ctx context.Context, db emailEventExecutor, key string) (bool, error) {
	var exists bool
	err := db.QueryRow(ctx, `
		SELECT EXISTS(SELECT 1 FROM boards WHERE key = $1);
	`, key).Scan(&exists)
	return exists, err
}

func normalizeBoardKey(value string) string {
	return normalizeAdaptationKey(value)
}

func normalizeStageKey(value string) string {
	return normalizeAdaptationKey(value)
}

func containsStage(stages []string, stage string) bool {
	return indexOfStage(stages, stage) != -1
}

func indexOfStage(stages []string, stage string) int {
	for index, candidate := range stages {
		if candidate == stage {
			return index
		}
	}

	return -1
}

func sameStageSet(first []string, second []string) bool {
	if len(first) != len(second) {
		return false
	}

	counts := make(map[string]int, len(first))
	for _, stage := range first {
		counts[stage]++
	}
	for _, stage := range second {
		if counts[stage] == 0 {
			return false
		}
		counts[stage]--
	}

	return true
}

func isBoardKeyConflict(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) &&
		pgErr.Code == "23505" &&
		pgErr.ConstraintName == "boards_key_key"
}
