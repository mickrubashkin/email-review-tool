# Improvement Plan

План ниже — не список механических рефакторингов, а порядок работ с учетом текущего состояния репозитория. Главный принцип: сначала добавить проверки и тестовые опоры, потом резать крупные файлы без изменения поведения.

## P0. Актуализировать проверки

Цель: сделать будущий рефакторинг безопасным и воспроизводимым.

- Добавить top-level `make lint`, который запускает:
  - backend: `cd apps/api && go test ./...`
  - frontend: `cd apps/web && npm run lint`
  - frontend build/typecheck: `cd apps/web && npm run build`
- Добавить `make test-api` и `make test-web`.
- Добавить базовый GitHub Actions workflow:
  - `go test ./...`
  - `npm ci`
  - `npm run lint`
  - `npm run build`
- Зафиксировать workflow для интеграционных Go-тестов с PostgreSQL:
  - либо `docker-compose.test.yml` + `TEST_DATABASE_URL`
  - либо `testcontainers-go`, если нужен автономный запуск БД из Go-тестов

Примечание: `apps/web/eslint.config.js` уже существует, добавлять ESLint с нуля не нужно.

## P1. Backend: уменьшить риск в `email_handlers.go`

Текущий файл: `apps/api/cmd/server/email_handlers.go` — 2581 строка.

Сначала вынести повторяемую логику без изменения публичного API:

- Общий SQL-фрагмент/mapper для `open_comment_count` и `open_blocking_comment_count`.
- Helper для проверки approval gates:
  - нельзя approve при открытых blocking comments
  - нельзя approve при незакрытых required area approvals
- Общие helpers для декодирования JSON requests и стандартных ошибок там, где это уже повторяется.

После этого разбить файл по областям:

- `email_handlers_routes.go` — регистрация email routes.
- `email_handlers_list.go` — `listEmailsHandler`, `getEmailHandler`.
- `email_handlers_crud.go` — `createEmailHandler`, `duplicateEmailHandler`, `archiveEmailHandler`.
- `email_handlers_edit.go` — editable/planning fields updates.
- `email_handlers_status.go` — review status updates and approval gate checks.
- `email_handlers_inspect.go` — HTML inspection.

Guardrail: каждый шаг должен проходить `cd apps/api && go test ./...`. Разбиение файлов не должно менять SQL semantics, JSON shape или HTTP status codes.

## P2. [AI] AI architecture maturity

Цель: сделать AI-подсистему демонстрационно зрелой без превращения ее в отдельную платформу.

Текущий код уже содержит отдельные `ai_service.go`, `ai_openai.go`, `ai_prompt.go`, streaming, cache hash, metrics, debug endpoint и AI logs. Следующий шаг — отделить orchestration от LLM transport и добавить воспроизводимость.

- Ввести Go-интерфейс `LLMProvider` для выполнения AI-запросов:
  - один метод для streaming/non-streaming analysis output;
  - provider должен возвращать output text и usage/diagnostic metadata;
  - `AIAnalysisService` должен отвечать за prompt/input/schema/cache orchestration, а provider — за HTTP transport.
- Сделать первым implementation `OpenAIResponsesProvider`:
  - сохранить текущую Responses API semantics;
  - сохранить SSE parsing и usage extraction;
  - не обещать полную совместимость со всеми OpenAI-compatible провайдерами, пока используется Responses API.
- Добавить `OPENAI_BASE_URL`:
  - default: `https://api.openai.com/v1`;
  - endpoint строить как `{base_url}/responses`;
  - задокументировать переменную в `.env.example` и `docs/deployment-runbook.md`.
- Добавить structured logging через стандартный `log/slog`:
  - provider, model, status, latency, token counts, cached tokens, force refresh, error class;
  - не логировать email body, prompt body, API key или полный provider response.
- Добавить явный `AI_PROMPT_VERSION`:
  - default должен соответствовать текущей версии prompt/schema behavior;
  - включить в `PromptHash()`, AI logs/debug payload и cache invalidation logic;
  - оставить `aiAnalysisSchemaVersion` для wire/schema compatibility.
- Добавить маленький evaluation dataset:
  - хранить fixtures в `apps/api/ai/evals/`;
  - покрыть хотя бы good/minor/needs-work examples;
  - тест должен проверять schema parse, required fields, language of human-readable output expectations where feasible, and stable prompt input construction.
- Добавить fallback chain только после provider interface:
  - конфиг вроде `AI_MODEL_FALLBACKS`;
  - fallback только на timeout, rate limit, 5xx и transport errors;
  - не fallback на JSON/schema parse errors, чтобы не скрывать prompt regressions;
  - каждый fallback attempt должен попадать в structured logs and AI diagnostics.

Guardrail: не добавлять новые внешние logging/eval фреймворки на первом шаге. Достаточно стандартной библиотеки Go, существующих тестов и небольших fixtures.

## P3. Backend: introduce sqlc for database access

Цель: заменить самые рискованные прямые SQL-запросы на типизированный слой `sqlc`, не превращая это в полный rewrite backend.

Это хороший portfolio-grade рефакторинг, потому что показывает зрелую работу с PostgreSQL, type-safe query boundaries и миграцию существующего кода без изменения публичного API. Делать его стоит только после `P0`, чтобы проверки уже ловили регрессии.

- Добавить минимальную конфигурацию `sqlc.yaml` для `pgx/v5`:
  - source schema: `db/migrations`;
  - generated package рядом с backend-кодом, например `apps/api/internal/db`;
  - queries складывать в небольшие domain-файлы, а не в один общий SQL-файл.
- Начать с одного ограниченного workflow, где типизация даст заметную пользу:
  - recommended: approval gates and area approvals;
  - alternative: email list/detail queries with comment counters;
  - не мигрировать auth, comments, AI logs и admin endpoints в том же PR.
- Оставить существующие handler contracts без изменений:
  - не менять JSON shape;
  - не менять HTTP status codes;
  - не менять transaction semantics;
  - не менять существующие migration files ради удобства генерации.
- Добавить generation/check workflow:
  - `make sqlc-generate` или аналог;
  - документировать требование к `sqlc` в README/development docs;
  - в CI добавить проверку generated code только после того, как generator стабильно доступен в dev workflow.
- После первого workflow оценить, продолжать ли миграцию:
  - переносить следующий domain только если стало меньше ручного scan/mapper boilerplate или ниже риск SQL/Go type drift;
  - не мигрировать простые одноразовые запросы только ради формального покрытия.

Guardrail: sqlc не должен стать большим архитектурным rewrite. Первая итерация должна быть маленькой, проходить `cd apps/api && go test ./...`, и оставлять rollback path простым.

## P4. Backend: auth cleanup

Текущий файл: `apps/api/cmd/server/auth.go` — 840 строк.

Разбить без изменения поведения:

- `auth_handlers.go` — login/logout/session endpoints.
- `auth_middleware.go` — authentication/authorization middleware.
- `auth_sessions.go` — session cookies, token/session persistence helpers.
- `auth_config.go` — allowed domains, dev login config, bootstrap/admin config.

Guardrail: сохранить текущий приоритет `AUTH_ALLOWED_DOMAINS` над legacy `AUTH_ALLOWED_DOMAIN`. Он уже описан в `.env.example`; не дублировать как новую задачу.

## P5. Frontend: декомпозиция review screen

Текущий файл: `apps/web/src/features/review/EmailReview/EmailReview.tsx` — 1241 строка.

Не выносить все в один большой `useEmailReview()`. Резать по workflow:

- `useEmailReviewQuery` — загрузка email/review данных и derived loading/error state.
- `useEmailCommentMutations` — create/resolve/reopen comments.
- `useEmailFieldMutations` — editable/planning fields updates.
- `useEmailAreaApprovalMutations` — area approval actions.
- `useEmailReviewUiState` — selection, active panels, modals, drawer state.

Компоненты-кандидаты:

- `ReviewDetailsSection`
- `ReviewActivitySection`
- `ReviewApprovalSection`
- `ReviewEditableFieldsSection`

Уже существующие компоненты `ReviewHeader`, `ReviewLayout`, `ReviewPanels`, `ReviewModals`, `CommentsPanel` сохранить и расширять, если это естественно ложится на текущую структуру.

Guardrail: после каждого шага запускать `cd apps/web && npm run build`. Для UI-изменений дополнительно проверить review page в браузере.

## P6. Frontend: API module cleanup

Текущий файл: `apps/web/src/features/emails/api.ts` — 659 строк.

Сначала убрать точечное дублирование:

- Вынести общий `buildQueryString(filters)` для повторяющихся `URLSearchParams`.
- Вынести общий request helper только если он реально уменьшает boilerplate и не скрывает обработку ошибок.

Потом разделить по feature boundaries, а не в глобальную папку `src/api`:

- `features/emails/api.ts` — email board/list/create/update.
- `features/review/api.ts` — review-specific calls, comments, area approvals.
- `features/boards/api.ts` — boards and approval areas.
- `features/auth/api.ts` — auth/session calls.
- `features/admin-*/api.ts` — admin-specific endpoints рядом с соответствующими features.

Guardrail: не вводить path alias `@/` отдельной задачей. Это имеет смысл только если импортные пути реально станут шумными после декомпозиции.

## P7. Infrastructure

- `Dockerfile`: добавить сборку `syncmeta` рядом с `server` и `seed`, если runtime/entrypoint действительно должен уметь регенерировать `meta.json`.
- `Dockerfile`: добавить `HEALTHCHECK` только вместе с runtime dependency:
  - либо установить `curl`
  - либо использовать другой доступный healthcheck-механизм
- `netlify.toml`: не менять на SPA fallback автоматически. Сейчас там permanent redirect на `https://reviewdesk.rubashkin.xyz/:splat`; сначала нужно подтвердить желаемую deployment-модель.
- `requests.http`: заменить хардкодные UUID на переменные там, где запросы действительно должны быть переиспользуемыми.

## Не делать сейчас

- Не вводить полный `EmailService`/`BoardService`/`AuthService` слой как самостоятельную цель. Сначала выделять helpers/repositories вокруг реальной повторяемой бизнес-логики и транзакционных сценариев.
- Не добавлять новые библиотеки для форматирования/линтинга без конкретной проблемы. Frontend ESLint уже есть.
- Не делать крупный backend/frontend refactor в одном PR.
