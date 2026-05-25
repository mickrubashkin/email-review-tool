# ReviewDesk Roadmap

This roadmap captures the next production-hardening, review-workflow, and product-positioning improvements for ReviewDesk.

## Current Product Direction

ReviewDesk should stay focused on being the review, approval, versioning, and handoff layer for communication journeys before they are implemented in CRM, ESP, messaging, or other publishing systems.

The strongest near-term path is not to become a full marketing platform or a full email builder. The product should first become excellent at:

- keeping review context attached to the reviewed content;
- making approvals explicit and auditable;
- showing when approvals become stale after edits;
- helping teams hand off the final approved assets to implementation.

The most promising first external ICP remains CRM, lifecycle, and email marketing agencies that manage multi-stakeholder review for several clients.

## Operational Direction

- Keep PostgreSQL audit tables focused on security and product events that users or admins need to inspect:
  - `auth_events` for login/security history;
  - `email_events` for review, content, board, and handoff history;
  - `ai_analysis_logs` for AI run accounting and diagnostics.
- Do not use PostgreSQL as the primary request access log store. Request-level observability should use structured stdout logs with fields such as `request_id`, method, path, status, duration, actor, and error.
- Make logs Loki/Grafana-ready by keeping JSON/logfmt-compatible structure and stable field names. Grafana should read from the deployment log pipeline, not from an in-app request-log table.
- Keep Sentry or equivalent error reporting as an optional production layer for frontend/backend exceptions.
- Do not merge all audit tables into one generic `audit_log` unless the current split becomes a real maintenance problem. Typed event tables are easier to query, test, and present in admin views while the domain is still evolving.

## Priority 1: Admin Surface And Cookie Safety

- [x] Restrict admin-style operational endpoints to admin users, especially AI analysis logs and AI debug payloads.
- [x] Add defense-in-depth for cookie-authenticated mutating API requests by rejecting cross-origin browser requests.
- [x] Keep the local Vite proxy workflow working for same-origin `/api` calls.
- [x] Add basic user administration:
  - admins can add reviewer users by email without sending invites;
  - super admins can add reviewer, admin, and super admin users;
  - users can later sign in through the existing OTP flow.

## Priority 2: Test Reproducibility

- [x] Make `go test ./...` reliable from the intended working directory.
- [x] Fix tests that depend on repo-relative seed paths.
- [x] Keep network-listener tests isolated or skippable in restricted environments.

## Priority 3: Core Review Workflow

- [x] Add email search on the board.
- [x] Add an explicit review status for each email.
- [x] Add pragmatic threaded comment replies.
- [x] Finish the review workflow state model:
  - keep `updated` and `archived` derived from edit events and archive fields, not review status;
  - keep comments as open/resolved for now, without a separate `rejected` state;
  - approved emails automatically move back to changes requested when edited.
- [x] Add comment severity:
  - suggestion;
  - issue;
  - blocking.
- [x] Add lightweight ownership and planning fields:
  - [x] owner;
  - [x] reviewer;
  - [x] due date;
  - [x] optional implementation notes;
  - [x] owner and reviewer can be selected from existing users, with saved-email fallback;
  - [x] owner, reviewer, and due date are visible from board card menus;
  - [x] admins can update send timing and the displayed adaptation name.
- [x] Connect email editing to review state:
  - [x] store review decisions against a specific email content snapshot;
  - [x] keep comments open after edits until a user resolves them explicitly;
  - [x] mark approvals stale when the email changes after approval;
  - [x] highlight review blocks changed after related comments or approvals.
- [x] Add approval stale behavior after edits:
  - [x] approved emails become stale when reviewed fields or source HTML changes;
  - [x] the UI clearly explains when an edit invalidated the approval;
  - [x] users can re-approve explicitly.
- [x] Add a simple version-change summary:
  - [x] subject changes;
  - [x] preheader changes;
  - [x] editable field changes;
  - [x] source/template hash changes when present in event data;
  - [x] changed review blocks when available.
- [ ] Add reviewer/approver roles at the email level:
  - owner/editor manages the email and moves it through review;
  - reviewer comments and requests changes for a specific area;
  - approver approves a specific area or final production readiness;
  - viewer can inspect the email, comments, and history without changing state.
- [ ] Add review areas and required approvals, for example product, brand, legal, sales, partnerships, localization, and CRM ops.
- [ ] Add approval gates so an email cannot be approved while required approvals are pending/stale or open blocking comments remain.
- [ ] Add version diff views:
  - compare subject and preheader changes;
  - compare editable field changes;
  - show changed review blocks between content snapshots;
  - connect diffs to approval snapshots and stale approval events.
- [ ] Add a board-level review checklist:
  - links checked;
  - legal/compliance checked;
  - localization checked;
  - CRM variables checked;
  - UTM/tracking checked.

## Priority 4: Handoff And Activity History

- [x] Add a minimal handoff package for an approved email:
  - final rendered HTML;
  - subject and preheader;
  - implementation notes;
  - approval state;
  - open blockers.
- [ ] Extend handoff package for full production handoff:
  - [x] sequence-level package;
  - links and UTM values;
  - [x] structured export manifest;
  - final approval summary.
- [x] Add a concise activity timeline in the review view:
  - comments;
  - replies;
  - comment resolution;
  - status changes;
  - edits;
  - AI analysis runs.
- [ ] Extend activity history with approvals, stale approvals, and final production approval after those workflow states exist.
- [ ] Add notifications for review workflow events:
  - start with a PostgreSQL `notification_outbox` table and worker rather than direct ad hoc sends from HTTP handlers;
  - keep the outbox write in the same transaction as the review/comment/status event when possible;
  - use retry metadata such as `attempt_count`, `last_error`, `next_attempt_at`, and `sent_at`;
  - notify on new comments, replies, status changes, stale approvals, and completed AI analysis;
  - add one delivery channel first, likely email or Slack webhook, before broader integrations;
  - treat RabbitMQ as an optional second step for delivery fan-out, retries, and learning a production-style async layer;
  - if RabbitMQ is added, publish from the persisted outbox with a separate publisher worker, not directly from request handlers.

## Priority 5: Portfolio-Grade Demo

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
  - AI streaming;
  - deployment topology.

## Priority 6: Audit And Operations

- [x] Add audit events for board and stage changes.
- [x] Add a production smoke check for `GET /api/boards`.
- [x] Document Cloudflare Pages `BACKEND_ORIGIN` and Railway service mapping.
- [ ] Replace request-level operational event persistence with structured stdout request logs suitable for Loki/Grafana ingestion.
- [ ] Add request IDs to API responses and logs.
- [ ] Keep business audit events in PostgreSQL, but avoid storing high-volume access logs in product tables.

## Priority 7: Scale Boundaries

- [ ] Decide whether stages need stable IDs with editable display names.
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
