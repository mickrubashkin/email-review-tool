.PHONY: db-up db-down db-logs db-migrate db-migrate-status db-migrate-down db-seed api-dev web-dev dev setup-dev

db-up:
	docker compose up -d db

db-down:
	docker compose down

db-logs:
	docker compose logs -f db

db-migrate:
	set -a; . ./.env; set +a; goose -dir db/migrations postgres "$$DATABASE_URL" up

db-migrate-status:
	set -a; . ./.env; set +a; goose -dir db/migrations postgres "$$DATABASE_URL" status

db-migrate-down:
	set -a; . ./.env; set +a; goose -dir db/migrations postgres "$$DATABASE_URL" down

db-seed:
	cd apps/api && go run ./cmd/seed

api-dev:
	cd apps/api && go run ./cmd/server

web-dev:
	cd apps/web && npm run dev

setup-dev: db-up db-migrate db-seed

dev: db-up
	@echo "Starting API and web dev servers..."
	@trap 'kill $$api_pid $$web_pid 2>/dev/null || true' INT TERM EXIT; \
	(cd apps/api && go run ./cmd/server) & api_pid=$$!; \
	(cd apps/web && npm run dev) & web_pid=$$!; \
	wait

