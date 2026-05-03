# TODO

## Next product backlog

- [ ] Add API endpoint and admin view for AI analysis usage logs
- [ ] Show AI analysis latency, tokens, model, status, and errors in logs view
- [ ] Track AI cache hits and misses
- [ ] Add email-based authorization
- [ ] Support allowlist by email domain or exact email address
- [ ] Define permissions matrix for admin and user roles
- [ ] Add a dedicated email review view
- [ ] Add comments mode to the email review view
- [ ] Decide whether review needs comments only or comments + chat
- [ ] Add chat to the email review view if comments are not enough
- [ ] Add roles: admin and user
- [ ] Define email version statuses: draft, in_review, approved, published, archived
- [ ] Add version status transitions and validation
- [ ] Allow admins to upload new emails
- [ ] Allow admins to export/download emails
- [ ] Allow users to duplicate emails
- [ ] Allow users to edit email text parts and submit changes for review
- [ ] Allow admins to approve new email versions
- [ ] Allow admins to mark approved versions as published
- [ ] Track owner/responsible user for emails or sequences
- [ ] Design change history
- [ ] Track which user proposed changes and when
- [ ] Track which admin approved and published changes
- [ ] Add audit log for version creation, review submission, comments, approval, and publish events
- [ ] Add diff view between email versions
- [ ] Add notifications for review submitted, comments added, and version published
- [ ] Decide whether realtime updates are needed for review workflow or if refresh/polling is enough

---

## Out of scope for now

- Email editing
- Drag-and-drop flow
- React Flow
- User roles / permissions
- Version history
- AI suggestions
