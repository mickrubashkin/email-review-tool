# ReviewDesk

Internal tool for reviewing HTML email sequences.

## What it does
- OTP login with session cookies
- multiple review boards with URL-based board switching
- email board for browsing stages, language versions, and adaptations
- admin board setup: create boards, add/rename/reorder stages, and delete empty stages
- email review view with text selection, comments, resolution, and 5-second comment polling
- admin editing of template-backed email fields and metadata
- admin creation of uploaded/pasted HTML emails
- backend HTML inspection before creating an email: generated review HTML, review block count, editable fields, and warnings
- email duplication, versioning, delivery adaptations, archive, rendered preview, and rendered HTML export
- shared AI analysis for an email, including streaming first-run updates and cached reuse
- admin auth events, email events, user management, and AI analysis logs
- download/copy original HTML

## Stack
- Frontend: React 19 + Vite + Mantine v9 + TanStack Query + React Router
- Backend: Go + Chi
- DB: PostgreSQL
- Streaming: SSE/EventSource for AI analysis
- Auth: OTP + session cookies

## Screens
- `/` redirects to the preferred board, usually `/boards/onboarding`
- `/boards/{boardKey}` email board
- `/emails/new` admin email creation from uploaded/pasted HTML
- `/emails/{id}/review` email review view
- `/emails/{id}/edit` admin email fields editor
- `/auth-events` admin auth events
- `/ai-logs` AI analysis logs
- `/admin/email-events` super-admin email events
- `/admin/users` super-admin user management

## Repo layout
- `apps/web/src/main.tsx` boots Mantine + TanStack Query.
- `apps/web/src/App.tsx` defines client-side routes with React Router.
- `apps/api/cmd/server` is the HTTP API entrypoint.
- `apps/api/cmd/seed` seeds from `db/seeds/emails`.
- `apps/api/cmd/syncmeta` regenerates `db/seeds/emails/meta.json`.

## Email data
- Emails are stored as HTML files under `db/seeds/emails/{stage}/{email}/{language[-old]}.html`.
- Boards are stored in the `boards` table; `emails.sequence` currently stores the board key.
- Board stages are stored as ordered stage keys in `boards.stages`; `emails.stage` stores the current stage key for each email.
- Renaming a stage updates matching `emails.stage` rows for that board. Deleting a stage is allowed only when it has no active emails.
- In the app, a concrete reviewed email is selected by language, version, and adaptation; legacy seed data may still use `new/old`, while newly created emails default to `v1`.
- Existing data uses the `Default` adaptation, and admins can create independent adaptations from a current email.
- `meta.json` lives beside the seed tree.
- `data-review-block` marks review anchors.
- `data-edit-*` markers define template-backed editable fields.
- Original HTML is preserved for preview/export.

## Commands
- `make setup-dev` runs DB up, migrations, then seed.
- `make dev` starts DB, API, and web in parallel.
- `make db-migrate` / `make db-seed` / `make db-sync-meta` for data setup.
- `cd apps/web && npm run dev|lint|build`.
- `cd apps/api && go test ./...`.
- `cd apps/api && go run ./cmd/server`.

## API
- `GET /api/boards` lists boards and their ordered stages.
- `POST /api/boards` creates a board by copying stages from a source board.
- `POST /api/boards/{boardKey}/stages` adds a stage.
- `PATCH /api/boards/{boardKey}/stages/{stage}` renames a stage and updates emails in that board.
- `PATCH /api/boards/{boardKey}/stages` reorders stages; the payload must contain the same stages exactly once.
- `DELETE /api/boards/{boardKey}/stages/{stage}` deletes an empty stage.

## Environment
- `apps/api/cmd/server/main.go` and `apps/api/cmd/seed/main.go` both load `../../.env`.
- `DATABASE_URL` is required for API, seed, and migration commands.
- `goose` must be available on `PATH`.
- Docker runs migrations, then seed, then the server via `apps/api/entrypoint.sh`.

## Notes
- Backend is the source of truth.
- Keep original HTML unchanged.
- Email editing is template-backed: admins edit metadata and `data-edit-*` fields, then the backend renders final HTML for preview/export.
- When text-backed editable content changes, text-range comment anchors on changed blocks are normalized to whole-block anchors.
- Preview untrusted HTML in isolation and do not execute scripts.
- AI analysis is shared per email: cached results are reused across users, while explicit shared re-generation is limited to 10 per day per email and user.
- Comments use frontend polling for near-real-time updates; there is no WebSocket-based realtime layer in the current code.
