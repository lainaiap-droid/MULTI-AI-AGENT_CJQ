---
artifact: test-model
version: 1
run_id: RUN-YYYYMMDD-HHMMSS
status: READY
generated_by: test-designer
source: requirement-review.v1.md
jira_map: created-entities.json
---

# Test Model

## Scenarios

### TC-001

- **Title:** `<проверяемая цель сценария>`
- **Type:** `positive | negative | boundary | risk-based`
- **Priority (design):** `HIGH | MEDIUM | LOW`
- **Source Requirement:** `REQ-001`
- **Jira Key:** `<ABC-123 или —>`
- **Preconditions:** `<предусловия>`
- **Steps / Test Intent:** `<шаги или намерение теста>`
- **Expected Result:** `<проверяемый ожидаемый результат>`
- **Risk Reference:** `<RISK-001 или —>`

### TC-002

- **Title:** `<...>`
- **Type:** `<...>`
- **Priority (design):** `<...>`
- **Source Requirement:** `<...>`
- **Jira Key:** `<...>`
- **Preconditions:** `<...>`
- **Steps / Test Intent:** `<...>`
- **Expected Result:** `<...>`
- **Risk Reference:** `<...>`

## Coverage

| REQ ID | TC ID | Covered |
|---|---|---|
| `REQ-001` | `TC-001` | `YES / NO` |

## Risk-Based Scenarios

| RISK ID | TC ID | Почему сценарий risk-based |
|---|---|---|
| `RISK-001` | `TC-001` | `<обоснование>` |

## Open Questions and Blockers

| ID | Вопрос или блокер | Влияние на сценарий |
|---|---|---|
| `<OQ-ID>` | `<текст>` | `<TC-ID>` |

## Gate Self-Check

| Критерий | Результат |
|---|---|
| Критические требования имеют покрытие | `<YES/NO>` |
| Positive Scenarios покрыты | `<YES/NO>` |
| Релевантные Negative Scenarios покрыты | `<YES/NO>` |
| Validation Rules покрыты | `<YES/NO>` |
| Значимые Boundary Conditions покрыты | `<YES/NO>` |
| Expected Result определён для каждого сценария | `<YES/NO>` |
| Priority (design) назначен или отмечен как требующий решения | `<YES/NO>` |
| Priority (design) отделён от поля Priority в Qase | `<YES/NO>` |
| Traceability сохранена | `<YES/NO>` |
| Jira Key указан только из фактического jira_map | `<YES/NO>` |
| Risk-based сценарии отделены от бизнес-требований | `<YES/NO>` |
| Тестовые данные не выдаются за подтверждённые бизнес-данные | `<YES/NO>` |
| Необоснованные дубликаты отсутствуют | `<YES/NO>` |
| Ambiguities и Blockers видимы | `<YES/NO>` |
