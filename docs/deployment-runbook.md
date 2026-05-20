# ReviewDesk Deployment Runbook

This document captures the production wiring and the minimum checks to run after a deploy.

## Topology

- Frontend runs on Cloudflare Pages.
- Cloudflare Pages functions proxy `/api/*` and `/health` to the API backend.
- API runs on Railway from the root `Dockerfile`.
- PostgreSQL is provided through `DATABASE_URL`.
- The API container entrypoint runs migrations, then seed, then starts the server.

## Cloudflare Pages

Required environment variables:

- `BACKEND_ORIGIN`: Railway API origin, for example `https://email-review-tool-production.up.railway.app`.
- `VITE_AUTH_ALLOWED_DOMAINS`: comma-separated domains shown by the login UI.
- `VITE_AUTH_ALLOWED_DOMAIN`: legacy single-domain fallback for the login UI.

Routing expectations:

- `/api/*` is handled by `apps/web/functions/api/[[path]].ts`.
- `/health` is handled by `apps/web/functions/health.ts`.
- Both functions forward to `BACKEND_ORIGIN`.

## Railway API

Required environment variables:

- `DATABASE_URL`: PostgreSQL connection string.
- `AUTH_ALLOWED_DOMAINS`: comma-separated domains that may sign in.
- `AUTH_BOOTSTRAP_SUPER_ADMIN_EMAIL`: first super admin email.
- `AUTH_ALLOWED_ORIGINS`: Cloudflare frontend origin, for example `https://reviewdesk.rubashkin.xyz`.
- `AUTH_COOKIE_SECURE=true` in production.
- `AUTH_LOG_LOGIN_CODES=false` in production when `RESEND_API_KEY` is configured.
- `RESEND_API_KEY`: enables email OTP delivery.

Optional AI variables:

- `OPENAI_API_KEY`: enables AI analysis.
- `OPENAI_MODEL`: defaults to `gpt-5-nano`.
- `AI_RESPONSE_LANGUAGE`: defaults to `Russian`.
- `AI_DEBUG_ENABLED=false` in production unless actively debugging.

## Deploy Flow

1. Deploy the Railway API image.
2. Confirm Railway logs show migrations completed, seed completed, and server started.
3. Deploy Cloudflare Pages frontend.
4. Run the smoke check against the public frontend origin:

```sh
make smoke-check SMOKE_ORIGIN=https://reviewdesk.rubashkin.xyz
```

## Smoke Check

The smoke check verifies:

- `GET /health` returns HTTP 200 with `status: ok` and `database: ok`.
- Unauthenticated `GET /api/boards` returns HTTP 401, proving the Cloudflare proxy reaches the protected backend route.

To verify authenticated board loading, pass a browser session cookie from a signed-in admin/reviewer session:

```sh
SMOKE_SESSION_COOKIE='email_review_session=...' make smoke-check SMOKE_ORIGIN=https://reviewdesk.rubashkin.xyz
```

With `SMOKE_SESSION_COOKIE`, `GET /api/boards` must return HTTP 200 and a JSON array.

If `/health` passes but `/api/boards` returns neither unauthenticated 401 nor authenticated 200, check Cloudflare `BACKEND_ORIGIN`, Railway API logs, and auth/origin middleware changes.

If `/health` fails, check Railway service health, `DATABASE_URL`, and migration logs.

## Rollback Notes

- Roll back frontend and backend independently if the failure is isolated.
- Backend schema changes are managed by goose migrations in `db/migrations`.
- Do not run destructive database rollback commands in production without a database backup and explicit approval.
