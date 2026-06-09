# ReviewDesk Demo Plan

Goal: run a public demo without risking the production data used by the current team.

## Recommended Shape

- Production stays on the current production database and private access model.
- Public demo runs on `demo.reviewdesk.example.com` or equivalent.
- Demo uses a separate frontend, backend, and PostgreSQL database.
- Demo data is disposable and can be reset from demo seed at any time.
- Do not add workspaces/teams only to support the first public demo.

Subdomain is preferred over `/demo` because it keeps routes, cookies, API proxying, and frontend asset paths simple.

## Demo Access

- Demo-login mode is enabled only in the demo environment.
- Public visitors use `Enter demo`; no email OTP is required.
- The demo session uses `demo-reviewer@example.com` as a fixed low-privilege reviewer account.
- Optional: add a separate `Try admin mode` demo session only if edit/approval interaction is part of the recorded story.

## Allowed Demo Actions

Safe baseline:

- browse boards and emails;
- add comments;
- resolve/reopen own comments;
- inspect activity, approvals, AI analysis, and handoff state.

Interactive demo option:

- allow edit, approve, and re-approve actions in the demo database;
- reset demo data on a schedule or through an admin-only reset command.

## Protection

- Put the demo behind Cloudflare or equivalent edge protection.
- Rate-limit auth, comments, HTML upload/create, and AI endpoints.
- Disable public HTML upload/create unless it is required for the demo.
- Keep AI debug endpoints disabled.
- Limit AI force refresh or make demo AI cached-only.
- Keep production and demo secrets, databases, and cookies separate.

## Implementation Order

1. Add demo seed/reset strategy.
2. Add `AUTH_DEMO_LOGIN_ENABLED` for demo-only session creation.
3. Deploy demo frontend/backend with separate database.
4. Add basic rate limits at the edge.
5. Capture screenshots and a short demo video from the disposable demo environment.

## Seed Commands

Demo seed is intentionally separate from the normal production/current-team seed.

```sh
DEMO_SEED_ENABLED=true make db-seed-demo
DEMO_SEED_ENABLED=true DEMO_RESET_CONFIRM=demo make db-reset-demo
```

In the Railway backend service console, run the compiled demo seed binary from `/app`:

```sh
DEMO_SEED_ENABLED=true DEMO_RESET_CONFIRM=demo /app/demoseed -reset
```

The demo board key is `demo-onboarding`. Reset deletes only demo-owned board/email/session data and then recreates the generic demo scenario. It also removes the migration-created `onboarding` fallback board only when that board has no emails.

Demo login is controlled by environment variables:

```env
AUTH_DEMO_LOGIN_ENABLED=true
VITE_AUTH_DEMO_LOGIN_ENABLED=true
```

Keep both disabled in production.

## Demo Story

- Open `Demo Onboarding Review`.
- Review the `Complete Setup` hero email in the `activation` stage.
- Show one open blocking comment and one resolved comment.
- Show required approval areas with one approved area and one stale area.
- Open the `Upgrade Nudge` email to show a handoff-ready `production_approved` state.
