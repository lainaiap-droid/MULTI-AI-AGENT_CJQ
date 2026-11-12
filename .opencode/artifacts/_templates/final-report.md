---
artifact: final-report
version: 1
run_id: RUN-YYYYMMDD-HHMMSS
status: READY
generated_by: qa-lead
source: run-manifest.json, created-entities.json, coverage-map.md
---

# Final Report

## Статус запуска

`SUCCESS | PARTIAL | FAILED | REQUIRES_HUMAN_DECISION`

## Источник

| Поле | Значение |
|---|---|
| Confluence page | `<page-id>` |
| Title | `<title>` |
| Version | `<version>` |
| URL | `<url>` |
| Retrieved at | `<ISO-8601>` |

## Артефакты

| Этап | Артефакт | Статус | Gate |
|---|---|---|---|
| Requirement Review | `<path>` | `<READY>` | `<PASS>` |
| Jira Tasks | `<path>` | `<READY>` | `<PASS>` |
| Test Model | `<path>` | `<READY>` | `<PASS>` |

## Созданные Jira-задачи

| Local ID | Jira Key | URL | Статус |
|---|---|---|---|
| `TASK-001` | `<ABC-123>` | `<url>` | `CREATED` |

## Созданные Qase-сущности

| Local ID | Qase ID | Suite ID | URL | Статус |
|---|---|---|---|---|
| `TC-001` | `<id>` | `<suite-id>` | `<url>` | `CREATED` |

## Coverage Map

См. `coverage-map.md`.

## Неоднозначности и конфликты

| ID | Описание | Влияние | Решение |
|---|---|---|---|
| `<AMB/CON-ID>` | `<text>` | `<impact>` | `<pending / resolved>` |

## Блокировки и ошибки

| Этап | Проблема | Влияние | Что нужно |
|---|---|---|---|
| `<stage>` | `<problem>` | `<impact>` | `<action>` |

## Частично выполненные операции

| Операция | Фактический результат | Почему частично |
|---|---|---|
| `<operation>` | `<result>` | `<reason>` |

## Вопросы к человеку

| ID | Вопрос | Почему важно | Кто решает |
|---|---|---|---|
| `<OQ-ID>` | `<question>` | `<impact>` | `<owner>` |
