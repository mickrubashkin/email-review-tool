# MJML as an Optional Authoring Source

## Problem

ReviewDesk currently reviews compiled HTML email content. This is good for preserving
the exact artifact under review, but it makes creating or structurally editing emails
hard:

- new templates require hand-written email HTML;
- cross-client email layout is difficult to maintain;
- AI-assisted generation has to produce fragile HTML;
- inline editing through `data-edit-*` fields works for copy changes, but not for
  adding, removing, or rearranging email sections.

At the same time, ReviewDesk must keep its core guarantee: comments, approvals,
stale-approval checks, diffs, and handoff should stay attached to the reviewed
content snapshot.

## Direction

Add MJML as an optional source format for email authoring, not as an immediate
replacement for reviewed HTML.

The backend should remain the source of truth. ReviewDesk can store the source
document and the compiled review artifact side by side:

- `source_type`: `html` or `mjml`;
- `source_body`: original HTML or MJML source;
- `compiled_html`: HTML generated from the source and used for preview/review;
- `source_hash`: hash of the authoring source;
- `compiled_hash`: hash of the reviewed HTML artifact;
- `compile_errors`: latest MJML validation or compilation errors.

Comments and approvals should continue to attach to the compiled review snapshot.
This keeps the existing review model stable while allowing MJML to improve template
authoring over time.

## MVP

### Backend / Infrastructure

- Add a small Node.js MJML compiler service using the official `mjml` package.
- Expose a compile endpoint that accepts MJML and returns:
  - compiled HTML;
  - MJML validation warnings/errors;
  - a normalized compile status.
- Call the compiler service from the Go backend when saving or previewing MJML
  sources.
- Persist both the MJML source and the compiled HTML snapshot.
- Keep plain HTML emails supported through `source_type = html`.

### Review Model Preservation

- Preserve `data-review-block` in the compiled HTML using MJML `mj-attributes`,
  `mj-raw`, or supported `html-attributes` patterns where practical.
- Treat the compiled HTML as the artifact being reviewed.
- Use `compiled_hash` for approval snapshots and stale-approval checks.
- Do not assume that a comment anchored in one compiled snapshot can safely move
  across arbitrary MJML structural changes without diff/anchoring logic.

### Frontend / UX

- Replace iframe inline inputs with a Mantine side panel for editable variables
  and template fields.
- Render preview from backend-compiled HTML first.
- Use debounce for preview compilation requests so editing feels responsive without
  compiling on every keystroke.
- Keep iframe isolation for untrusted preview HTML and continue avoiding script
  execution.
- Add desktop/mobile preview sizing so MJML responsive behavior can be checked.

### AI

- Add MJML-aware prompts only after the storage and compile flow exists.
- Prefer AI suggestions that edit structured fields or MJML sections, then compile
  and validate before exposing the result as a reviewed snapshot.

## Later: Client-Side MJML Compilation

Client-side MJML compilation can make preview updates faster, but it should be a
second step rather than the first implementation.

Potential approach:

- load the MJML source and editable field values in the browser;
- compile in a Web Worker using a browser-compatible MJML bundle;
- update `iframe.srcdoc` from the compiled result;
- save source changes asynchronously through the backend;
- still run backend compilation before persisting the canonical reviewed snapshot.

Risks to validate before adding this:

- browser bundle size;
- compile performance on large templates;
- parity between browser and server compilation;
- validation/error UI;
- source/compiled snapshot consistency when async saves race.

## Open Questions

- Should MJML be available only for newly created emails, or can existing HTML
  emails be migrated?
- Which template variables belong in the source and which belong in structured DB
  fields?
- How much structural editing should ReviewDesk support before it becomes a full
  email builder?
- What is the minimum anchoring behavior required after MJML structure changes?
