# Интеграции

Актуальные контракты внешних инструментов. Источник истины по составу инструментов — каталог OpenCode; этот файл фиксирует соглашения проекта.

## Состав

| Интеграция | Тип | Реализация | Доступ |
|---|---|---|---|
| Confluence | REST API v2 через plugin | `.opencode/plugins/confluence/index.ts` | read-only |
| Jira | MCP | `https://mcp.atlassian.com/v2/mcp` | read + create + link |
| Qase | официальный MCP | `@qase/mcp-server` 3.0.6 | read + create |
| Confluence/Qase (резерв) | MCP | `.opencode/mcp/qa-tools.mjs` | read + create |

Правила выбора пути:

1. Основной путь — штатный: REST API для Confluence, официальный MCP для Jira и Qase.
2. Резервный `qa-tools` используется только при ошибке или недоступности основного пути.
3. Перед обращением к `qa-tools` нужно спросить пользователя и указать, что сервер создан агентом.

## Секреты

Проект использует только штатные механизмы: подстановку в конфиге и чтение окружения с fallback на файл.

| Переменная | Назначение |
|---|---|
| `CONFLUENCE_URL` | базовый URL Confluence |
| `CONFLUENCE_EMAIL` | учётная запись Confluence |
| `CONFLUENCE_API_TOKEN` | API token Confluence |
| `QASE_API_TOKEN` | API token Qase |
| `QASE_URL` | необязательный override для `qa-tools`, по умолчанию `https://api.qase.io/v1` |
| `QA_SECRETS_FILE` | необязательный путь к файлу секретов Confluence |

### Файлы

| Файл | Что содержит | Кто читает |
|---|---|---|
| `~/.secrets/qa-agent.env` | `CONFLUENCE_*` в формате `KEY=VALUE` | Confluence plugin, `qa-tools` |
| `~/.secrets/qase-token` | только значение `QASE_API_TOKEN`, без перевода строки | официальный Qase MCP через `{file:...}` |

Оба файла лежат вне проекта. Доступ ограничен владельцем, `SYSTEM` и `Administrators`.

### Порядок чтения

| Интеграция | Механизм |
|---|---|
| Confluence | переменная окружения → `qa-agent.env` (код plugin) |
| `qa-tools` | переменная окружения → `qa-agent.env` |
| Qase (официальный MCP) | `environment.QASE_API_TOKEN = "{file:~/.secrets/qase-token}"` в `opencode.jsonc` |

Для Qase используется штатная подстановка OpenCode. Она читает файл целиком и не умеет «env, иначе файл», поэтому для Qase файл `qase-token` авторитетен, а переменная окружения не перекрывает его. Это осознанный компромисс в пользу стандартного механизма: без него понадобился бы собственный launcher.

Правила:

- Секреты не хранятся в репозитории, конфигурации, артефактах и отчётах.
- Значения токенов не выводятся в чат, логи и отчёты.
- Ротация не требует изменения кода.

### Ротация

| Интеграция | Действие |
|---|---|
| Confluence | обновить `qa-agent.env`; подхватывается без перезапуска |
| `qa-tools` | обновить `qa-agent.env`; подхватывается без перезапуска |
| Qase | обновить `qase-token`, затем `/reload` (файл читается при подключении MCP) |

Переменные окружения имеют приоритет для Confluence и `qa-tools`. Долгоживущий сервис OpenCode держит окружение, полученное при старте, поэтому изменение переменных требует полного перезапуска.

Где реализовано:

| Компонент | Чтение секретов |
|---|---|
| Confluence plugin | `secret()` в `.opencode/plugins/confluence/index.ts` |
| Резервный `qa-tools` | `secret()` в `.opencode/mcp/qa-tools.mjs` |
| Официальный Qase MCP | штатная подстановка `{file:~/.secrets/qase-token}` в `opencode.jsonc` |

Для Qase не используется собственный код: сервер запускается командой `npx -y -p @qase/mcp-server -p hono@4 qase-mcp-server`, токен подаётся через штатное поле `environment` конфигурации MCP.

## Confluence

Официальный Atlassian MCP этот site не обслуживает: `searchConfluence` возвращает `404`, `getConfluenceContent` — `Cloud id ... isn't explicitly granted`. Поэтому используется прямой REST API v2 через plugin.

### Инструменты

| Инструмент | Параметры | Результат |
|---|---|---|
| `confluence_get_page` | `pageId`, `bodyFormat` (`storage` / `view` / `atlas_doc_format`) | `page`: id, title, status, `contentStatus`, spaceId, parentId, version, createdAt, url, body |
| `confluence_get_children` | `pageId`, `limit`, `cursor` | список дочерних страниц |
| `confluence_get_comments` | `pageId`, `commentType` (`footer` / `inline` / `all`), `limit` | комментарии с телом и автором |
| `confluence_search` | `cql`, `limit`, `start` | результаты поиска: id, title, spaceKey, version, url |

Поле `contentStatus`:

| Ключ | Значение |
|---|---|
| `name` | название бейджа, например `Verified` |
| `id` | идентификатор состояния |
| `color` | цвет бейджа |
| `isSpaceState` | состояние задано на уровне пространства |
| `setBy` | accountId того, кто установил |
| `propertyVersion` | версия page property |

Бейдж читается из page property `content-state-published`. Список состояний пространства (`/rest/api/content-states`) не является надёжным источником: он может не содержать фактическое значение страницы.

### Правила

- Используй `bodyFormat: storage` по умолчанию.
- Метаданные источника: `pageId`, `title`, `page_version` (`version`), `source_status` (`contentStatus.name`), `url`.
- `status: current` означает только «опубликована» и подтверждением не является.
- Подтверждение — `contentStatus.name` ∈ {`Verified`, `approved`} без учёта регистра. Иное значение или отсутствие поля — `BLOCKED` либо `PARTIAL`.
- Не читай дочерние страницы и комментарии без необходимости.
- Инструменты не создают, не изменяют и не удаляют страницы.

## Jira

`cloudId`: `<ATLASSIAN_CLOUD_ID>` — узнаётся вызовом `jira_getAccessibleAtlassianResources`.

### Доступные проекты

| Key | Название | Типы задач |
|---|---|---|
| `KAN` | Мое пространство Kanban | Эпик, Subtask, Задача, История, Feature, Баг |
| `PPK` | PPK Практика | Subtask, Эпик, История, Баг, Задача |
| `UP` | UP Практика | Subtask, Эпик, История, Баг, Задача |

Проект — входные данные запуска, а не значение по умолчанию.

### Инструменты

| Инструмент | Назначение |
|---|---|
| `jira_searchJiraIssuesUsingJql` | поиск существующих задач по JQL |
| `jira_getJiraIssue` | чтение задачи |
| `jira_createJiraIssue` | создание задачи |
| `jira_executeRead` | `listJiraProjects`, `listJiraProjectIssueTypesMetadata`, `listJiraIssueLinkTypes`, `listJiraIssueRemoteIssueLinks` |
| `jira_executeWrite` | только `createJiraIssueLink` и `createJiraIssueRemoteIssueLink` |

### Ограничения

Запрещены: `jira_editJiraIssue`, `jira_transitionJiraIssue`, `jira_delete*`, `jira_executeDestructive`, а также любые операции, меняющие assignee, priority, sprint, estimates, fix version или статус.

`jira_executeWrite` технически шире, чем две операции связывания. Использовать его разрешено только для них.

### Маппинг design → Jira

| Jira Tasks Artifact | Jira |
|---|---|
| `TASK-001` | маркер `[agent-run:<run_id>:TASK-001]` в description |
| `Summary` | `summary` |
| `Description` | `description` |
| `Issue Type` (`Task` / `Epic` / `Sub-task`) | фактическое имя типа проекта |
| `Priority (design)` | не переносится в поле Priority |
| `Source Requirements` | ссылка в description |
| `Acceptance Criteria` | текст в description |

## Qase

Официальный `@qase/mcp-server` 3.0.6. Требует peer dependency `hono`, поэтому команда запуска включает его явно:

```text
npx -y -p @qase/mcp-server -p hono@4 qase-mcp-server
```

Без `-p hono@4` сервер падает с `ERR_MODULE_NOT_FOUND hono/ws`.

### Доступные проекты

| Code | Название |
|---|---|
| `DEMO` | Getting Started |
| `UP` | UP Практика |

Проект — входные данные запуска.

### Разрешённые инструменты

| Инструмент | Назначение |
|---|---|
| `qase_project_context` | дерево suites, milestones, environments, custom fields, users |
| `qase_get` | чтение одной сущности |
| `qql_search` / `qql_help` | поиск по QQL |
| `qase_suite_upsert` | создание suite (без `id`) |
| `qase_case_bulk_create` | создание кейсов (один кейс за вызов) |
| `qase_tool_help` / `qase_discover_tools` | документация |

### Запрещённые инструменты

`qase_*_delete`, `qase_case_upsert`, `qase_suite_delete`, `qase_run_*`, `qase_result_*`, `qase_plan_*`, `qase_milestone_*`, `qase_defect_*`, `qase_project_*`, `qase_review_*`, `qase_regression_run`, `qase_ci_report`, `qase_api`, `qase_attachment_*`, `qase_environment_*`, `qase_custom_field_*`, `qase_shared_step_delete`, `qase_triage_defect`, `qase_external_issue_link`.

`qase_case_upsert` запрещён, потому что при передаче `id` он изменяет существующий кейс.

### Маппинг design → Qase

| Test Model | Qase |
|---|---|
| `TC-001` | маркер `[agent-run:<run_id>:TC-001]` в description |
| `Title` | `title` |
| `Type` (`positive` / `negative` / `boundary` / `risk-based`) | текст в description |
| `Priority (design)` | `priority` (`HIGH` / `MEDIUM` / `LOW`) |
| `Source Requirement` | текст в description |
| `Jira Key` | текст в description |
| `Preconditions` | `preconditions` |
| `Steps / Test Intent` | `steps[].action` / `expected_result` |
| `Risk Reference` | текст в description |

## Резервный MCP `qa-tools`

`.opencode/mcp/qa-tools.mjs` — локальный stdio MCP-сервер, созданный агентом. Дублирует Confluence и Qase на случай недоступности штатных путей.

| Инструменты | Назначение |
|---|---|
| `qa_tools_confluence_get_page`, `_get_children`, `_get_comments`, `_search` | Confluence read-only |
| `qa_tools_qase_list_projects`, `_list_suites`, `_get_suite`, `_search_cases`, `_get_case` | Qase read |
| `qa_tools_qase_create_suite`, `_create_case` | Qase create |

Порядок использования:

1. Сначала штатный путь.
2. При ошибке — сообщить пользователю, что основной способ не сработал.
3. Спросить разрешение на резервный путь и явно указать, что `qa-tools` написан агентом.
4. Только после подтверждения вызывать `qa_tools_*`.

## Проверка доступности

Перед запуском workflow проверь:

1. `confluence_get_page` возвращает страницу с нужным `pageId`.
2. `jira_searchJiraIssuesUsingJql` возвращает результат.
3. `qase_project_context` возвращает дерево проекта.

Если интеграция недоступна, соответствующий этап получает `BLOCKED`; проектирование может продолжаться без внешней записи.
