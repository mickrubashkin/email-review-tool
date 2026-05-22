# ReviewDesk Roadmap

This roadmap captures the next production-hardening and workflow improvements for ReviewDesk.

## Priority 1: Admin Surface And Cookie Safety

- [x] Restrict admin-style operational endpoints to admin users, especially AI analysis logs and AI debug payloads.
- [x] Add defense-in-depth for cookie-authenticated mutating API requests by rejecting cross-origin browser requests.
- [x] Keep the local Vite proxy workflow working for same-origin `/api` calls.

## Priority 2: Test Reproducibility

- [x] Make `go test ./...` reliable from the intended working directory.
- [x] Fix tests that depend on repo-relative seed paths.
- [ ] Keep network-listener tests isolated or skippable in restricted environments.

## Priority 3: Review Workflow

- [x] Add email search on the board.
- [x] Add an explicit review status for each email.
- [x] Add pragmatic threaded comment replies.
- [ ] Add rich text editing for email copy changes.

## Priority 4: Audit And Operations

- [x] Add audit events for board and stage changes.
- [x] Add a production smoke check for `GET /api/boards`.
- [x] Document Cloudflare Pages `BACKEND_ORIGIN` and Railway service mapping.

## Priority 5: Scale Boundaries

- [ ] Decide whether stages need stable IDs with editable display names.
- [ ] Add board archive/hide behavior.
- [ ] Consider workspaces if the product expands beyond one team workflow.

## Product Backlog: Collaboration And AI Setup

- [ ] Add workspaces as the top-level collaboration boundary if ReviewDesk starts serving multiple teams, clients, or review programs.
- [ ] Define workspace membership and permissions before adding workspace-scoped data. Likely roles:
  - workspace owner: manages billing/configuration, members, and all boards;
  - workspace admin: manages members and workspace-level defaults;
  - board owner: controls one board, stages, reviewers, and AI rules for that board;
  - board admin: manages board workflow and email setup without owning the workspace;
  - reviewer: reviews emails, comments, and updates allowed statuses.
- [ ] Add a board-level admin role if boards can be owned by different managers inside one workspace.
- [ ] Add AI quick start for new boards: suggested review rules, default checks, and seed instructions based on board purpose.
- [ ] Allow admins to edit AI instructions at multiple scopes:
  - global defaults for all boards;
  - workspace rules;
  - board-specific instructions;
  - email-specific overrides.
- [ ] Define how scoped AI instructions merge, including precedence, audit events, and rollback/version history.
- [ ] Add UI for viewing the effective AI instruction set used for a specific analysis run.
- [ ] Decide whether AI instructions should support reusable presets, for example onboarding, activation, winback, or partner-manager flows.
