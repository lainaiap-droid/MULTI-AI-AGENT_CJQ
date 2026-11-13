# План внедрения мультиагента 1+3

**Проект:** AI_AGENT_1.4
**Дата:** 2026-11-12
**Статус:** этапы 1–6 выполнены; пилотный запуск пройден (12 задач в Jira, 37 кейсов в Qase); версия 1.5.0 добавила слой evals для оценки качества артефактов

---

## 1. Зафиксированные решения

| Вопрос | Решение |
|---|---|
| Кто читает Confluence | Только `qa-lead`. Дочерние агенты получают уже сохранённый `source.md`. |
| Порядок этапов | Последовательно: Requirement Review → Jira Tasks → создание Jira → Test Model → создание Qase. |
| Транспорт артефактов | Файлы в `.opencode/artifacts/<run-id>/` + короткий header в ответе subagent. |
| Jira и Qase | Доступы подключаются позже. Интерфейсы проектируются сейчас, реализация — отдельным этапом. |
| Следующий артефакт | Этот план внедрения. |

### Принципы архитектуры

- `qa-lead` — единственный агент, который общается с пользователем и выполняет внешние записи.
- Дочерние агенты не имеют доступа к Jira, Qase, shell, сети и не задают вопросы пользователю.
- Каждый дочерний агент владеет только своим артефактом и только своей skill.
- Передача результата — через файл, а не через полный текст в контексте.
- Все выводы трассируются к source reference.
- До подключения Jira/Qase запуск может дойти до этапов записи, но финальный статус будет `BLOCKED`, а не `SUCCESS`.

---

## 2. Целевая структура

```text
.opencode/
├── AGENTS.md                     # общие правила для всех агентов (сокращённый)
├── opencode.jsonc                # default_agent, глобальные permissions
├── agents/
│   ├── qa-lead.md                # primary
│   ├── requirement-reviewer.md   # subagent
│   ├── task-designer.md          # subagent
│   └── test-designer.md          # subagent
├── skills/
│   ├── requirement-review/SKILL.md
│   ├── task-design/SKILL.md
│   └── test-design/SKILL.md
├── plugins/
│   └── confluence/index.ts       # REST API v2, read-only
├── mcp/
│   └── qa-tools.mjs              # резервный MCP: Confluence + Qase
├── references/
│   └── integrations.md           # контракты инструментов и доступные проекты
├── legacy-v1/
│   └── tools/                    # неактуальные custom tools V1
└── artifacts/
    ├── README.md                 # naming, версии, retention
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

---

## 3. Спецификация агентов

### 3.1. `qa-lead` (primary)

**Роль:** оркестратор, валидатор Quality Gates, владелец внешних записей и итогового отчёта.

**Делает:**
1. Проверяет входные данные и наличие Jira/Qase проектов.
2. Читает Confluence, сохраняет `source.md` с метаданными источника.
3. Создаёт `run-manifest.json`.
4. Делегирует этап `requirement-reviewer`.
5. Проверяет Requirement Review Gate.
6. Делегирует этап `task-designer`.
7. Проверяет Task Design Gate.
8. Ищет дубликаты в Jira по summary/модулю.
9. Создаёт задачи в Jira, ведёт `created-entities.json`.
10. Делегирует этап `test-designer`, передавая RR и карту Jira keys.
11. Проверяет Test Design Gate.
12. Ищет дубликаты в Qase.
13. Создаёт suites/cases в Qase, дополняет `created-entities.json`.
14. Формирует `coverage-map.md` и `final-report.md`.
15. Возвращает пользователю итоговый статус.

**Не делает:**
- не выполняет stage-work самостоятельно;
- не создаёт артефакты RR/Tasks/Test Model вместо детей;
- не принимает бизнес-решений;
- не изменяет и не удаляет существующие сущности Jira/Qase.

**Permissions:**
- Confluence tool — allow;
- Jira/Qase tools — allow после подключения;
- `read`/`edit` на `.opencode/artifacts/**` — allow;
- `read` на `.opencode/skills/**` — allow только для проверки Completion Criteria;
- `skill` — deny (чтобы не выполнял stage-work);
- `subagent` — deny all, allow только `requirement-reviewer`, `task-designer`, `test-designer`;
- `shell`, `webfetch` — deny (или ask, если понадобится диагностика).

**Файл:** `.opencode/agents/qa-lead.md`
**Mode:** `primary`
**Model:** наследуется от родительской сессии.
**Steps:** 50–60.

### 3.2. `requirement-reviewer` (subagent)

**Роль:** выполнить Skill `requirement-review` и сформировать Requirement Review Artifact.

**Вход:** путь к `source.md`, scope, ограничения запуска.
**Выход:** `requirement-review.v<n>.md` + header со статусом.
**Не делает:** не читает Confluence, не вызывает Jira/Qase, не задаёт вопросы пользователю, не проектирует тест-сценарии.

**Permissions:**
- `read`/`edit` на `.opencode/artifacts/**` — allow;
- `skill` — allow только `requirement-review`;
- всё остальное — deny.

**Файл:** `.opencode/agents/requirement-reviewer.md`
**Mode:** `subagent`
**Steps:** 25–30.

### 3.3. `task-designer` (subagent)

**Роль:** выполнить Skill `task-design` и сформировать Jira Tasks Artifact.

**Вход:** путь к валидному RR, scope, проектные правила декомпозиции, опционально — кандидаты в дубликаты.
**Выход:** `jira-tasks.v<n>.md` + header.
**Не делает:** не создаёт задачи в Jira, не выбирает проект/assignee/sprint, не задаёт вопросы пользователю.

**Permissions:** как у `requirement-reviewer`, skill только `task-design`.
**Mode:** `subagent`
**Steps:** 25–30.

### 3.4. `test-designer` (subagent)

**Роль:** выполнить Skill `test-design` и сформировать Test Model Artifact.

**Вход:** путь к валидному RR, опционально — подтверждённые Jira keys, ограничения тестирования.
**Выход:** `test-model.v<n>.md` + header.
**Не делает:** не создаёт тест-кейсы в Qase, не запускает тесты, не задаёт вопросы пользователю.

**Permissions:** как у `requirement-reviewer`, skill только `test-design`.
**Mode:** `subagent`
**Steps:** 30.

### 3.5. Пример frontmatter

```yaml
---
description: Выполняет ревью требований и формирует Requirement Review Artifact
mode: subagent
steps: 30
permissions:
  - action: "*"
    resource: "*"
    effect: deny
  - action: read
    resource: ".opencode/artifacts/**"
    effect: allow
  - action: edit
    resource: ".opencode/artifacts/**"
    effect: allow
  - action: skill
    resource: "requirement-review"
    effect: allow
---
```

> Точные имена действий для custom tools (`confluence`, `jira`, `qase`) проверить после их регистрации в OpenCode.

---

## 4. Разделение `AGENTS.md`

Сейчас `AGENTS.md` — 39 КБ и он попадает в контекст **всех** агентов, включая дочерних. Это создаёт конфликт ролей и лишний контекст.

### Оставить в `.opencode/AGENTS.md` (общее, ~100–150 строк)

- глоссарий терминов: Requirement, Artifact, Skill, Tool, Gate, Source of Truth;
- Source of Truth и правила конфликта источников;
- глобальные Constraints и запреты;
- правила безопасности и работа с секретами;
- общие Tool Usage Rules;
- принципы артефактов: воспроизводимость, версии, отсутствие секретов;
- словари статусов;
- общие правила эскалации.

### Перенести в `.opencode/agents/qa-lead.md`

- Role / Responsibility / Scope / In-Scope / Out-of-Scope;
- полный Workflow;
- Context Management оркестратора;
- delegation matrix и протокол handoff;
- duplicate handling;
- idempotency и retry policy;
- Quality Gates и порядок их проверки;
- Failure Behaviour;
- Escalation Rules;
- Output и Completion Criteria запуска.

### Перенести в skills

- stage-specific Context Management;
- Procedure;
- Rules;
- Reasoning Patterns;
- Output и Completion Criteria этапа.

### Удалить или определить

- `Report Builder` — сейчас пустой раздел;
- дублирующие описания skills в AGENTS.md;
- неиспользуемые термины `Test Map` / `Coverage Map` без определения.

---

## 5. Доработка skills

### Общие изменения для всех трёх

Добавить разделы:

1. **Entry Criteria** — проверка входа; если не выполнено → `BLOCKED`.
2. **Non-Goals** — что skill явно не делает.
3. **Artifact Template** — обязательные секции и поля.
4. **Handoff Contract** — что вернуть `qa-lead`.
5. **ID Conventions** — какие ID использовать.
6. **Source References** — обязательны для каждого существенного вывода.
7. **Status** — `READY | PARTIAL | BLOCKED`.
8. Правило: **не общаться с пользователем**, вопросы возвращать main-агенту.

### `requirement-review`

- Добавить запрет: не проектировать тестовые сценарии, шаги, тестовые данные.
- Разделить уровни: RR фиксирует поведение и риски, test-design превращает их в сценарии.
- Требовать метаданные источника: page ID, title, version, status, URL, retrieved_at.
- Уточнить работу с draft/in review: можно читать как контекст, но нельзя включать в подтверждённые Requirements; помечать `UNCONFIRMED`.
- Запретить Assumptions: всё неизвестное → `Missing Information` / `Open Questions`.

### `task-design`

- Добавить правила выбора Issue Type: Epic / Task / Sub-task.
- Явно разрешить **форматирование** существующих AC в Given/When/Then, но запретить добавление новых условий.
- Разделить `Priority (design)` и `Jira Priority field`: второе не заполняется без разрешения.
- Добавить маппинг `TASK-001 → Jira key` после создания.
- Добавить формат Traceability: `TASK → REQ/BR/AC`.

### `test-design`

- Добавить опциональный вход: подтверждённые Jira keys.
- Добавить маппинг полей Test Model → поля Qase: suite, title, steps, expected result, priority, description marker.
- Разделить `Priority (design)` и `Qase Priority field`.
- Явно маркировать `risk-based` сценарии.
- Запретить шаги, которые невозможно проверить по RR.

---

## 6. Шаблоны артефактов

### 6.1. `source.md`

```markdown
---
artifact: source
run_id: RUN-...
source_type: confluence
page_id: "..."
title: "..."
version: 12
status: approved
url: "..."
retrieved_at: "..."
---

# Source

<нормализованный текст требований>
```

### 6.2. `requirement-review.v1.md`

```markdown
---
artifact: requirement-review
version: 1
run_id: RUN-...
status: READY | PARTIAL | BLOCKED
generated_by: requirement-reviewer
source: source.md
---

# Requirement Review

## Scope

## Source References
| SRC ID | Page ID | Version | Status | URL |

## Requirements
| REQ ID | Requirement | Source | Notes |

## Business Rules
| BR ID | Rule | Source |

## Acceptance Criteria
| AC ID | Criterion | Source |

## Validation Rules
## Dependencies

## Ambiguities
| AMB ID | Description | Options | Source |

## Missing Information
## Conflicts

## Positive Flows
## Negative Flows
## Boundaries

## Risks
| RISK ID | Risk | Impact | Source |

## Open Questions
| OQ ID | Question | Why it matters | Owner |

## Traceability
REQ → BR/AC
```

### 6.3. `jira-tasks.v1.md`

```markdown
---
artifact: jira-tasks
version: 1
run_id: RUN-...
status: READY | PARTIAL | BLOCKED
generated_by: task-designer
source: requirement-review.v1.md
---

# Jira Tasks

## Tasks

### TASK-001
- **Summary:**
- **Issue Type:**
- **Description:**
- **Source Requirements:**
- **Acceptance Criteria:**
- **Dependencies:**
- **Priority (design):**
- **Traceability:**

## Coverage
| REQ ID | TASK ID | Covered |
```

### 6.4. `test-model.v1.md`

```markdown
---
artifact: test-model
version: 1
run_id: RUN-...
status: READY | PARTIAL | BLOCKED
generated_by: test-designer
source: requirement-review.v1.md
jira_map: created-entities.json
---

# Test Model

## Scenarios

### TC-001
- **Title:**
- **Type:** positive | negative | boundary | risk-based
- **Priority (design):** HIGH | MEDIUM | LOW
- **Source Requirement:**
- **Jira Key:**
- **Preconditions:**
- **Steps / Test Intent:**
- **Expected Result:**
- **Risk Reference:**

## Coverage
| REQ ID | TC ID | Covered |
```

### 6.5. `run-manifest.json`

```json
{
  "run_id": "RUN-20261112-001",
  "started_at": "2026-11-12T10:00:00Z",
  "inputs": {
    "confluence_page_id": "...",
    "jira_project": "...",
    "qase_project": "..."
  },
  "stages": [
    {
      "stage": "requirement-review",
      "attempt": 1,
      "artifact": "requirement-review.v1.md",
      "artifact_status": "READY",
      "gate": "PASS"
    }
  ],
  "run_status": "SUCCESS | PARTIAL | FAILED | REQUIRES_HUMAN_DECISION"
}
```

### 6.6. `created-entities.json`

```json
{
  "jira": [
    {
      "local_id": "TASK-001",
      "key": "ABC-123",
      "url": "...",
      "status": "CREATED",
      "duplicate_decision": "NONE | LINKED | SKIPPED"
    }
  ],
  "qase": [
    {
      "local_id": "TC-001",
      "id": 123,
      "suite_id": 45,
      "status": "CREATED"
    }
  ]
}
```

### 6.7. `coverage-map.md`

| Functional Point | REQ IDs | Jira Key | Qase Case IDs | Coverage Status | Gaps |
|---|---|---|---|---|---|

### 6.8. `final-report.md`

```markdown
# Final Report

- **Run ID:**
- **Status:** SUCCESS | PARTIAL | FAILED | REQUIRES_HUMAN_DECISION

## Source
## Created Jira Issues
## Created Qase Entities
## Coverage Map
## Ambiguities and Conflicts
## Blockers and Errors
## Partial Operations
## Human Decisions Required
```

---

## 7. Протокол делегирования

### 7.1. Main → subagent

```yaml
run_id: RUN-20261112-001
stage: requirement-review
source_artifact: .opencode/artifacts/RUN-20261112-001/source.md
scope: "<границы функциональности>"
constraints: "<явные ограничения>"
expected_output: .opencode/artifacts/RUN-20261112-001/requirement-review.v1.md
previous_artifact: null
```

### 7.2. Subagent → main

```yaml
status: READY | PARTIAL | BLOCKED
artifact: .opencode/artifacts/.../requirement-review.v1.md
summary: "<3–7 строк>"
key_findings:
  - "..."
blockers: []
questions_for_human: []
```

### 7.3. Правила

1. Subagent не задаёт вопросы пользователю — только возвращает их в `questions_for_human`.
2. `qa-lead` проверяет Gate по Completion Criteria.
3. При исправимых недостатках — максимум 2 цикла доработки.
4. После 2 циклов → `REQUIRES_HUMAN_DECISION`.
5. При `BLOCKED` — `qa-lead` либо перезапускает предыдущий этап с версией `v2`, либо эскалирует.
6. Артефакт всегда передаётся путём, а не полным текстом.
7. Subagent не имеет права изменять чужие артефакты.

---

## 8. Идемпотентность и дубликаты

### 8.1. Маркер запуска

- Jira: label `qa-agent:<run_id>` + маркер в description `[agent-run:<run_id>:<TASK-ID>]`.
- Qase: маркер в description `[agent-run:<run_id>:<TC-ID>]`.

### 8.2. При timeout записи

1. Не повторять создание сразу.
2. Выполнить поиск по маркеру запуска.
3. Если сущность найдена — считать созданной и сохранить ID.
4. Если не найдена — один осмысленный retry.
5. Если результат неопределён — `FAILED` / `REQUIRES_HUMAN_DECISION`.

### 8.3. Решение по дубликатам

| Ситуация | Действие |
|---|---|
| Точный дубликат | Не создавать, связать с существующим, зафиксировать `SKIPPED/LINKED` |
| Частичное совпадение | Создать новую сущность со ссылкой на существующую |
| Неоднозначно | Эскалировать человеку |
| Совпадений нет | Создать |

---

## 9. Контракты инструментов

Фактические контракты и доступные проекты: `.opencode/references/integrations.md`.

### 9.1. Confluence — REST API через plugin (read-only)

| Инструмент | Назначение |
|---|---|
| `confluence_get_page` | Нормализованная страница: id, title, status, version, URL, body |
| `confluence_get_children` | Дочерние страницы |
| `confluence_get_comments` | Комментарии `footer` / `inline` / `all` |
| `confluence_search` | Поиск по CQL |

Реализация: `.opencode/plugins/confluence/index.ts`, прямой вызов `/wiki/api/v2`. Официальный Atlassian MCP этот site не обслуживает.

Требования к output: нормализованный JSON, без секретов, с метаданными версии и статуса.

### 9.2. Jira — MCP `jira`

`cloudId`: `<ATLASSIAN_CLOUD_ID>`.

| Инструмент | Тип |
|---|---|
| `jira_searchJiraIssuesUsingJql` | read |
| `jira_getJiraIssue` | read |
| `jira_createJiraIssue` | write |
| `jira_executeRead` (`listJiraProjects`, `listJiraProjectIssueTypesMetadata`, `listJiraIssueLinkTypes`) | read |
| `jira_executeWrite` (`createJiraIssueLink`, `createJiraIssueRemoteIssueLink`) | write |

Запрещено: edit, delete, transition, assign, set priority/sprint/estimation.

### 9.3. Qase — официальный MCP `qase`

| Инструмент | Тип |
|---|---|
| `qase_project_context` | read |
| `qase_get` | read |
| `qql_search` / `qql_help` | read |
| `qase_suite_upsert` (без `id`) | write |
| `qase_case_bulk_create` (один кейс за вызов) | write |

Запрещено: update, delete, run, manage plans/releases, `qase_api`, `qase_case_upsert`.

> Custom tools в `.opencode/tools/*.ts` не работают в OpenCode V2. Основные пути: plugin для Confluence и MCP-серверы для Jira и Qase. Локальный `.opencode/mcp/qa-tools.mjs` остаётся резервом и вызывается только после вопроса пользователю. Переменные окружения и токены не хранить в артефактах, отчётах и логах.

---

## 10. Quality Gates в мультиагентной схеме

| Gate | Кто проверяет | Вход | Условие PASS |
|---|---|---|---|
| Requirement Review Gate | `qa-lead` | RR artifact | `status=READY`, Completion Criteria выполнены, конфликты видимы |
| Task Design Gate | `qa-lead` | Jira Tasks artifact | каждая задача обоснована RR, AC не выдуманы, traceability есть |
| Jira Gate | `qa-lead` | Jira tool responses | каждая задача создана, ID получен |
| Test Design Gate | `qa-lead` | Test Model artifact | покрытие есть, Expected Result проверяем, дубли отсутствуют |
| Qase Gate | `qa-lead` | Qase tool responses | каждая сущность создана, ID получен |
| Final Gate | `qa-lead` | все артефакты и реестр | всё создано, критических блокеров нет |

Для каждого Gate фиксировать evidence: имя артефакта, версию, результат, причину FAIL/BLOCKED.

---

## 11. Этапы внедрения

### Этап 1. Каркас агентов

- [x] Создать `.opencode/opencode.jsonc` с `default_agent: qa-lead`.
- [x] Создать 4 agent-файла.
- [x] Настроить permissions и allowlist subagent'ов.
- [x] Проверить, что дочерние агенты не видят лишние skills.

**DoD:** `qa-lead` запускается по умолчанию, может вызвать только трёх детей, дети не имеют внешних tools.

### Этап 2. Разделение инструкций

- [x] Сократить `.opencode/AGENTS.md` до общих правил.
- [x] Перенести orchestration в `qa-lead.md`.
- [x] Убрать дубли и пустой `Report Builder`.
- [x] Добавить глоссарий и словари статусов.

**DoD:** дочерний агент не получает инструкцию «координировать workflow»; общие правила остаются едиными.

### Этап 3. Артефакты и протокол

- [x] Создать `.opencode/artifacts/README.md`.
- [x] Добавить шаблоны артефактов.
- [x] Определить `run-manifest`, `created-entities`, `coverage-map`, `final-report`.
- [x] Встроить протокол делегирования в `qa-lead.md` и skills.

**DoD:** каждый этап создаёт файл по шаблону; ответ subagent содержит `status/artifact/summary/blockers`.

### Этап 4. Доработка skills

- [x] Entry Criteria / Non-Goals / Handoff / Template.
- [x] Уточнения по AC, Priority, Issue Type, draft.
- [x] Разграничение RR и test-design.
- [x] Опциональный вход Jira keys для test-design.

**DoD:** skills можно выполнять автономно, не обращаясь к пользователю и внешним tools.

### Этап 5. Инструменты

- [x] Реализовать Confluence read-only.
- [x] Подключить Jira через Atlassian MCP.
- [x] Подключить Qase через официальный MCP.
- [x] Настроить permissions на фактические имена инструментов.
- [x] Проверить read-операции на реальных данных.
- [ ] Проверить write-операции (перенесено в пилот, чтобы не создавать тестовые сущности без подтверждения).

**DoD:** Confluence покрывает заявленный Scope; Jira/Qase позволяют выполнить свои Gates. Read-операции проверены; write проверяются на пилоте.

#### Результаты этапа 5

| Компонент | Реализация |
|---|---|
| Confluence | REST API v2 через plugin `.opencode/plugins/confluence/index.ts`: `confluence_get_page`, `_get_children`, `_get_comments`, `_search` |
| Jira | Atlassian MCP `jira`, `cloudId = <ATLASSIAN_CLOUD_ID>` |
| Qase | официальный MCP `@qase/mcp-server` 3.0.6 (`npx -y -p @qase/mcp-server -p hono@4 qase-mcp-server`), 42 инструмента |
| Резерв | MCP `qa-tools` оставлен как альтернатива; перед вызовом обязателен вопрос пользователю |
| Permissions | `confluence*`, `jira*`, узкий allowlist `qase*`; `qa_tools_*` в режиме `ask` |
| Секреты | Env → файл `~/.secrets/qa-agent.env` (вне проекта); токен удалён из `opencode.jsonc` |
| Legacy | `.opencode/tools/*.ts` перемещены в `.opencode/legacy-v1/tools/` |

Проверено на реальных данных:

- Confluence: страница `2818049`, версия 3, статус `current`, body 95 883 символа, через REST API plugin.
- Jira: проекты `KAN`, `PPK`, `UP`, доступ read-write.
- Qase: официальный MCP подключается (42 инструмента), авторизация подтверждена.

`@qase/mcp-server` падал с `ERR_MODULE_NOT_FOUND hono/ws`: у `@hono/node-server` peer dependency `hono ^4 || ^5`, который npx не установил. Штатный сервер восстановлен подстановкой `-p hono@4`, собственный MCP для Qase больше не основной путь.

### Этап 6. Пилот

- [ ] Выбрать одну approved-страницу Confluence.
- [ ] Прогнать полный цикл 1+3.
- [ ] Проверить все Gates и итоговый отчёт.
- [ ] Зафиксировать проблемы и обновить инструкции.

**DoD:** артефакты воспроизводимы, ID сохранены, статус соответствует фактическому результату.

---

## 12. Риски и открытые вопросы

| Риск | Влияние | Митигация |
|---|---|---|
| `AGENTS.md` всё ещё слишком велик | Контекст детей раздувается | Держать общий файл ≤150 строк |
| Модель основного агента выполняет skills сама | Мультиагентность не работает | `skill: deny` для `qa-lead` + явное правило делегирования |
| Custom tool permissions не совпадают с ожидаемыми action-именами | Дети получают лишний доступ | Проверить после регистрации tools |
| Confluence отдаёт storage HTML | Плохое качество извлечения требований | Нормализация и сохранение исходного HTML в `source.md` |
| Timeout при создании Jira/Qase | Дубликаты | Маркер запуска + поиск перед retry |
| Qase API отличается от ожидаемого | Блокировка Qase Gate | Спроектировать адаптер после получения доступов |
| Дочерний агент задаёт вопрос пользователю | Нарушение протокола | Явный запрет в agent body и skill |
| Последовательный порядок замедляет запуск | Скорость | Приемлемо для v1; параллелизм — позже |
| Custom tools `.opencode/tools/*.ts` не работают в OpenCode V2 | Инструменты не видны агенту | Confluence — plugin, Qase/Jira — MCP |
| `@qase/mcp-server` без peer `hono` падает | Qase недоступен | Запуск с `-p hono@4` |
| Фоновый сервис держит окружение, полученное при старте | Confluence/Qase возвращают 401/403 или пустой token | Файл секретов читается без перезапуска; изменение env требует перезапуска |
| `jira_executeWrite` технически шире, чем две операции связывания | Риск нежелательной записи | Явный запрет в agent body и references |
| Собственный `qa-tools` может подменить штатные инструменты | Непрозрачный обход | Permissions `ask` на `qa_tools_*` + правило спрашивать |

### Открытые вопросы к моменту подключения Jira/Qase

1. ~~Какие именно API/MCP будут использоваться?~~ Решено: Confluence — REST API v2 через plugin, Jira — Atlassian MCP, Qase — официальный MCP. `qa-tools` — только резерв.
2. Нужны ли Jira remote links на Confluence или достаточно ссылки в description? Пока открыт; инструмент доступен.
3. Какие Qase-поля обязательны в проекте? Уточнить на пилоте для проекта `UP`.
4. Нужно ли создавать suite-иерархию или плоский набор? Уточнить на пилоте.
5. ~~Разрешено ли заполнять Qase Priority?~~ Решено: `Priority (design)` маппится в `HIGH/MEDIUM/LOW`.

---

## 13. Критерий готовности мультиагента

- `qa-lead` — единственный, кто вызывает Confluence/Jira/Qase и общается с пользователем.
- Все три дочерних агента работают без внешних tools и без вопросов пользователю.
- Каждый этап создаёт артефакт по шаблону и проходит Gate.
- Передача между этапами идёт через файлы.
- Любой существенный вывод имеет source reference.
- Созданные сущности имеют сохранённые ID.
- Итоговый статус соответствует фактическому состоянию.
- Секреты не попадают в контекст, артефакты и отчёты.
