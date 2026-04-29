.PHONY: db-up db-down db-logs api-dev web-dev dev

db-up:
	docker compose up -d db

db-down:
	docker compose down

db-logs:
	docker compose logs -f db

api-dev:
	cd apps/api && go run ./cmd/server

web-dev:
	cd apps/web && npm run dev

dev: db-up
	@echo "Starting API and web dev servers..."
	@trap 'kill $$api_pid $$web_pid 2>/dev/null || true' INT TERM EXIT; \
	(cd apps/api && go run ./cmd/server) & api_pid=$$!; \
	(cd apps/web && npm run dev) & web_pid=$$!; \
	wait
