# TODO

## Nice to have
- [ ] Контроль расхода токенов пользователем, алерт админу (почта? тг-бот?)
- [ ] Админ может дублировать письмо, создавать событие, добавлять письмо
- [ ] Добавить в board view ИИ анализ всей цепочки в целом, предложения и обсуждение идей по оптимизации (рендер в drawer, в виде классического чата. возможность сохранять или выгружать артефакты?)

- [ ] Добавить возможность переключения между досками, создание новой доски
- [ ] Добавление админом письма, события, стадии, доски.
- [ ] Добавить workspaces / команды (например - Bitrix24 Partners, Golova, Bitrix24 Marketing, etc)

- [ ] Добавить docs/openapi.yaml

## Next product backlog
- [v] Track AI cache hits and misses
- [v] Add email-based authorization
- [v] Support allowlist by email domain or exact email address
- [ ] Define permissions matrix for admin and user roles
- [v] Add a dedicated email review view
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
