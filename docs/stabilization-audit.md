# ReviewDesk Stabilization Backlog

This document tracks concrete bugs, UX polish, repro tasks, and engineering risks found during stabilization passes.

It intentionally stays separate from `docs/roadmap.md`:

- `roadmap.md` answers what product capabilities ReviewDesk should build next.
- this file answers what should be tightened, verified, or made safer in the current product.

If an item grows into a product capability, move it to the roadmap. If it remains a bug, polish task, or quality risk, keep it here.

## Status Labels

- `verified`: confirmed from current code or manual behavior.
- `needs repro`: plausible issue that needs a focused manual or automated reproduction before implementation.
- `risk`: architectural or scale concern that is not blocking current usage.

## Priority Labels

- `P1`: should be addressed in the next stabilization pass.
- `P2`: useful stabilization work after P1 items.
- `P3`: backlog or scale-readiness item.

## Verified Items

### 1. Destructive board settings actions have no confirmation

- `Status`: verified
- `Priority`: P1
- `Type`: UX / data safety
- `Location`: `apps/web/src/App.tsx`
- `Evidence`: `ManageStagesModal` calls `deleteBoardStage` directly from the delete icon. `BoardApprovalAreasManager` also archives an approval area directly from the archive icon. The backend blocks non-empty stage deletion, but empty stages and approval areas can still be removed/archived by a single accidental click.
- `Fix`: Add a lightweight confirmation modal or popover before calling destructive mutations. Keep the existing backend protection for non-empty stages.

### 2. Expired sessions do not have a centralized 401 flow

- `Status`: verified
- `Priority`: P1
- `Type`: auth UX
- `Location`: `apps/web/src/features/emails/api.ts`
- `Evidence`: `fetchJson` throws `ApiError(401, ...)`, and individual screens handle errors locally. There is no central session-expired redirect or user-facing recovery path.
- `Fix`: Add a global unauthorized handler either in the fetch wrapper or in TanStack Query `QueryCache` / `MutationCache`. The user should end up back at login with a clear session-expired state.

### 3. Inline edit likely resets iframe scroll

- `Status`: verified from code, needs final manual check
- `Priority`: P2
- `Type`: review UX
- `Location`: `apps/web/src/features/emails/MailPreview.tsx`
- `Evidence`: `handleFrameLoad` resets selection state and increments `frameLoadVersion`, but there is no scroll snapshot or restoration around iframe reloads after inline edits.
- `Fix`: Capture the iframe window scroll position before applying an inline edit and restore it after the next iframe `load` event.

### 4. Comment polling continues while users compose replies

- `Status`: verified
- `Priority`: P2
- `Type`: review UX
- `Location`: `apps/web/src/features/review/EmailReviewView.tsx`
- `Evidence`: `commentsQuery` refetches every 5 seconds. Comment and message list keys are already stable, so the main risk is not React key instability; it is background refresh while a user is reading or composing.
- `Fix`: Pause or slow comment polling while a reply/comment composer is focused or dirty. Resume after submit, cancel, blur, or a short idle timeout.

### 5. Duplicate-as conflicts are only caught after submit

- `Status`: verified
- `Priority`: P2
- `Type`: form polish
- `Location`: `apps/web/src/features/review/EmailReviewView.tsx`
- `Evidence`: The unified `Duplicate as...` flow submits to the backend and relies on a `409` conflict when the target `language + version + adaptation` already exists.
- `Fix`: Use the already loaded email group variants to detect an existing target combination before submit and show field-level or form-level validation.

### 6. Board settings modal is carrying two workflows

- `Status`: verified
- `Priority`: P2
- `Type`: UX polish
- `Location`: `apps/web/src/App.tsx`
- `Evidence`: The same modal now manages stages and approval areas. This is acceptable for the current internal tool, but the row controls are dense and both tabs reuse stage-oriented layout classes.
- `Fix`: Keep the current modal for now, but polish the settings experience before demo use: clearer tab labels, confirmation for destructive actions, area-specific copy, and less cramped row controls on narrow widths.

## Needs Reproduction

### 7. SSE analysis callbacks should be guarded by email id

- `Status`: needs repro
- `Priority`: P2
- `Type`: async hardening
- `Location`: `apps/web/src/features/emails/useEmailAnalysisStream.ts`
- `Evidence`: Current cleanup closes the active `EventSource` on `email.id` change, `opened` change, and unmount. That handles the obvious leak. A stale callback guard would still be useful defense-in-depth if a browser delivers queued events after close.
- `Fix`: Capture the requested `email.id` when starting analysis and ignore callbacks if it no longer matches the current stream email id.

### 8. Overlay collision around dense review blocks

- `Status`: needs repro
- `Priority`: P2
- `Type`: review UX
- `Location`: `apps/web/src/features/emails/MailPreview.tsx`, `apps/web/src/features/emails/ReviewCommentOverlay.tsx`
- `Evidence`: Comment badges and changed-block markers are custom overlay elements. Dense anchors may overlap, but this needs a screenshot or fixture that reproduces the collision.
- `Fix`: Add a dense-anchor fixture or manual repro. If confirmed, add collision-aware placement or aggregate nearby markers more aggressively.

### 9. Broken HTML handling needs negative tests

- `Status`: needs repro
- `Priority`: P2
- `Type`: backend validation
- `Location`: `apps/api/internal/emailreview/markup.go`, `apps/api/cmd/server/email_handlers.go`
- `Evidence`: Several create/update paths already return `400 invalid email HTML` when parsing fails. The remaining risk is unknown behavior for malformed but parseable email HTML, broken editable markers, or duplicated review block identifiers.
- `Fix`: Add focused API tests for malformed HTML, duplicated editable keys, broken review markers, and parseable-but-poor HTML. Only change behavior after a failing case is confirmed.

## Scale Risks

### 10. AI logs will need pagination before log volume grows

- `Status`: risk
- `Priority`: P3
- `Type`: performance
- `Location`: `apps/web/src/features/ai-logs/AIAnalysisLogsView.tsx`
- `Evidence`: The page uses server-side `limit` values up to 500 and then sorts/render rows client-side. This is acceptable for small internal usage, but will degrade as `ai_analysis_logs` grows.
- `Fix`: Add server-side pagination with cursor or offset. Keep client-side sorting only for the current page, or move sort parameters to the API.

### 11. Board search is immediate and client-side

- `Status`: risk
- `Priority`: P3
- `Type`: performance
- `Location`: `apps/web/src/App.tsx`
- `Evidence`: Board search filters the current board client-side on every keystroke and persists the query to session storage. This is fine for current small boards, but may become expensive with hundreds of emails and many variants.
- `Fix`: Add a small debounce or deferred value for board search before filtering. Server-side search can wait until board sizes justify it.

### 12. Transaction handling should stay part of backend review checklist

- `Status`: risk
- `Priority`: P3
- `Type`: backend audit
- `Location`: `apps/api/cmd/server`
- `Evidence`: The codebase uses manual `pgx` transactions in multiple handlers. Current key paths generally follow `defer tx.Rollback(...)`, so this is not a confirmed leak.
- `Fix`: Keep transaction rollback checks in code review. If a helper emerges naturally, add a small transaction wrapper later.

## Suggested Stabilization Order

1. Add confirmation before deleting stages or archiving approval areas.
2. Add centralized 401/session-expired handling.
3. Polish the board settings modal now that it manages stages and approval areas.
4. Preserve iframe scroll position after inline edits.
5. Pause comment polling while composing.
6. Add client-side duplicate-as conflict validation.
