# ReviewDesk

Internal tool for reviewing HTML email sequences.

## What it does
- OTP login with session cookies
- email board for browsing sequences and versions
- email review view with text selection, comments, and resolution
- AI analysis for an email, including streaming updates
- admin auth events and AI analysis logs
- download/copy original HTML

No email editing.

## Stack
- Frontend: React 19 + Vite + Mantine v9 + TanStack Query
- Backend: Go + Chi
- DB: PostgreSQL
- Streaming: SSE/EventSource for AI analysis
- Auth: OTP + session cookies

## Screens
- `/` email board
- `/emails/{id}/review` email review view
- `/auth-events` admin auth events
- `/ai-logs` AI analysis logs

## Repo layout
- `apps/web/src/main.tsx` boots Mantine + TanStack Query.
- `apps/web/src/App.tsx` is the route switcher; it uses `window.location.pathname`.
- `apps/api/cmd/server` is the HTTP API entrypoint.
- `apps/api/cmd/seed` seeds from `db/seeds/emails`.
- `apps/api/cmd/syncmeta` regenerates `db/seeds/emails/meta.json`.

## Email data
- Emails are stored as HTML files under `db/seeds/emails/{stage}/{email}/{language[-old]}.html`.
- `meta.json` lives beside the seed tree.
- `data-review-block` marks review anchors.
- Original HTML is preserved for preview/export.

## Commands
- `make setup-dev` runs DB up, migrations, then seed.
- `make dev` starts DB, API, and web in parallel.
- `make db-migrate` / `make db-seed` / `make db-sync-meta` for data setup.
- `cd apps/web && npm run dev|lint|build`.
- `cd apps/api && go test ./...`.
- `cd apps/api && go run ./cmd/server`.

## Environment
- `apps/api/cmd/server/main.go` and `apps/api/cmd/seed/main.go` both load `../../.env`.
- `DATABASE_URL` is required for API, seed, and migration commands.
- `goose` must be available on `PATH`.
- Docker runs migrations, then seed, then the server via `apps/api/entrypoint.sh`.

## Notes
- Backend is the source of truth.
- Keep original HTML unchanged.
- Preview untrusted HTML in isolation and do not execute scripts.
- There is no WebSocket-based realtime layer in the current code.
