# ReviewDesk Roadmap

This roadmap tracks active product and production-hardening work for ReviewDesk.

Closed work is intentionally summarized rather than kept as long checked-off sections. Detailed implementation history belongs in git commits and release notes; the roadmap should stay useful for choosing the next task.

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
- simple version-change summaries for subject, preheader, editable fields, template/source hash, and review blocks;
- configurable board-level approval areas with required/optional flags, ordering, archive behavior, email-level area approval decisions, and audit events;
- minimal approved-email handoff package, sequence-level handoff export, structured manifest, and review activity timeline;
- board/stage audit events, production smoke check for `GET /api/boards`, and deployment mapping docs.

## Priority 1: Approval Flow Completion

- [x] Add configurable board-level approval areas:
  - admins can add, rename, archive, reorder, and mark areas required/optional per board;
  - new boards copy approval areas from the source board;
  - email area approvals store actor, decision note, status, content snapshot hash, and audit events.
- [ ] Add approval areas to the email review UI:
  - show the approval matrix in the review view;
  - allow admins to approve/request changes per area with an optional note;
  - show required vs optional areas clearly.
- [ ] Add approval gates so an email cannot be fully approved while:
  - required area approvals are pending, stale, or changes requested;
  - open blocking comments remain.
- [ ] Mark area approvals stale after reviewed content changes:
  - compare area approval snapshot hashes to the current content snapshot;
  - surface stale areas in review UI, handoff, and activity history;
  - allow explicit re-approval per area.
- [ ] Add reviewer/approver permissions at the email or area level:
  - owner/editor manages the email and moves it through review;
  - reviewer comments and requests changes for a specific area;
  - approver approves a specific area or final production readiness;
  - viewer can inspect the email, comments, approvals, and history without changing state.
- [ ] Add final production approval as a distinct workflow state after required area approvals pass.

## Priority 2: Versioning And Diff Review

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

## Priority 3: Handoff And Activity History

- [ ] Extend handoff package for full production handoff:
  - links and UTM values;
  - final approval summary;
  - required area approval summary;
  - stale/pending/blocking risk summary.
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

## Priority 4: Portfolio-Grade Demo

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

## Priority 5: Audit And Operations

- [ ] Replace request-level operational event persistence with structured stdout request logs suitable for Loki/Grafana ingestion.
- [ ] Add request IDs to API responses and logs.
- [ ] Keep business audit events in PostgreSQL, but avoid storing high-volume access logs in product tables.
- [ ] Keep PostgreSQL audit tables focused on security and product events that users or admins need to inspect:
  - `auth_events` for login/security history;
  - `email_events` for review, content, board, approval, and handoff history;
  - `ai_analysis_logs` for AI run accounting and diagnostics.
- [ ] Keep Sentry or equivalent error reporting as an optional production layer for frontend/backend exceptions.

## Priority 6: Scale Boundaries

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
