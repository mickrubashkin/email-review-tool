# Оценка состояния и план рефакторинга Backend API

В результате завершения Фазы 2 (выделение фичи `auth`), бэкенд продвинулся в переходе от монолитной архитектуры (где все находится в `cmd/server/`) к модульной (где логика разбита по доменам в `internal/features/`).

## Текущее состояние кодовой базы

- **Уже вынесены (Clean):**
  - `boards` (управление досками) -> `internal/features/boards/`
  - `auth` (аутентификация) -> `internal/features/auth/` и `internal/core/auth/`
  - Рендеринг и текст -> `internal/emailedit/`, `internal/emailreview/`, `internal/emailtext/`
- **Осталось в `cmd/server/` (Monolith):**
  В пакете `main` до сих пор остается около **12 000 строк кода**. Основные неразделенные домены:
  - **Emails** (~7500 строк): `email_handlers.go`, `email_versions.go`, `email_area_approvals.go`, `email_activity.go`, `email_events.go`, `email_sender.go` и их огромные тесты.
  - **AI Analysis** (~1300 строк): `ai_handlers.go`, `ai_service.go`, `ai_openai.go`, `ai_prompt.go`, `ai_analysis_cache.go`, `ai_analysis_logs.go`.
  - **Comments** (~900 строк): `comment_handlers.go`, `comment_handlers_test.go`.
  - **Core/System** (~400 строк): `operational_events.go`, `health_handler.go`, общие middleware.
  - **Types** (`types.go`): Глобальный файл типов, который связывает все домены вместе.

> [!WARNING]
> Главная сложность дальнейшего рефакторинга заключается в сильной связанности домена `Emails` с `Comments` и `AI`. А также в глобальном файле `types.go`, где сейчас лежат модели всех доменов.

---

## Предлагаемые дальнейшие шаги (Фазы 3-6)

Рекомендуется двигаться от наименьших и наиболее независимых частей к самым большим (домену Emails).

### Фаза 3: Выделение домена Comments (`internal/features/comments`)
Выносим логику комментариев. Это относительно независимый модуль, который ссылается только на базовые функции аутентификации и базу данных.
- **Файлы к переносу:** `comment_handlers.go`, `comment_handlers_test.go`.
- **Изменения в типах:** Перенос `EmailComment`, `EmailCommentMessage` из `types.go` в `internal/features/comments/types.go`.
- **Обновление роутера:** Регистрация `RegisterCommentRoutes` из нового пакета в `main.go`.

### Фаза 4: Выделение домена AI Analysis (`internal/features/ai`)
Выносим всю интеграцию с OpenAI и обработку логов анализа.
- **Файлы к переносу:** `ai_handlers.go`, `ai_service.go`, `ai_prompt.go`, `ai_openai.go`, `ai_analysis_cache.go`, `ai_analysis_logs.go`, `email_ai_repository.go` (вместе с тестами).
- **Изменения в типах:** Перенос `EmailAnalysis`, `AIAnalysisResult`, `AIAnalysisMetrics` и `AIAnalysisLogItem` из `types.go`.
- **Зависимости:** Модуль AI работает поверх данных писем, но его эндпоинты (`/api/emails/{id}/ai-analysis*`) можно инкапсулировать.

### Фаза 5: Выделение системных утилит (`internal/core/system` или `internal/core/ops`)
Вынос метрик, health checks и операционных ивентов.
- **Файлы к переносу:** `health_handler.go`, `operational_events.go`, `text_helpers.go`.
- **Изменения:** Создание пакета для `operationalEventMiddleware` и `logOperationalEvent`, которые используются во всем приложении.

### Фаза 6: Выделение домена Emails (`internal/features/emails`)
Самый большой и сложный этап. После выноса `boards`, `auth`, `comments` и `ai`, домен `emails` останется с минимумом внешних зацеплений.
- **Файлы к переносу:** `email_handlers*.go`, `email_activity*.go`, `email_events.go`, `email_versions.go`, `email_area_approvals.go`, `email_sender.go`.
- **Изменения в типах:** Все оставшиеся модели в `types.go` (`EmailDetail`, `EmailListItem`, `EmailVersionDetail` и др.) переедут в пакет `emails`.
- **Итог:** Директория `cmd/server/` станет чистой и будет содержать только `main.go` (сборку всех модулей) и конфиг роутера.
