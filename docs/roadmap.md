# ReviewDesk Roadmap

ReviewDesk is now being finished as a portfolio-ready product-engineering case study, not expanded as an open-ended product backlog.

## Finish Line

- [x] Demo data: disposable synthetic `demo-onboarding` board with 60 emails, comments, approvals, stale states, and handoff examples.
- [ ] Demo recording path: board -> review -> comment -> edit -> stale approval -> re-approval -> handoff.
- [x] Basic checks: top-level `make lint`, `make test-api`, `make test-web`, and GitHub Actions.
- [ ] Demo polish: destructive-action confirmations and centralized session-expired recovery.
- [ ] Engineering showcase: complete one focused backend improvement, preferably AI architecture maturity or a small `sqlc` migration.
- [ ] Portfolio packaging: screenshots, short demo video, and final case-study polish.

## Keep In Scope

- Review context attached to HTML email content.
- Explicit approvals and stale approval behavior after edits.
- Production handoff for approved assets.
- AI-assisted review of email effectiveness inside the journey.
- Small, defensible engineering improvements.

## Out Of Scope

- Full email builder.
- Workspaces or billing.
- CRM/ESP publishing integrations.
- MJML authoring.
- Broad permission-model redesign.
- Full visual redesign.
