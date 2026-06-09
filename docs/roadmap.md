# ReviewDesk Roadmap

This roadmap tracks active product and production-hardening work for ReviewDesk.

Closed work is intentionally summarized rather than kept as long checked-off sections. Detailed implementation history belongs in git commits and release notes; the roadmap should stay useful for choosing the next task.

Engineering maturity work, including AI provider architecture, CI, infrastructure, refactoring, and observability, belongs in `docs/improvement-plan.md`. Current-product bugs and polish belong in `docs/stabilization-audit.md`.

## Portfolio Good Enough Finish Line

ReviewDesk is no longer being expanded as an open-ended product backlog. The near-term goal is to finish it as a portfolio-ready product-engineering case study: a working review workflow, credible demo data, clear architecture, basic engineering maturity, and enough UX polish that the demo feels intentional.

This is the finish-line checklist before showing the project publicly:

- [ ] Demo story:
  - prepare reproducible seed/demo data that shows board -> review -> comment -> edit -> stale approval -> re-approval -> handoff;
  - make the demo path easy to reset and rerun locally;
  - ensure the demo illustrates the core product idea without requiring private customer data.
- [ ] Engineering credibility:
  - complete `P0. Актуализировать проверки` from `docs/improvement-plan.md`;
  - add top-level checks such as `make lint`, `make test-api`, and `make test-web`;
  - add a basic GitHub Actions workflow for backend tests, frontend lint, and frontend build.
- [ ] Refactor credibility:
  - complete one visible, safe engineering maturity improvement from `docs/improvement-plan.md`;
  - recommended: `[AI] AI architecture maturity` if the portfolio story should emphasize modern backend, AI, and product engineering;
  - alternative: split `email_handlers.go` if the portfolio story should emphasize maintainability in an existing Go codebase;
  - do not do a large backend and frontend refactor in the same finishing pass.
- [ ] Demo polish:
  - close the `P1` items from `docs/stabilization-audit.md`;
  - add confirmations for destructive board settings actions;
  - add a centralized 401/session-expired recovery flow.
- [ ] Portfolio-facing documentation:
  - explain the problem statement, user workflow, architecture decisions, security/auth decisions, review anchoring model, approval model, AI streaming, and deployment topology;
  - make the documentation explain why the implementation choices are strong, not only what was built.
- [ ] Portfolio packaging:
  - write a case study in the shape `problem -> solution -> implementation -> result`;
  - polish the GitHub repository landing experience: README, description, topics, setup instructions, demo scenario, and checks;
  - capture 4-6 strong screenshots: board, review with comments, editable fields/versioning, approvals, handoff, and AI analysis/logs if available;
  - record a short 60-120 second demo video that shows the end-to-end workflow without a long introduction;
  - create a small landing page only if a separate product-style public link is useful after README, screenshots, and video are done.

Recommended finish order:

1. Demo dataset and demo flow.
2. P0 checks from `docs/improvement-plan.md`.
3. P1 stabilization items from `docs/stabilization-audit.md`.
4. One engineering showcase improvement from `docs/improvement-plan.md`.
5. Portfolio-facing documentation and packaging.

Out of scope for the portfolio finish:

- new large product features;
- workspaces;
- CRM/ESP publishing integrations;
- MJML;
- a broad permission-model redesign;
- a full visual redesign.

## Current Product Direction

ReviewDesk should stay focused on being the review, approval, versioning, and handoff layer for communication journeys before they are implemented in CRM, ESP, messaging, or other publishing systems.

The strongest near-term path is not to become a full marketing platform or a full email builder. The product should first become excellent at:

- keeping review context attached to the reviewed content;
- making approvals explicit and auditable;
- showing when approvals become stale after edits;
- helping teams hand off the final approved assets to implementation.

The most promising first external ICP remains CRM, lifecycle, and email marketing agencies that manage multi-stakeholder review for several clients.

## Completed Baseline

The current product already has:

- OTP/session auth, admin/super-admin user administration, and admin-only operational surfaces;
- reproducible backend/frontend checks;
- board search, review statuses, threaded comments, comment severity, ownership/reviewer/due-date planning fields, and admin-editable send timing/adaptation labels;
- editable email fields with approval-stale behavior after content edits;
- immutable edit version snapshots for title, subject, preheader, editable fields, and source/template HTML, with admin history UI, restore-as-new-version behavior, and edit version history v1;
- simple version/change summaries for subject, preheader, editable fields, template/source hash, review blocks, and email events;
- configurable board-level approval areas with required/optional flags, ordering, archive behavior, email-level area approval decisions, review UI matrix, and audit events;
- approval flow completion with required/optional area approvals, stale area re-approval, approval gates, and distinct review-approved/production-approved workflow states;
- minimal production-approved email handoff package with in-app approval/risk summaries, sequence-level handoff export, structured manifest, and review activity timeline;
- long mobile modals and menus remain scrollable within the viewport;
- board/stage audit events, stable admin event table filtering, production smoke check for `GET /api/boards`, and deployment mapping docs.

## Priority 2: Versioning And Diff Review

- [ ] Add version diff views:
  - compare subject and preheader changes;
  - compare editable field changes;
  - show changed review blocks between content snapshots;
  - connect diffs to approval snapshots and stale approval events.
- [ ] Add version-aware approval context:
  - show which version was approved or restored from;
  - make restore events easier to read in activity history;
  - show whether current approvals refer to the latest edit version.
- [ ] Add a board-level review checklist:
  - links checked;
  - legal/compliance checked;
  - localization checked;
  - CRM variables checked;
  - UTM/tracking checked.

## Priority 4: Handoff And Activity History

- [ ] Extend handoff package beyond the current in-app approval/risk summary for full production handoff:
  - links and UTM values;
  - final approval summary in exported package;
  - required area approval summary in exported package;
  - stale/pending/blocking risk summary in exported package.
- [ ] Extend activity history with:
  - area approvals;
  - stale area approvals;
  - final production approval;
  - approval gate failures when useful to users/admins.
- [ ] Add notifications for review workflow events:
  - start with a PostgreSQL `notification_outbox` table and worker rather than direct ad hoc sends from HTTP handlers;
  - keep the outbox write in the same transaction as the review/comment/status/approval event when possible;
  - use retry metadata such as `attempt_count`, `last_error`, `next_attempt_at`, and `sent_at`;
  - notify on new comments, replies, status changes, stale approvals, and completed AI analysis;
  - add one delivery channel first, likely email or Slack webhook, before broader integrations;
  - treat RabbitMQ as an optional second step for delivery fan-out, retries, and learning a production-style async layer;
  - if RabbitMQ is added, publish from the persisted outbox with a separate publisher worker, not directly from request handlers.

## Priority 5: Portfolio-Grade Demo

- [ ] Use the `Portfolio Good Enough Finish Line` section above as the source of truth for the public-demo finish.
- [ ] Prepare a demo-ready seed flow that shows the product story end to end:
  - board;
  - review;
  - comment;
  - edit;
  - stale approval;
  - re-approval;
  - handoff.
- [ ] Add portfolio-facing documentation:
  - problem statement;
  - user workflow;
  - architecture decisions;
  - security/auth decisions;
  - review anchoring model;
  - approval model;
  - AI streaming;
  - deployment topology.

## Priority 6: Audit And Operations

- [ ] Replace request-level operational event persistence with structured stdout request logs suitable for Loki/Grafana ingestion.
- [ ] Add request IDs to API responses and logs.
- [ ] Keep business audit events in PostgreSQL, but avoid storing high-volume access logs in product tables.
- [ ] Keep PostgreSQL audit tables focused on security and product events that users or admins need to inspect:
  - `auth_events` for login/security history;
  - `email_events` for review, content, board, approval, and handoff history;
  - `ai_analysis_logs` for AI run accounting and diagnostics.
- [ ] Keep Sentry or equivalent error reporting as an optional production layer for frontend/backend exceptions.

## Priority 7: Scale Boundaries

- [ ] Decide whether stages need stable IDs with editable display names.
- [ ] Make stage event types configurable instead of overloading the current title
  field as a de facto event type.
- [ ] Add board archive/hide behavior.
- [ ] Consider workspaces if the product expands beyond one team workflow.
- [ ] Add content search over email body text/content parts after the review workflow and handoff flow are stable.
- [ ] Add OpenAPI only when endpoint contracts stabilize enough that the spec will stay maintained.

## Deferred Until Workflow Validation

These ideas are useful, but they should not outrank the core review, approval, versioning, and handoff workflow.

- [ ] Add workspaces as the top-level collaboration boundary if ReviewDesk starts serving multiple teams, clients, or review programs.
- [ ] Define workspace membership and permissions before adding workspace-scoped data. Likely roles:
  - workspace owner: manages billing/configuration, members, and all boards;
  - workspace admin: manages members and workspace-level defaults;
  - board owner: controls one board, stages, reviewers, and AI rules for that board;
  - board admin: manages board workflow and email setup without owning the workspace;
  - reviewer: reviews emails, comments, and updates allowed statuses.
- [ ] Add a board-level admin role if boards can be owned by different managers inside one workspace.
- [ ] Add reviewer/approver permissions at the email or area level when real access-control pressure appears:
  - owner/editor manages the email and moves it through review;
  - reviewer comments and requests changes for a specific area;
  - approver approves a specific area or final production readiness;
  - viewer can inspect the email, comments, approvals, and history without changing state.
- [ ] Add MJML as an optional email authoring source with server-side compilation:
  - compiled HTML review snapshots;
  - preserved review/comment anchoring;
  - see `docs/add-mjml.md`.
- [ ] Consider client-side MJML compilation for reactive preview only after the server-side MJML source and compiled snapshot model is stable.
- [ ] Add AI quick start for new boards: suggested review rules, default checks, and seed instructions based on board purpose.
- [ ] Allow admins to edit AI instructions at multiple scopes:
  - global defaults for all boards;
  - workspace rules;
  - board-specific instructions;
  - email-specific overrides.
- [ ] Define how scoped AI instructions merge, including precedence, audit events, and rollback/version history.
- [ ] Add UI for viewing the effective AI instruction set used for a specific analysis run.
- [ ] Decide whether AI instructions should support reusable presets, for example onboarding, activation, winback, or partner-manager flows.
- [ ] Add rich text editing for email copy changes.
- [ ] Add automated CRM/ESP publishing integrations.

## Future Product Expansion

- [ ] Introduce a generic communication item model only after the email review workflow is strong enough:
  - journey;
  - communication item;
  - item type;
  - review state;
  - approval state.
- [ ] Add one short-form message item type first, such as SMS or push-style text.
- [ ] Keep comments, statuses, approvals, activity history, and handoff working consistently across email and the first short-form item type.
- [ ] Defer broader omnichannel scope, such as ads, banners, InMail, and deep analytics, until agencies validate the narrower workflow with real client work.
