# ReviewDesk Roadmap

This roadmap captures the next production-hardening and workflow improvements for ReviewDesk.

## Priority 1: Admin Surface And Cookie Safety

- [x] Restrict admin-style operational endpoints to admin users, especially AI analysis logs and AI debug payloads.
- [x] Add defense-in-depth for cookie-authenticated mutating API requests by rejecting cross-origin browser requests.
- [x] Keep the local Vite proxy workflow working for same-origin `/api` calls.

## Priority 2: Test Reproducibility

- [ ] Make `go test ./...` reliable from the intended working directory.
- [ ] Fix tests that depend on repo-relative seed paths.
- [ ] Keep network-listener tests isolated or skippable in restricted environments.

## Priority 3: Review Workflow

- [ ] Add email search on the board.
- [ ] Add an explicit review status for each email.
- [ ] Decide whether comments need replies or threads before building threaded discussions.

## Priority 4: Audit And Operations

- [ ] Add audit events for board and stage changes.
- [ ] Add a production smoke check for `GET /api/boards`.
- [ ] Document Cloudflare Pages `BACKEND_ORIGIN` and Railway service mapping.

## Priority 5: Scale Boundaries

- [ ] Decide whether stages need stable IDs with editable display names.
- [ ] Add board archive/hide behavior.
- [ ] Consider workspaces if the product expands beyond one team workflow.
