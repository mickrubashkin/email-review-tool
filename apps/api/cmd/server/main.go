package main

import (
	"context"
	"fmt"
	"net/http"
	"os"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"
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
	r.Use(authMiddleware(dbpool))
	aiService, err := newAIAnalysisService()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Unable to create AI analysis service: %v\n", err)
		os.Exit(1)
	}

	registerHealthRoute(r, dbpool)
	registerAuthRoutes(r, dbpool, newLoginCodeEmailSender())
	registerBoardRoutes(r, dbpool)
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
	err = http.ListenAndServe(addr, r)
	if err != nil {
		fmt.Fprintf(os.Stderr, "API server failed: %v\n", err)
		os.Exit(1)
	}
}
