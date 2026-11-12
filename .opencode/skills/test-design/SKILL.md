---
name: test-design
description: Проектирует риск-ориентированную тестовую модель на основе проверенного Requirement Review. Формирует позитивные, негативные, граничные и risk-based сценарии с ожидаемыми результатами, приоритетами и трассировкой в Test Model Artifact. Не создаёт тест-кейсы в Qase и не выполняет тестирование.
---

# Test Design

## Purpose

Skill проектирует риск-ориентированную тестовую модель на основании проверенного Requirement Review и формирует Test Model Artifact, пригодный для последующего создания тестовых сущностей через Qase Tool.

Skill проектирует тесты. Он не выполняет тестирование и не создаёт сущности в Qase напрямую.

## Inputs

### Обязательные входные данные

- валидный Requirement Review Artifact

### Опциональные входные данные

- карта подтверждённых Jira keys (`jira_map`), если задачи уже созданы
- ограничения тестирования
- релевантные существующие тест-кейсы, если агент получил их через Qase Tool
- проектные правила приоритизации
- проектные правила маппинга полей в Qase
- дополнительный Context, явно переданный агентом

## Entry Criteria

Перед выполнением проверь:

- Requirement Review Artifact существует и доступен;
- `status` артефакта — `READY`, либо `PARTIAL` с явно принятыми ограничениями;
- артефакт содержит Requirements, Business Rules, Acceptance Criteria, Validation Rules, Boundaries, Flows и Risks в пределах доступных требований;
- критические Ambiguities и Conflicts либо разрешены, либо явно помечены;
- `jira_map`, если передан, содержит только фактически созданные Jira keys.

Если Requirement Review имеет `status: BLOCKED` или критическая неоднозначность не позволяет определить проверяемое поведение, верни `BLOCKED` с указанием зависимости.

## Non-Goals

Skill не выполняет следующее:

- не создаёт тест-кейсы, suites и другие сущности в Qase;
- не запускает Test Runs и не изменяет их результаты;
- не управляет тест-планами и релизами;
- не выполняет ручное тестирование и не фиксирует баги;
- не пишет автотесты и код автоматизации;
- не ищет дубликаты в Qase самостоятельно;
- не придумывает бизнес-поведение, которого нет в Requirement Review;
- не изменяет Requirement Review и Jira Tasks Artifact;
- не превращает тестовый сценарий в бизнес-требование.

## Context Management

- используй Requirement Review как основной вход для тест-дизайна
- не анализируй заново весь Confluence, если необходимая информация уже представлена в проверенном Requirement Review
- используй существующие тест-кейсы Qase только для анализа текущего покрытия и предотвращения дублирования
- не загружай в Context всю тестовую модель Qase, если достаточно релевантных тестов текущей функциональности
- не вызывай Qase Tool самостоятельно: Tool-вызовы выполняются агентом
- не используй Jira keys, которых нет в переданном `jira_map`

## Procedure

1. Определи тестируемые функции и бизнес-правила из Requirement Review
2. Оцени риски и бизнес-критичность
3. Определи Positive Scenarios
4. Определи Negative Scenarios
5. Покрой Validation Rules
6. Покрой значимые Boundary Conditions
7. Добавь важные альтернативные потоки и зависимости
8. Используй risk-based подход для дополнительного покрытия рисков
9. Для каждого сценария сформулируй проверяемый Expected Result
10. Назначь `Priority (design)` на основании риска и критичности
11. Сохрани Traceability к Source Requirement
12. Укажи Jira Key только при наличии фактического значения в `jira_map`
13. Сравни с переданными существующими тестами и исключи необоснованные дубли
14. Сформируй Test Model Artifact
15. Проверь Artifact по Completion Criteria

## Rules

- не придумывай бизнес-поведение, которого нет в Requirement Review
- допускаются risk-based проверки, не описанные дословно в требованиях, но они должны быть явно обозначены как QA/Risk-based, а не как бизнес-требование
- каждый сценарий должен иметь понятную цель и проверяемый Expected Result
- не создавай несколько сценариев, проверяющих одно и то же без дополнительной ценности
- не скрывай нерешённые Ambiguities и Conflicts
- не вызывай Qase Tool
- не считай Test Model фактически созданной в Qase до подтверждения Tool на уровне агента
- не указывай Qase ID, пока тест-кейс фактически не создан
- тестовые данные, не определённые в требованиях, допускаются только как явно помеченные QA/Risk-based предложения
- если Expected Result невозможно определить из-за неоднозначности, пометь сценарий `BLOCKED` или исключи его из готовой части Artifact

## Priority

- `Priority (design)` — атрибут проектирования теста.
- Допустимые значения: `HIGH`, `MEDIUM`, `LOW`, `NEEDS_HUMAN_DECISION`.
- Основание: риск, бизнес-критичность или явный Context.
- Поле Priority в Qase не заполняется без отдельного разрешения.
- Если проектом задан маппинг design priority → Qase priority, применяй его только при наличии явного правила.

## Mapping to Qase

Skill не создаёт сущности Qase, но готовит данные для маппинга:

| Test Model | Qase |
|---|---|
| Title | Title тест-кейса |
| Type | Tag, label или custom field — только если такое поле есть в проекте |
| Priority (design) | Поле Priority — только при явном разрешении |
| Source Requirement | Описание или reference |
| Jira Key | Ссылка или reference в описании |
| Preconditions | Preconditions |
| Steps / Test Intent | Steps |
| Expected Result | Expected Result |
| Risk Reference | Описание или tag |
| Local ID | Маркер `[agent-run:<run_id>:<TC-ID>]` в описании |

Если проект не определяет поле, не выдумывай его. Сохрани значение в описании или вынеси в Open Question.

## Boundary with Requirement Review

Requirement Review фиксирует поведение, правила, границы и риски на уровне требований.

Test Design превращает их в проверяемые сценарии:

- выбирает проверки и их количество;
- формулирует steps, preconditions и Expected Result;
- назначает Priority (design);
- помечает risk-based проверки.

Test Design не пересматривает требования и не добавляет новое бизнес-поведение. Если данных в Requirement Review недостаточно, верни Open Question или Blocker.

## Reasoning Patterns

### Self-Refine / Critic

Основной паттерн для проверки качества Test Model: Generate — Evaluate — Improve — Evaluate. Проверяй полноту покрытия, негативные сценарии, границы, ожидаемые результаты, приоритеты, трассировку и дубли.

### Branching / Tree

Не применяется по умолчанию. Используй только если есть несколько существенно разных тестовых стратегий или вариантов покрытия, влияющих на риск, стоимость или время. Сравни не более трёх вариантов и выбери наиболее обоснованный.

### Reviewer

Если Agent Workflow включает независимый Reviewer для критической Test Model, передай ему валидный Test Model Artifact и необходимые исходные ссылки, а не полную историю работы Skill.

## Output

Создай Test Model Artifact. Для каждого тестового сценария укажи:

- Local ID
- Title
- Type: `positive`, `negative`, `boundary` или `risk-based`
- Priority (design)
- Source Requirement
- Jira Key, если есть в `jira_map`, иначе `—`
- Preconditions, если применимо
- Steps или Test Intent
- Expected Result
- Risk Reference, если сценарий risk-based
- Open Question или Blocker, если сценарий зависит от нерешённой неоднозначности

Допустимые значения Type: `positive`, `negative`, `boundary`, `risk-based`, если проектом не определён другой контракт.

## Artifact Contract

- **Producer:** Skill test-design.
- **Consumer:** Agent, этап создания тестовых сущностей через Qase Tool.
- **Artifact:** Test Model.
- **Validation:** Completion Criteria этого Skill.
- **Error Handling:** если критическая часть требований неоднозначна, не выдумывай Expected Result; пометь зависимые сценарии как `BLOCKED` или `REQUIRES_HUMAN_DECISION` либо исключи их из готовой к созданию части Artifact с явным объяснением.

## Completion Criteria

- Entry Criteria выполнены
- критические подтверждённые требования имеют тестовое покрытие
- Positive Scenarios покрыты
- релевантные Negative Scenarios покрыты
- Validation Rules покрыты
- значимые Boundary Conditions покрыты
- Expected Result определён для каждого готового сценария
- Priority (design) назначен или явно отмечено, что он требует внешнего решения
- Traceability к требованиям сохранена
- Jira Key указан только из фактического `jira_map`
- risk-based сценарии отделены от бизнес-требований
- тестовые данные не выдаются за подтверждённые бизнес-данные
- необоснованные дубликаты отсутствуют
- нерешённые Ambiguities и Blockers видимы
- Artifact готов к передаче агенту для создания тестовых сущностей через Qase Tool

## Artifact Template

Шаблон: `templates/test-model.md` относительно каталога skill.

Имя файла: `test-model.v<n>.md` в каталоге запуска.

## Handoff

Верни `qa-lead` только короткий header:

```yaml
status: READY | PARTIAL | BLOCKED
artifact: <path>
summary: "<3–7 строк>"
key_findings: [...]
blockers: [...]
questions_for_human: [...]
```

Не возвращай полный текст артефакта и не задавай вопросы пользователю напрямую.
