# AGENTS.md

## Context
ReviewDesk is an internal tool for reviewing HTML email sequences.

## Repo layout
- `apps/web/src/main.tsx` boots Mantine + TanStack Query.
- `apps/web/src/App.tsx` is the real route switcher; it uses `react-router-dom`.
- `apps/api/cmd/server` is the HTTP API entrypoint.
- `apps/api/cmd/seed` seeds from `db/seeds/emails`.
- `apps/api/cmd/syncmeta` regenerates `db/seeds/emails/meta.json`.

## Commands
- `make setup-dev` runs DB up, migrations, then seed.
- `make dev` starts DB, API, and web in parallel.
- `make db-migrate` / `make db-seed` / `make db-sync-meta` are the repo task commands for data setup.
- `cd apps/web && npm run dev|lint|build`.
- `cd apps/api && go test ./...`.
- `cd apps/api && go run ./cmd/server`.

## Environment / tooling
- `apps/api/cmd/server/main.go` and `apps/api/cmd/seed/main.go` both load `../../.env`.
- `DATABASE_URL` is required for API, seed, and migration commands.
- `goose` must be available on PATH; the Makefile and Docker entrypoint call it directly.
- Docker starts migrations, conditionally runs seed when `RUN_DB_SEED=true`, then starts the server via `apps/api/entrypoint.sh`.
- The seed tree is `db/seeds/emails/{stage}/{email}/{language[-old]}.html`; `meta.json` lives beside it.

## Product rules
- Backend is the source of truth; write to DB first, then expose via API.
- Keep original email HTML unchanged.
- Comments attach to `data-review-block` + text range.
- Preview untrusted HTML in isolation and do not execute scripts.
- AI analysis streaming is SSE/EventSource on `/api/emails/{id}/ai-analysis-stream`, not WebSocket.
- Auth is OTP + session cookies; `/api/auth/events` is admin-only.
- Local dev may enable `AUTH_DEV_LOGIN_ENABLED=true`, but production must keep dev login disabled.

## Code conventions
- Keep handlers thin; put logic in helpers/services.
- Use direct SQL; no heavy ORM.
- Prefer small, simple changes and existing structure.
- Do not add new libraries unless necessary.

## Frontend conventions
- Web UI uses Mantine. When changing Mantine components, styling APIs, forms, tabs, modals, selects, or layout behavior, use the `mantine` MCP server when available.
- If the Mantine MCP server is unavailable, use the LLM documentation index as the fallback reference: https://mantine.dev/llms.txt.
- Prefer documented Mantine APIs, existing Mantine components, and CSS modules over private CSS variables, internal class names, or new UI libraries.
