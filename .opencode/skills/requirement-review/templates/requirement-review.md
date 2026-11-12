---
artifact: requirement-review
version: 1
run_id: RUN-YYYYMMDD-HHMMSS
status: READY
generated_by: requirement-reviewer
source: source.md
---

# Requirement Review

## Scope

<Границы анализируемой функциональности.>

## Source References

| SRC ID | Page ID | Version | Status | URL |
|---|---|---|---|---|
| `SRC-001` | `<page-id>` | `<version>` | `<status>` | `<url>` |

## Unconfirmed Fragments

| Фрагмент | Причина | Что нужно подтвердить |
|---|---|---|
| `<text>` | `draft / in_review / нет подтверждения` | `<owner>` |

## Requirements

| REQ ID | Requirement | Source | Notes |
|---|---|---|---|
| `REQ-001` | `<формулировка>` | `SRC-001` | `<примечание>` |

## Business Rules

| BR ID | Rule | Source |
|---|---|---|
| `BR-001` | `<правило>` | `SRC-001` |

## Acceptance Criteria

| AC ID | Criterion | Source |
|---|---|---|
| `AC-001` | `<критерий>` | `SRC-001` |

## Validation Rules

| VAL ID | Rule | Source |
|---|---|---|
| `VAL-001` | `<правило валидации>` | `SRC-001` |

## Dependencies

| DEP ID | Dependency | Type | Source |
|---|---|---|---|
| `DEP-001` | `<зависимость>` | `<requirement / system / data>` | `SRC-001` |

## Ambiguities

| AMB ID | Описание | Варианты трактовки | Source |
|---|---|---|---|
| `AMB-001` | `<описание>` | `<вариант 1 / вариант 2>` | `SRC-001` |

## Missing Information

| MISS ID | Чего не хватает | Почему важно | Кто может дать |
|---|---|---|---|
| `MISS-001` | `<информация>` | `<влияние>` | `<owner>` |

## Conflicts

| CON ID | Конфликтующие фрагменты | Суть конфликта | Source |
|---|---|---|---|
| `CON-001` | `<фрагмент 1> / <фрагмент 2>` | `<описание>` | `<SRC-...>` |

## Positive Flows

| FLOW ID | Описание | Source |
|---|---|---|
| `FLOW-P-001` | `<поток>` | `SRC-001` |

## Negative Flows

| FLOW ID | Описание | Source |
|---|---|---|
| `FLOW-N-001` | `<поток>` | `SRC-001` |

## Boundaries

| BND ID | Граничное условие | Source |
|---|---|---|
| `BND-001` | `<условие>` | `SRC-001` |

## Risks

| RISK ID | Риск | Влияние | Source |
|---|---|---|---|
| `RISK-001` | `<риск>` | `<влияние>` | `SRC-001` |

## Open Questions

| OQ ID | Вопрос | Почему важен | Кто решает |
|---|---|---|---|
| `OQ-001` | `<вопрос>` | `<влияние>` | `<owner>` |

## Traceability

| REQ ID | BR IDs | AC IDs |
|---|---|---|
| `REQ-001` | `BR-001` | `AC-001` |

## Gate Self-Check

| Критерий | Результат |
|---|---|
| Все релевантные требования проанализированы | `<YES/NO>` |
| Requirements, Business Rules и AC выделены | `<YES/NO>` |
| Ambiguities и Conflicts зафиксированы | `<YES/NO>` |
| Missing Information зафиксирована | `<YES/NO>` |
| Validation Rules и Boundaries отражены | `<YES/NO>` |
| Positive и Negative Flows определены | `<YES/NO>` |
| QA Risks и Open Questions зафиксированы | `<YES/NO>` |
| Source References присутствуют | `<YES/NO>` |
| Acceptance Criteria не содержат добавленных условий | `<YES/NO>` |
| Нет придуманных требований | `<YES/NO>` |
| Нет тестовых сценариев, шагов и Expected Result | `<YES/NO>` |
