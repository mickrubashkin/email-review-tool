# AGENTS.md

## Context
ReviewDesk — internal tool для ревью HTML-писем. Go backend (Chi + pgx, direct SQL) + React frontend (Mantine v9, TanStack Query, React Router).

## Repo layout
- `apps/api/cmd/server` — HTTP API entrypoint; `main.go` загружает `../../.env`.
- `apps/api/cmd/seed` — seed из `db/seeds/emails/{stage}/{email}/{lang[-old]}.html`; `meta.json` рядом.
- `apps/api/cmd/syncmeta` — регенерация `meta.json`.
- `apps/web/src/main.tsx` — точка входа фронта.
- `apps/web/src/App.tsx` — роутер. `/emails/{id}/edit` редиректит на `/emails/{id}/review`.
- `db/migrations/` — goose-миграции, применяются по порядку.

## Commands
- `make setup-dev` — DB up → миграции → seed.
- `make dev` — DB up, API, web параллельно.
- `make db-migrate` / `make db-seed` / `make db-sync-meta`.
- `cd apps/web && npm run dev|lint|build`. **build** запускает `tsc -b && vite build`.
- `cd apps/api && go test ./...`. Для одного теста: `go test -run TestName ./cmd/server`.
- `cd apps/api && go run ./cmd/server`.
- Smoke-тест: `./scripts/smoke-check.sh`.

## Environment / tooling
- `.env` лежит в корне репозитория; API грузит через `godotenv.Load("../../.env")`, web — через `envDir: "../.."` в vite.config.ts.
- `DATABASE_URL` обязательна для всех Go-команд и миграций.
- `goose` нужен на PATH (используется в Makefile и entrypoint.sh).
- Web dev-server проксирует `/api` и `/health` на `localhost:8080`.
- **Админские роли**: `admin` (управление досками, ревью, редактирование) и `super_admin` (управление пользователями, правами, HTML). `admin` видит не все административные страницы.
- AI streaming: SSE/EventSource на `/api/emails/{id}/ai-analysis-stream`. Не WebSocket.
- Комментарии: фронт-поллинг каждые 5 секунд (`refetchInterval: 5000`), не WebSocket/SSE.
- ОTP-логин: `AUTH_DEV_LOGIN_ENABLED=true` локально для входа без кода. На проде должен быть `false`.
- `VITE_AUTH_*` переменные дублируют `AUTH_*` для фронта (Vite их экранирует).
- OpenAI: `OPENAI_API_KEY` включает AI-ревью; `AI_DEBUG_ENABLED=true` включает debug-эндпоинт.

## Product rules
- Backend source of truth — писать в БД, потом отдавать через API.
- Оригинальный HTML письма не менять; редактирование шаблонное: админ меняет `data-edit-*` поля, бэкенд рендерит финальный HTML.
- Комментарии крепятся к `data-review-block` + текстовый диапазон.
- Превью стороннего HTML изолированно (sandbox iframe), скрипты не выполнять.

## Code conventions
- Хендлеры тонкие; логика в helpers/services.
- Прямые SQL-запросы, без ORM.
- Маленькие изменения, без новых библиотек без необходимости.
- Approval-гейты: нельзя аппрувнуть письмо, пока есть открытые blocking комментарии или незакрытые required area approvals.
