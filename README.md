# ReviewDesk

Internal tool for reviewing HTML email sequences.

## Why this exists
ReviewDesk is a focused review and approval layer for HTML email journeys before they are implemented in CRM, ESP, messaging, or other publishing systems. It keeps feedback attached to the reviewed content, makes approvals auditable, and helps teams hand off final approved assets without turning the product into a full email builder.

The portfolio case study is in `docs/case-study.md`.

## What it does
- OTP login with session cookies
- multiple review boards with URL-based board switching
- email board for browsing stages, language versions, and adaptations
- admin board setup: create boards, add/rename/reorder stages, and delete empty stages
- email review view with text selection, action popovers, comment severity, resolution, activity history, and 5-second comment polling
- admin inline editing of template-backed email fields and metadata from the review preview
- admin creation of uploaded/pasted HTML emails
- backend HTML inspection before creating an email: generated review HTML, review block count, editable fields, and warnings
- email duplication, versioning, delivery adaptations, archive, rendered preview, and rendered HTML export
- shared AI analysis for an email, including streaming first-run updates and cached reuse
- AI-assisted journey review that evaluates an email in context: stage, audience, send timing, subject, preheader, body copy, clarity, conversion friction, compliance risk, and handoff readiness
- admin auth events, email events, user management, and AI analysis logs
- download/copy original HTML

## Stack
- Frontend: React 19 + Vite + Mantine v9 + TanStack Query + React Router
- Backend: Go + Chi
- DB: PostgreSQL
- Streaming: SSE/EventSource for AI analysis
- Auth: OTP + session cookies

## Portfolio demo path
The intended demo flow is:

1. Start the local stack with `make setup-dev` and `make dev`.
2. Open the onboarding board and choose a seeded email.
3. Review the email preview, add or resolve comments, and inspect activity history.
4. Edit template-backed copy or planning metadata as an admin.
5. Show approvals becoming stale after content changes, then re-approve required areas.
6. Inspect the production handoff package.

Screenshots and a short demo video should be captured after the seeded demo path is finalized:

- board overview with stages and email variants
- review screen with anchored comments
- editable fields or version history after a content change
- approval matrix with stale or pending areas
- production handoff package
- AI analysis or AI logs, if configured for the demo

## Architecture highlights
- Backend is the source of truth for review state, comments, approval gates, versions, and handoff data.
- Original HTML is preserved; template-backed edits update `data-edit-*` fields and the backend renders the final HTML.
- Comments attach to `data-review-block` anchors and text ranges so review context survives normal workflow changes.
- Approval flow blocks completion while blocking comments or required area approvals remain open.
- AI analysis reviews email effectiveness inside the journey, not only generic copy quality; it streams over SSE/EventSource for first-run progress and reuses cached shared results afterward.
- Admin and super-admin roles separate board/review operations from user, permission, and HTML administration.

## Screens
- `/` redirects to the preferred board, usually `/boards/onboarding`
- `/boards/{boardKey}` email board
- `/emails/new` admin email creation from uploaded/pasted HTML
- `/emails/{id}/review` email review view with inline comment and edit actions
- `/emails/{id}/edit` legacy route that redirects to `/emails/{id}/review`
- `/auth-events` admin auth events
- `/ai-logs` AI analysis logs
- `/admin/email-events` super-admin email events
- `/admin/operational-events` admin operational events
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
- `make lint` runs backend tests, frontend lint, and frontend build.
- `make test-api` runs `cd apps/api && go test ./...`.
- `make test-web` runs `cd apps/web && npm run lint && npm run build`.
- `make db-migrate` / `make db-seed` / `make db-sync-meta` for data setup.
- `cd apps/web && npm run dev|lint|build`.
- `cd apps/api && go test ./...`.
- `cd apps/api && go run ./cmd/server`.

## Quality checks
- Local full check: `make lint`.
- API check: `make test-api`.
- Web check: `make test-web`.
- Production smoke check: `make smoke-check SMOKE_ORIGIN=https://your-origin.example`.
- GitHub Actions runs API tests plus web lint/build on pushes to `main` and pull requests.

## API
- `GET /health` returns service and database health.
- `POST /api/auth/request-code` sends or logs an OTP code for an allowed domain.
- `POST /api/auth/verify-code` verifies an OTP code and creates the session cookie.
- `POST /api/auth/dev-login` creates a session without OTP only when `AUTH_DEV_LOGIN_ENABLED=true`.
- `GET /api/auth/me` returns the current user.
- `POST /api/auth/logout` clears the current session.
- `GET /api/auth/events` lists admin-only auth audit events.
- `GET /api/admin/users` lists users for super admins.
- `PATCH /api/admin/users/{id}/role` updates a user role for super admins.
- `GET /api/boards` lists boards and their ordered stages.
- `POST /api/boards` creates a board by copying stages from a source board.
- `POST /api/boards/{boardKey}/stages` adds a stage.
- `PATCH /api/boards/{boardKey}/stages/{stage}` renames a stage and updates emails in that board.
- `PATCH /api/boards/{boardKey}/stages` reorders stages; the payload must contain the same stages exactly once.
- `DELETE /api/boards/{boardKey}/stages/{stage}` deletes an empty stage.
- `GET /api/emails?board={boardKey}` lists active emails for a board.
- `POST /api/emails/inspect-html` inspects uploaded HTML before creation.
- `POST /api/emails` creates an email from uploaded/pasted HTML for admins.
- `GET /api/emails/{id}` returns email detail, original HTML, review HTML, template HTML, and editable fields.
- `GET /api/emails/{id}/rendered` returns the rendered HTML after template-backed edits.
- `PATCH /api/emails/{id}/editable-fields` updates template-backed fields and metadata for admins.
- `PATCH /api/emails/{id}/review-status` updates the review status.
- `POST /api/emails/{id}/duplicate` creates a new version/adaptation from an email for admins.
- `POST /api/emails/{id}/adaptations` creates a delivery adaptation for admins.
- `PATCH /api/emails/{id}/archive` archives an email for admins.
- `GET /api/emails/{id}/comments` lists comments.
- `GET /api/emails/{id}/activity` lists unified review activity for the email.
- `POST /api/emails/{id}/comments` creates a comment anchored to a review block and text range with `suggestion`, `issue`, or `blocking` severity.
- `PATCH /api/comments/{id}/resolve` resolves a comment.
- `GET /api/emails/{id}/ai-analysis` returns cached shared AI analysis.
- `POST /api/emails/{id}/ai-analysis` runs shared AI analysis.
- `GET /api/emails/{id}/ai-analysis-stream` streams shared AI analysis over SSE/EventSource.
- `GET /api/emails/{id}/ai-analysis-debug` returns admin-only prompt/debug payloads when debug mode is enabled.
- `GET /api/ai-analysis-logs` lists admin-only AI analysis logs.
- `GET /api/admin/email-events` lists super-admin email audit events.
- `GET /api/admin/operational-events` lists admin-only operational events.

## Environment
- `apps/api/cmd/server/main.go` and `apps/api/cmd/seed/main.go` both load `../../.env`.
- `DATABASE_URL` is required for API, seed, and migration commands.
- `goose` must be available on `PATH`.
- Docker runs migrations, conditionally runs seed when `RUN_DB_SEED=true`, then starts the server via `apps/api/entrypoint.sh`.
- Local development can enable OTP bypass with `AUTH_DEV_LOGIN_ENABLED=true` on the API and `VITE_AUTH_DEV_LOGIN_ENABLED=true` on the web app. Keep both unset or `false` in production.

## Notes
- Backend is the source of truth.
- Keep original HTML unchanged.
- Email editing is template-backed: admins edit metadata and `data-edit-*` fields from the review preview action popover, then the backend renders final HTML for preview/export.
- Super admins can edit source HTML from the review preview action popover; changed `data-edit-*` markers are re-extracted on save.
- When text-backed editable content changes, text-range comment anchors on changed blocks are normalized to whole-block anchors.
- Preview untrusted HTML in isolation and do not execute scripts.
- AI analysis is shared per email: cached results are reused across users, while explicit shared re-generation is limited to 10 per day per email and user.
- Comments use frontend polling for near-real-time updates; there is no WebSocket-based realtime layer in the current code.
