# Артефакты запусков

## Назначение

Каталог хранит все структурированные результаты работы мультиагента. Артефакт — единственный надёжный способ передачи результата между этапами; история чата для этого не используется.

## Расположение

```text
.opencode/artifacts/
├── README.md
├── _templates/                  # шаблоны, только чтение
└── <run-id>/
    ├── run-manifest.json
    ├── source.md
    ├── requirement-review.v1.md
    ├── jira-tasks.v1.md
    ├── test-model.v1.md
    ├── created-entities.json
    ├── coverage-map.md
    └── final-report.md
```

## Идентификатор запуска

`run_id` формируется как `RUN-YYYYMMDD-HHMMSS` и уникален для каждого запуска. Повторное использование `run_id` запрещено.

## Именование и версии

- Первая версия артефакта: `.v1.md`.
- Доработка: `.v2.md`, `.v3.md`.
- Старые версии не удаляются и не перезаписываются.
- В frontmatter каждой версии указывается её номер.
- Максимум две доработки на этап, затем эскалация.

## Обязательный frontmatter

| Поле | Обязательно | Значение |
|---|---|---|
| `artifact` | да | Тип артефакта |
| `version` | да | Номер версии |
| `run_id` | да | Идентификатор запуска |
| `status` | да | `READY`, `PARTIAL`, `BLOCKED` |
| `generated_by` | да | Агент-producer |
| `source` | да | Исходный артефакт или источник |

Правило действует для Markdown-артефактов. JSON-реестры `run-manifest.json` и `created-entities.json` используют собственные схемы, описанные ниже.

## Владельцы артефактов

| Артефакт | Producer | Consumer | Шаблон |
|---|---|---|---|
| `source.md` | `qa-lead` | `requirement-reviewer` | `_templates/source.md` |
| `requirement-review.v*.md` | `requirement-reviewer` | `task-designer`, `test-designer` | `skills/requirement-review/templates/requirement-review.md` |
| `jira-tasks.v*.md` | `task-designer` | `qa-lead` | `skills/task-design/templates/jira-tasks.md` |
| `test-model.v*.md` | `test-designer` | `qa-lead` | `skills/test-design/templates/test-model.md` |
| `run-manifest.json` | `qa-lead` | `qa-lead` | `_templates/run-manifest.json` |
| `created-entities.json` | `qa-lead` | `qa-lead`, `test-designer` | `_templates/created-entities.json` |
| `coverage-map.md` | `qa-lead` | `qa-lead`, пользователь | `_templates/coverage-map.md` |
| `final-report.md` | `qa-lead` | пользователь | `_templates/final-report.md` |

Один артефакт — один writer. Дочерние агенты не изменяют чужие артефакты.

## Жизненный цикл

| Статус | Значение |
|---|---|
| `READY` | Артефакт полный и прошёл Gate |
| `PARTIAL` | Артефакт пригоден частично; ограничения явно указаны |
| `BLOCKED` | Артефакт невозможно надёжно сформировать |

`READY` не означает, что внешние сущности созданы. Это фиксируется отдельно в `created-entities.json` и `run-manifest.json`.

## Run Manifest

`run-manifest.json` — журнал запуска. Обязательные поля:

| Поле | Значение |
|---|---|
| `run_id` | Идентификатор запуска |
| `started_at` | Время старта, ISO-8601 |
| `finished_at` | Время завершения или `null` |
| `inputs` | Входные параметры: Confluence, Jira, Qase, ограничения |
| `stages[]` | История этапов |
| `external_tools` | Доступность Confluence, Jira, Qase |
| `run_status` | `IN_PROGRESS` во время запуска; итоговый — `SUCCESS`, `PARTIAL`, `FAILED`, `REQUIRES_HUMAN_DECISION` |

Элемент `stages[]`:

| Поле | Значение |
|---|---|
| `stage` | Имя этапа |
| `agent` | Кто выполнял |
| `attempt` | Номер попытки |
| `artifact` | Путь к артефакту |
| `artifact_status` | `READY`, `PARTIAL`, `BLOCKED` |
| `gate` | `PASS`, `FAIL`, `BLOCKED` |
| `evidence` | Краткое обоснование результата |

## Created Entities

`created-entities.json` ведётся append-only. Уже сохранённые идентификаторы не перезаписываются.

### Jira

| Поле | Значение |
|---|---|
| `local_id` | `TASK-001` и т.п. |
| `key` | Фактический Jira key |
| `url` | Ссылка на задачу |
| `status` | `CREATED`, `SKIPPED`, `LINKED`, `FAILED` |
| `duplicate_decision` | `NONE`, `LINKED`, `SKIPPED`, `ESCALATED` |

### Qase

| Поле | Значение |
|---|---|
| `local_id` | `TC-001` и т.п. |
| `id` | Фактический Qase ID |
| `suite_id` | ID suite |
| `url` | Ссылка на тест-кейс, если доступна |
| `status` | `CREATED`, `FAILED` |

## Coverage Map

`coverage-map.md` связывает требования, задачи и тесты.

| Колонка | Значение |
|---|---|
| Functional Point | Функциональная точка |
| REQ IDs | Связанные требования |
| Jira Key | Фактический ключ задачи |
| Qase Case IDs | Фактические ID тест-кейсов |
| Coverage Status | `COVERED`, `PARTIAL`, `GAP` |
| Gaps | Что не покрыто и почему |

## Final Report

`final-report.md` содержит:

- статус запуска;
- ссылку на источник;
- созданные Jira-задачи;
- созданные Qase-сущности;
- Coverage Map;
- неоднозначности и конфликты;
- блокировки и ошибки;
- частично выполненные операции;
- вопросы, требующие решения человека.

## Handoff

Дочерний агент возвращает только короткий header:

```yaml
status: READY | PARTIAL | BLOCKED
artifact: <path>
summary: "<3–7 строк>"
key_findings: [...]
blockers: [...]
questions_for_human: [...]
```

Полный текст артефакта в ответ не включается.

## Шаблоны

Шаблоны находятся в `_templates/` и в каталогах skills. Они доступны только для чтения. Заполняй шаблон, не изменяя его структуру без согласования.

## Правила

- Не сохраняй секреты, токены, пароли и PII.
- Каждый существенный вывод имеет source reference.
- Артефакт должен быть воспроизводим.
- Не удаляй артефакты автоматически.
- Не изменяй `_templates/` в рамках рабочего запуска.
- Не передавай следующему этапу полную историю работы, если достаточно проверенного артефакта.

## Retention

Артефакты хранятся до явного решения человека. Автоматическое удаление запрещено. Если требуется очистка, она выполняется отдельно и только с подтверждением.
