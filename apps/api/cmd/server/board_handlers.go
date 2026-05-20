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

func registerBoardRoutes(r chi.Router, dbpool *pgxpool.Pool) {
	r.Get("/api/boards", listBoardsHandler(dbpool))
	r.Post("/api/boards", createBoardHandler(dbpool))
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

func isBoardKeyConflict(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) &&
		pgErr.Code == "23505" &&
		pgErr.ConstraintName == "boards_key_key"
}
