package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func registerAIRoutes(r chi.Router, dbpool *pgxpool.Pool, aiService AIAnalysisService) {
	r.Get("/api/ai-analysis-logs", listAIAnalysisLogsHandler(dbpool))
	r.Post("/api/emails/{id}/ai-analysis", analyzeEmailHandler(dbpool, aiService))
	r.Get("/api/emails/{id}/ai-analysis-stream", analyzeEmailStreamHandler(dbpool, aiService))
	r.Get("/api/emails/{id}/ai-analysis-debug", debugAIAnalysisHandler(dbpool, aiService))
}

func listAIAnalysisLogsHandler(dbpool *pgxpool.Pool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		filters := AIAnalysisLogFilters{
			Status:      strings.TrimSpace(r.URL.Query().Get("status")),
			CacheStatus: strings.TrimSpace(r.URL.Query().Get("cache_status")),
			EmailID:     strings.TrimSpace(r.URL.Query().Get("email_id")),
			Model:       strings.TrimSpace(r.URL.Query().Get("model")),
			Limit:       parseAIAnalysisLogsLimit(r.URL.Query().Get("limit")),
		}

		logs, err := listAIAnalysisLogs(r.Context(), dbpool, filters)
		if err != nil {
			fmt.Fprintf(os.Stderr, "failed to list ai analysis logs: %v\n", err)
			http.Error(w, "failed to load ai analysis logs", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(logs)
	}
}

func parseAIAnalysisLogsLimit(value string) int {
	limit, err := strconv.Atoi(strings.TrimSpace(value))
	if err != nil {
		return 100
	}
	if limit <= 0 {
		return 100
	}
	if limit > 500 {
		return 500
	}

	return limit
}

func debugAIAnalysisHandler(dbpool *pgxpool.Pool, aiService AIAnalysisService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if os.Getenv("AI_DEBUG_ENABLED") != "true" {
			http.NotFound(w, r)
			return
		}

		id := chi.URLParam(r, "id")
		email, err := getEmailForAI(r.Context(), dbpool, id)
		if err != nil {
			fmt.Fprintf(os.Stderr, "failed to get email %s for ai debug: %v\n", id, err)
			http.Error(w, "email not found", http.StatusNotFound)
			return
		}

		debugPayload, err := buildAIAnalysisDebugPayload(aiService, email)
		if err != nil {
			fmt.Fprintf(os.Stderr, "failed to build ai debug payload for email %s: %v\n", id, err)
			http.Error(w, "failed to build ai debug payload", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(debugPayload)
	}
}

func buildAIAnalysisDebugPayload(aiService AIAnalysisService, email EmailDetail) (map[string]any, error) {
	requestBody := aiService.buildOpenAIAnalysisRequestBody(email)

	var input any
	inputText, ok := requestBody["input"].(string)
	if ok {
		if err := json.Unmarshal([]byte(inputText), &input); err != nil {
			return nil, err
		}
	} else {
		input = requestBody["input"]
	}

	text, _ := requestBody["text"].(map[string]any)
	format, _ := text["format"].(map[string]any)

	return map[string]any{
		"model":             requestBody["model"],
		"response_language": aiService.ResponseLanguage,
		"prompt_hash":       aiService.PromptHash(),
		"instructions":      requestBody["instructions"],
		"input":             input,
		"max_output_tokens": requestBody["max_output_tokens"],
		"json_schema":       format["schema"],
	}, nil
}

func analyzeEmailHandler(dbpool *pgxpool.Pool, aiService AIAnalysisService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if aiService.APIKey == "" {
			http.Error(w, "OPENAI_API_KEY is not configured", http.StatusServiceUnavailable)
			return
		}

		id := chi.URLParam(r, "id")
		email, err := getEmailForAI(r.Context(), dbpool, id)
		if err != nil {
			fmt.Fprintf(os.Stderr, "failed to get email %s for ai analysis: %v\n", id, err)
			http.Error(w, "email not found", http.StatusNotFound)
			return
		}

		if cachedAnalysis, ok := cachedAnalysisOrLogError(r, dbpool, email, aiService); ok {
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(cachedAnalysis)
			return
		}

		result, err := aiService.AnalyzeEmail(r.Context(), email)
		logAIAnalysisResult(r, dbpool, email.ID, result.Metrics, err)
		if err != nil {
			fmt.Fprintf(os.Stderr, "failed to analyze email %s: %v\n", id, err)
			http.Error(w, "failed to analyze email", http.StatusBadGateway)
			return
		}

		cacheAIAnalysisResult(r, dbpool, email.ID, aiService, result.Analysis)

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(result.Analysis)
	}
}

func analyzeEmailStreamHandler(dbpool *pgxpool.Pool, aiService AIAnalysisService) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if aiService.APIKey == "" {
			http.Error(w, "OPENAI_API_KEY is not configured", http.StatusServiceUnavailable)
			return
		}

		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "streaming is not supported", http.StatusInternalServerError)
			return
		}

		id := chi.URLParam(r, "id")
		email, err := getEmailForAI(r.Context(), dbpool, id)
		if err != nil {
			fmt.Fprintf(os.Stderr, "failed to get email %s for ai stream: %v\n", id, err)
			http.Error(w, "email not found", http.StatusNotFound)
			return
		}

		w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")
		w.Header().Set("X-Accel-Buffering", "no")

		forceRefresh := r.URL.Query().Get("refresh") == "true"
		if !forceRefresh {
			cachedAnalysis, ok := cachedAnalysisOrLogError(r, dbpool, email, aiService)
			if ok {
				writeAIStreamResult(w, flusher, cachedAnalysis)
				return
			}
		}

		result, err := aiService.AnalyzeEmailStream(r.Context(), email, func(delta string) error {
			payload, marshalErr := json.Marshal(delta)
			if marshalErr != nil {
				return marshalErr
			}

			if _, writeErr := fmt.Fprintf(w, "event: delta\ndata: %s\n\n", payload); writeErr != nil {
				return writeErr
			}
			flusher.Flush()
			return nil
		})

		logAIAnalysisResult(r, dbpool, email.ID, result.Metrics, err)
		if err != nil {
			fmt.Fprintf(os.Stderr, "failed to stream ai analysis for email %s: %v\n", id, err)
			writeAIStreamError(w, flusher, "failed to stream ai analysis")
			return
		}

		cacheAIAnalysisResult(r, dbpool, email.ID, aiService, result.Analysis)
		writeAIStreamResult(w, flusher, result.Analysis)
	}
}

func cachedAnalysisOrLogError(r *http.Request, dbpool *pgxpool.Pool, email EmailDetail, aiService AIAnalysisService) (EmailAnalysis, bool) {
	cachedAnalysis, ok, err := getCachedAIAnalysis(r.Context(), dbpool, email, aiService)
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to read ai analysis cache for email %s: %v\n", email.ID, err)
		return EmailAnalysis{}, false
	}

	return cachedAnalysis, ok
}

func logAIAnalysisResult(r *http.Request, dbpool *pgxpool.Pool, emailID string, metrics AIAnalysisMetrics, analysisErr error) {
	if logErr := insertAIAnalysisLog(r.Context(), dbpool, emailID, metrics); logErr != nil {
		status := "success"
		if analysisErr != nil {
			status = "error"
		}
		fmt.Fprintf(os.Stderr, "failed to log ai analysis %s for email %s: %v\n", status, emailID, logErr)
	}
}

func cacheAIAnalysisResult(r *http.Request, dbpool *pgxpool.Pool, emailID string, aiService AIAnalysisService, analysis EmailAnalysis) {
	if err := upsertAIAnalysisCache(r.Context(), dbpool, emailID, aiService, analysis); err != nil {
		fmt.Fprintf(os.Stderr, "failed to cache ai analysis result for email %s: %v\n", emailID, err)
	}
}

func writeAIStreamResult(w http.ResponseWriter, flusher http.Flusher, analysis EmailAnalysis) {
	resultPayload, err := json.Marshal(analysis)
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to marshal ai stream result: %v\n", err)
		writeAIStreamError(w, flusher, "failed to encode ai analysis result")
		return
	}

	fmt.Fprintf(w, "event: result\ndata: %s\n\n", resultPayload)
	fmt.Fprint(w, "event: done\ndata: {}\n\n")
	flusher.Flush()
}

func writeAIStreamError(w http.ResponseWriter, flusher http.Flusher, message string) {
	payload, _ := json.Marshal(message)
	fmt.Fprintf(w, "event: error\ndata: %s\n\n", payload)
	flusher.Flush()
}
