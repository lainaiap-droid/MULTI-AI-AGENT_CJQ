# QA-мультиагент 1.5.0

Мультиагентная система для QA-процесса по циклу **Confluence → Jira → Qase**: читает требования, делает ревью, проектирует задачи Jira и тестовую модель, проверяет Quality Gates и создаёт сущности во внешних системах.

## Архитектура

| Агент | Режим | Роль | Skill |
|---|---|---|---|
| `qa-lead` | primary | Оркестратор, единственный владелец внешних записей | — |
| `requirement-reviewer` | subagent | Ревью требований | `requirement-review` |
| `task-designer` | subagent | Проектирование Jira-задач | `task-design` |
| `test-designer` | subagent | Проектирование тестовой модели | `test-design` |

Только `qa-lead` общается с пользователем и вызывает Confluence, Jira и Qase. Дочерние агенты работают исключительно с файлами артефактов и не имеют доступа к shell, сети и внешним инструментам.

Отдельно от агентов работает слой `evals` — измерение качества артефактов. Он не входит в архитектуру «1 + 3» и не заменяет Quality Gates.

## Структура

```text
.opencode/
├── AGENTS.md                  # общие правила для всех агентов
├── opencode.jsonc             # конфигурация MCP и default_agent
├── agents/                    # qa-lead + три subagent
├── skills/                    # процедуры этапов, шаблоны и skill evals
├── references/integrations.md # контракты инструментов и схема секретов
├── plugins/confluence/        # Confluence REST API v2, read-only
├── mcp/qa-tools.mjs           # резервный MCP (по подтверждению)
├── evals/                     # детерминированные проверки и LLM-judge
├── artifacts/                 # шаблоны и результаты запусков
└── legacy-v1/                 # tools из V1, не регистрируются в V2
```

## Подготовка окружения

### 1. Confluence

Файл `~/.secrets/qa-agent.env` со строками `KEY=VALUE`:

```text
CONFLUENCE_URL=https://<your-site>.atlassian.net
CONFLUENCE_EMAIL=<your-email>
CONFLUENCE_API_TOKEN=<token>
```

Переменные окружения имеют приоритет над файлом. Путь к файлу можно изменить через `QA_SECRETS_FILE`.

### 2. Qase

Файл `~/.secrets/qase-token`, содержащий только значение токена. Подключается штатной подстановкой `{file:~/.secrets/qase-token}` в `opencode.jsonc`.

### 3. Jira

Atlassian MCP доступен с любой машины; `cloudId` в репозитории не хранится. Агент получает его за запуск через `jira_getAccessibleAtlassianResources`.

Ограничьте доступ к файлам секретов:

```powershell
icacls "$env:USERPROFILE\.secrets" /inheritance:r /grant:r "$env:USERNAME:(OI)(CI)F"
```

## Запуск

1. Откройте проект в OpenCode — `default_agent` уже `qa-lead`.
2. Передайте ссылку на страницу Confluence, проекты Jira и Qase, ограничения запуска.
3. Требования должны иметь Content status `Verified` или `approved`; иначе этап получит `BLOCKED` или `PARTIAL`.

## Артефакты

Каждый запуск пишет в `.opencode/artifacts/<run_id>/`: `run-manifest.json`, `source.md`, `requirement-review.v1.md`, `jira-tasks.v1.md`, `test-model.v1.md`, `created-entities.json`, `coverage-map.md`, `final-report.md`. Подробности — в `.opencode/artifacts/README.md`.

Каталоги запусков не попадают в git: они содержат текст требований заказчика.

## Evals

Слой оценки качества артефактов: детерминированные проверки трассировки, покрытия, структуры и гигиены плюс опциональный LLM-judge по рубрике. Зависимостей нет.

```bash
node .opencode/evals/run-evals.mjs --selftest   # мутационная проверка самих проверок
node .opencode/evals/run-evals.mjs              # прогон публичных кейсов
node .opencode/evals/run-evals.mjs --case SYN-SORT-001 --verbose
```

Публичный набор содержит синтетические кейсы; реальные страницы Confluence ведутся в `evals/cases/private/` и не публикуются. Подробности — в [`.opencode/evals/README.md`](.opencode/evals/README.md) и skill `evals`.

## Безопасность

- Секреты не хранятся в коде и конфигурации проекта — только в env или `~/.secrets/`.
- Артефакты запусков, черновики и локальные переопределения исключены через `.gitignore`.
- Запрещены изменение и удаление существующих сущностей Jira и Qase, запуск Test Runs, изменение статусов задач.

## Документация

- [`MULTIAGENT_PLAN.md`](MULTIAGENT_PLAN.md) — план внедрения и зафиксированные решения.
- [`CHANGELOG.md`](CHANGELOG.md) — история версий.
