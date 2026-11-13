---
artifact: coverage-map
version: 1
run_id: RUN-20260101-120000
status: READY
generated_by: qa-lead
source: requirement-review.v1.md, jira-tasks.v1.md, test-model.v1.md, created-entities.json
---

# Coverage Map

Трассировка: REQ → Jira Key → тест-сценарий.

## Coverage Map

| REQ ID | Jira Key | Test Cases | Coverage Status | Gaps |
|---|---|---|---|---|
| `REQ-001` | `TASK-001, TASK-002` | `TC-001, TC-002` | `COVERED` | — |
| `REQ-002` | `TASK-001, TASK-003` | `TC-001` | `COVERED` | — |
| `REQ-003` | `TASK-001` | `TC-003` | `COVERED` | — |
| `REQ-004` | `TASK-001` | `TC-005` | `COVERED` | — |
| `REQ-005` | `TASK-002` | `TC-002` | `COVERED` | — |
| `REQ-006` | `TASK-003` | `TC-006` | `COVERED` | — |
| `REQ-007` | `TASK-001` | `TC-007` | `COVERED` | — |
| `REQ-008` | `TASK-004` | `TC-008` | `COVERED` | — |
| `REQ-009` | `TASK-001` | `TC-004` | `COVERED` | — |
| `REQ-010` | `TASK-002` | `TC-009` | `PARTIAL` | ожидается решение по OQ-002 |

## Summary

| Метрика | Значение |
|---|---|
| Всего требований | 10 |
| Полностью покрыто | 9 |
| Частично покрыто | 1 |
| Не покрыто | 0 |

## Uncovered Requirements

| REQ ID | Причина отсутствия покрытия | Решение |
|---|---|---|
| — | — | — |
