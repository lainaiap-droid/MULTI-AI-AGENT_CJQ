---
artifact: jira-tasks
version: 1
run_id: RUN-YYYYMMDD-HHMMSS
status: READY
generated_by: task-designer
source: requirement-review.v1.md
---

# Jira Tasks

## Tasks

### TASK-001

- **Summary:** `<краткий и проверяемый результат>`
- **Issue Type:** `Epic | Task | Sub-task | NEEDS_PROJECT_CONTEXT`
- **Issue Type source:** `project-context | default | needs-decision`
- **Description:** `<описание на основании Requirement Review>`
- **Source Requirements:** `REQ-001, BR-001`
- **Acceptance Criteria:** `<AC-001; AC-002>` или `AC: MISSING`
- **Dependencies:** `<TASK-002 или —>`
- **Priority (design):** `HIGH | MEDIUM | LOW | NEEDS_HUMAN_DECISION`
- **Traceability:** `TASK-001 → REQ-001 → AC-001`

### TASK-002

- **Summary:** `<...>`
- **Issue Type:** `<...>`
- **Issue Type source:** `<...>`
- **Description:** `<...>`
- **Source Requirements:** `<...>`
- **Acceptance Criteria:** `<...>` или `AC: MISSING`
- **Dependencies:** `<...>`
- **Priority (design):** `<...>`
- **Traceability:** `<...>`

## Coverage

| REQ ID | TASK ID | Covered |
|---|---|---|
| `REQ-001` | `TASK-001` | `YES / NO` |

## Duplicate Candidates

| TASK ID | Existing Jira Key | Причина совпадения | Решение |
|---|---|---|---|
| `TASK-001` | `<ABC-123>` | `<причина>` | `CREATE / LINK / SKIP / ESCALATE` |

## Open Questions and Blockers

| ID | Вопрос или блокер | Влияние на задачу |
|---|---|---|
| `<OQ-ID>` | `<текст>` | `<TASK-ID>` |

## Gate Self-Check

| Критерий | Результат |
|---|---|
| Каждая задача имеет основание в Requirement Review | `<YES/NO>` |
| Issue Type определён и обоснован | `<YES/NO>` |
| Значимые требования покрыты или явно отмечены | `<YES/NO>` |
| Отсутствующие AC помечены как MISSING | `<YES/NO>` |
| Summary и Description понятны без истории чата | `<YES/NO>` |
| Acceptance Criteria не содержат придуманных правил | `<YES/NO>` |
| Traceability сохранена | `<YES/NO>` |
| Необоснованные дубликаты отсутствуют | `<YES/NO>` |
| Критические Ambiguities и Conflicts не скрыты | `<YES/NO>` |
