# ReviewDesk Improvement Plan

This plan keeps the remaining engineering work small, visible, and useful for a portfolio review.

## P0. Checks

- [x] Add top-level `make lint`.
- [x] Add `make test-api` and `make test-web`.
- [x] Add GitHub Actions for API tests and web lint/build.
- [ ] Add a documented PostgreSQL integration-test workflow only if more DB-heavy tests are added.

## P1. Demo Polish

- Add confirmation before deleting board stages or archiving approval areas.
- Add centralized 401/session-expired handling in the frontend API/query layer.
- Keep the review demo path stable before recording screenshots or video.

## P2. Engineering Showcase

Choose one focused backend improvement:

- AI architecture maturity: split LLM transport from analysis orchestration, add prompt versioning, structured logs, and small eval fixtures.
- `sqlc` migration: introduce `sqlc` for one bounded workflow, preferably approval gates or area approvals, without changing API behavior.
- Handler cleanup: split the largest email handler paths only after checks are stable.

Guardrails:

- No large backend/frontend refactor in the same pass.
- No JSON shape, HTTP status, migration, or transaction-semantic changes unless explicitly required.
- Each step should pass `make lint`.

## Later

- Frontend review-screen decomposition.
- API module cleanup by feature boundary.
- Request logging and request IDs.
- Handoff export polish.
