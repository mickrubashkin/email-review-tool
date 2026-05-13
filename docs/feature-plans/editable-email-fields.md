# Редактируемые поля письма

## Цель
Добавить создание, редактирование и дублирование писем без HTML-редактора.

Админ редактирует только смысловые поля письма, извлечённые из HTML-шаблона. Сам шаблон остаётся неизменным, а финальный HTML для preview/export собирается из шаблона и сохранённых значений.

## Зачем так
- Не ломает текущий review/comment flow.
- Убирает сложность HTML-редактора.
- Упрощает дублирование и локализации.
- Сохраняет чистый экспорт HTML.

## Объём фичи
- Создать письмо из шаблона.
- Продублировать существующее письмо или версию.
- Редактировать только смысловые поля письма.
- Показывать preview собранного HTML.
- Экспортировать финальный HTML.

Не делаем сейчас:
- WYSIWYG HTML-редактор.
- Перетаскивание блоков.
- Rich text.
- Произвольные DOM-правки.

## Контракт шаблона
- Редактируемое поле = смысловая email content unit, а не техническая DOM-ячейка.
- Текстовые узлы помечаются `data-edit-text="hero_title"`, `intro_body`, `footer_legal` и т.д.
- Ссылки разделяются на текст и URL:
  - текст ссылки: `data-edit-text="partner_dashboard_link_text"`;
  - URL ссылки: `data-edit-attr-href="partner_dashboard_link_url"`.
- Изображения разделяются на source и alt:
  - `data-edit-attr-src="hero_banner_src"`;
  - `data-edit-attr-alt="hero_banner_alt"`.
- CTA описывается как логическое поле, потому что в email-вёрстке кнопка может состоять из обычного `<a>`, table markup и Outlook/VML fallback.
- CTA width можно задавать отдельным числовым полем через `data-edit-style-width-px="primary_cta_width_px"`.
- Для Outlook/VML fallback внутри conditional comments используются controlled template markers: `{{ primary_cta_text }}`, `{{ primary_cta_url }}`, `{{ primary_cta_width_px }}`.
- Review anchors остаются через `data-review-block`.
- Не размечаем каждую таблицу, строку или ячейку только ради редактирования.

Правило:
- `data-edit-*` задаёт логический ключ поля.
- Один field key должен иметь понятный бизнес-смысл: `hero_title`, `cta_primary`, `footer_legal`, а не `td_17_text`.
- Поддерживается только небольшой явный allowlist типов полей: `text`, `textarea`, `url`, `image`, `cta`.
- Subject и preheader остаются отдельными email metadata columns, но редактируются в той же admin form рядом с template fields.

Пример разметки ссылки:
```html
<a
  href="https://example.com/private/"
  data-edit-text="partner_dashboard_link_text"
  data-edit-attr-href="partner_dashboard_link_url"
>
  Partner Dashboard
</a>
```

Пример разметки баннера:
```html
<img
  src="https://example.com/banner-en.png"
  alt="Partner program dashboard"
  data-edit-attr-src="hero_banner_src"
  data-edit-attr-alt="hero_banner_alt"
>
```

Пример CTA с Outlook/VML fallback:
```html
<!--[if mso]>
  <v:roundrect href="{{ primary_cta_url }}" style="height:43px;width:{{ primary_cta_width_px }}px;">
    <center>{{ primary_cta_text }}</center>
  </v:roundrect>
<![endif]-->

<a
  href="https://example.com/onboarding"
  data-edit-text="primary_cta_text"
  data-edit-attr-href="primary_cta_url"
  data-edit-style-width-px="primary_cta_width_px"
  style="width: 196px;"
>
  Start onboarding
</a>
```

## Модель данных
Рекомендуемый MVP-формат:
- `emails.template_html`
- `emails.editable_fields JSONB`
- `emails.template_version` или `template_hash`

Пример значений:
```json
{
  "headline": { "type": "text", "value": "Новое предложение" },
  "intro_body": { "type": "textarea", "value": "Короткий вводный текст письма." },
  "partner_dashboard_link_text": { "type": "text", "value": "Partner Dashboard" },
  "partner_dashboard_link_url": { "type": "url", "value": "https://example.com/private/" },
  "hero_banner": {
    "type": "image",
    "src": "https://example.com/banner-en.png",
    "alt": "Partner program dashboard"
  },
  "cta_primary": {
    "type": "cta",
    "text": "Start onboarding",
    "url": "https://example.com/onboarding",
    "width_px": 196
  }
}
```

Subject/preheader хранятся отдельно:
```json
{
  "subject": "Bitrix24 Partner Program | Application Approved",
  "preheader": "Your application has been approved. Start onboarding now."
}
```

## Рендер
Пайплайн:
1. Загрузить HTML-шаблон.
2. Загрузить сохранённые значения полей.
3. Структурно распарсить HTML.
4. Подставить текст как текст, а не HTML.
5. Подставить URL только в разрешённые атрибуты.
6. Для CTA проставить text/url во все связанные HTML/VML места.
7. Отдать собранный HTML для preview/export.

Безопасность:
- Экранировать весь текст.
- Отклонять небезопасные URL.
- Разрешать только явный список протоколов, минимум `http` и `https`.
- Не разрешать редактирование произвольных атрибутов.
- Не подставлять пользовательские значения через `innerHTML`.

## UX flow
### Создание
- Админ выбирает шаблон или дублирует существующее письмо.
- Система извлекает editable fields из HTML.
- Админ заполняет значения.
- Сохранение создаёт новый email record только со значениями.

### Дублирование
- Копируются reference на шаблон и текущие values.
- Админ может поменять значения до сохранения.
- Явно сохраняются version/language metadata.

### Редактирование
- Показывается форма для metadata, text, textarea, URL, image и CTA полей.
- Preview обновляется после save/refetch.
- Сохраняются только field values и metadata.

## План внедрения
### Статус на сейчас
- [x] Добавлено хранение `template_html`, `editable_fields`, `template_hash`, `template_version`.
- [x] Зафиксирован контракт `data-edit-text`, `data-edit-attr-*`, `data-edit-style-width-px`.
- [x] Вынесены backend helpers для extraction/render.
- [x] Добавлен backend render финального HTML из template + editable fields.
- [x] Добавлен API редактирования metadata и editable fields.
- [x] Добавлен API дублирования письма с копированием field values.
- [x] Добавлен API архивации письма.
- [x] Добавлен UI редактора `/emails/{id}/edit`.
- [x] Добавлен rendered preview и rendered HTML copy/download.
- [x] Добавлены email events для update/duplicate/archive.
- [x] Добавлены backend-тесты на update, render, URL validation, duplicate, archive.
- [x] Обновлён README под наличие email editing.

### Следующий блок
- [ ] Починить `TestAllEnglishSeedTemplatesExtractAndRender`: сейчас `readRepoGlob` не находит `db/seeds/emails/**/**/en.html`.
- [ ] Проверить и дозаполнить `data-edit-*` разметку во всех English seed templates.
- [ ] После разметки прогнать `cd apps/api && go test ./...`.
- [ ] Прогнать `make db-sync-meta` и `make db-seed` на актуальных шаблонах.
- [ ] Проверить редактор `/emails/{id}/edit` на нескольких письмах из разных stages.
- [ ] Проверить, что rendered export использует новые значения, а original HTML остаётся неизменным.
- [ ] Проверить review/comment flow после изменения editable fields.

### Оставшиеся фичи
- [ ] Добавить создание нового письма из шаблона, сейчас есть дублирование существующего письма.
- [ ] Добавить явную обработку template drift: изменился template, но saved fields старые или неполные.
- [ ] Решить, нужны ли протоколы кроме `http`/`https` для URL-полей.
- [ ] Решить storage для изображений: внешний URL в MVP или отдельный media store.
- [ ] Расширить frontend-тесты/ручные сценарии для editor, duplicate, archive и rendered export.

## Основные риски
- Комментарии могут съехать при изменении текста.
- Изменение шаблона может сломать mapping полей.
- Сложная вложенная HTML-структура может сделать replacement хрупким.
- CTA для Outlook/VML может требовать обновления нескольких мест одним логическим полем.
- URL validation должна быть строгой.

## Вопросы
- Нужна ли миграция шаблонов для старых писем?
- При дублировании сохранять ту же версию шаблона или привязываться к новой?
- Какие URL-протоколы кроме `http` и `https` разрешаем?
- Как хранить asset references для изображений: внешний URL в MVP или отдельный upload/media store позже?

## Критерии готовности
- [ ] Админ может создать письмо из шаблона.
- [x] Админ может продублировать письмо.
- [x] Админ может редактировать только смысловые поля письма и metadata.
- [x] Текст ссылки и URL ссылки редактируются отдельно.
- [x] CTA text/url обновляют все связанные места в HTML/VML через editable fields и template markers.
- [x] Экспортированный HTML использует сохранённые значения.
- [x] Оригинальный HTML-шаблон остаётся неизменным.
- [x] Все English seed templates покрыты `data-edit-*` разметкой.
- [ ] Текущий review/comment flow проверен после правок editable fields.
