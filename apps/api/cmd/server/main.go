package main

import (
	"context"
	"fmt"
	"net/http"
	"os"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
	"github.com/mickrubashkin/email-review-tool/apps/api/internal/features/boards"
)

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
	r.Use(sameOriginMutationMiddleware)
	r.Use(requestIDMiddleware)
	r.Use(authMiddleware(dbpool))
	r.Use(operationalEventMiddleware(dbpool))
	aiService, err := newAIAnalysisService()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Unable to create AI analysis service: %v\n", err)
		os.Exit(1)
	}

	registerHealthRoute(r, dbpool)
	registerAuthRoutes(r, dbpool, newLoginCodeEmailSender())
	registerOperationalRoutes(r, dbpool)
	
	boards.Logger = serverEventLogger{}
	boards.RegisterBoardRoutes(r, dbpool)
	
	registerEmailRoutes(r, dbpool)
	registerCommentRoutes(r, dbpool)
	registerAIRoutes(r, dbpool, aiService)

	port := os.Getenv("PORT")
	if port == "" {
		port = os.Getenv("API_PORT")
	}
	if port == "" {
		port = "8080"
	}

	addr := ":" + port

	fmt.Printf("API server listening on %s\n", addr)
	logOperationalEvent(ctx, dbpool, operationalEvent{
		Level:     "info",
		EventType: "server_starting",
		Message:   "API server starting",
		Metadata: map[string]any{
			"port": port,
		},
	})
	err = http.ListenAndServe(addr, r)
	if err != nil {
		fmt.Fprintf(os.Stderr, "API server failed: %v\n", err)
		os.Exit(1)
	}
}

type serverEventLogger struct{}

func (s serverEventLogger) LogEvent(ctx context.Context, db boards.EmailEventExecutor, actor boards.AuthUser, action string, board boards.BoardItem, metadata map[string]any, changes map[string]any) error {
	if metadata == nil {
		metadata = map[string]any{}
	}
	if _, ok := metadata["board_key"]; !ok {
		metadata["board_key"] = board.Key
	}
	if _, ok := metadata["board_name"]; !ok {
		metadata["board_name"] = board.Name
	}
	return insertEmailEvent(ctx, db, emailEvent{
		ActorUserID: actor.ID,
		ActorEmail:  actor.Email,
		Action:      action,
		Metadata:    metadata,
		Changes:     changes,
	})
}

