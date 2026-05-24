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

## Priority 1: Admin Surface And Cookie Safety

- [x] Restrict admin-style operational endpoints to admin users, especially AI analysis logs and AI debug payloads.
- [x] Add defense-in-depth for cookie-authenticated mutating API requests by rejecting cross-origin browser requests.
- [x] Keep the local Vite proxy workflow working for same-origin `/api` calls.

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
- [ ] Add lightweight ownership and planning fields:
  - owner;
  - reviewer;
  - due date;
  - optional implementation notes.
- [ ] Connect email editing to review state:
  - store review decisions against a specific email version;
  - keep comments open after edits until a user resolves them explicitly;
  - [x] mark approvals stale when the email changes after approval;
  - highlight review blocks changed after related comments or approvals.
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
- [ ] Add a board-level review checklist:
  - links checked;
  - legal/compliance checked;
  - localization checked;
  - CRM variables checked;
  - UTM/tracking checked.

## Priority 4: Handoff And Activity History

- [ ] Add a handoff package for an approved email or sequence:
  - final rendered HTML;
  - subject and preheader;
  - links and UTM values;
  - implementation notes;
  - approval state;
  - open blockers.
- [x] Add a concise activity timeline in the review view:
  - comments;
  - replies;
  - comment resolution;
  - status changes;
  - edits;
  - AI analysis runs.
- [ ] Extend activity history with approvals, stale approvals, and final production approval after those workflow states exist.

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

## Priority 7: Scale Boundaries

- [ ] Decide whether stages need stable IDs with editable display names.
- [ ] Add board archive/hide behavior.
- [ ] Consider workspaces if the product expands beyond one team workflow.

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
