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
### Фаза 1: контракт и модель данных
- Определить поддерживаемые типы полей.
- Добавить хранение field values в БД.
- Добавить template version/hash.
- Зафиксировать контракт `data-edit-text`, `data-edit-attr-*` и логического `cta` field.
- Вынести extraction/render helpers на backend.

### Фаза 2: создание и дублирование
- Добавить API для create/duplicate.
- Извлекать default values из HTML-шаблона.
- Копировать field values при дублировании.
- Не ломать текущий review flow.

### Фаза 3: UI редактирования
- Сделать форму для editable fields.
- Поддержать text input, textarea, URL input, image fields и CTA fields.
- Показать subject/preheader в той же форме как metadata.
- Добавить preview панели.

### Фаза 4: preview/export
- Рендерить финальный HTML из сохранённых значений.
- Использовать этот же рендер для preview.
- Не загрязнять export служебной разметкой.

### Фаза 5: hardening
- Добавить тесты на extraction, rendering, URL validation и duplication.
- Добавить обработку template drift.
- Проверить, что комментарии и review anchors продолжают работать.

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
- Админ может создать письмо из шаблона.
- Админ может продублировать письмо.
- Админ может редактировать только смысловые поля письма и metadata.
- Текст ссылки и URL ссылки редактируются отдельно.
- CTA text/url обновляют все связанные места в HTML/VML.
- Экспортированный HTML использует сохранённые значения.
- Оригинальный HTML-шаблон остаётся неизменным.
- Текущий review/comment flow продолжает работать.
