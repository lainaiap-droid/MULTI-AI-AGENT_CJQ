# Evals

Слой оценки качества артефактов QA-мультиагента. Проверяет, что Requirement Review, Jira Tasks, Test Model и Coverage Map соответствуют контрактам проекта, согласованы между собой и не содержат утечек.

Evals не входят в архитектуру 1+3 и не заменяют Quality Gates: это измерительный инструмент для `qa-lead`, CI и ручных прогонов.

## Требования

- Node.js 20 или новее.
- Внешних зависимостей нет, `npm install` не нужен.

## Быстрый старт

```bash
node .opencode/evals/run-evals.mjs --selftest
node .opencode/evals/run-evals.mjs --list
node .opencode/evals/run-evals.mjs --case SYN-SORT-001 --verbose
node .opencode/evals/run-evals.mjs --md eval-report.md --json eval-report.json
```

Коды выхода: `0` — все кейсы PASS, `1` — есть ошибки, `2` — не найдены кейсы или оценки judge.

## Структура

```text
.opencode/evals/
├── run-evals.mjs        # CLI: реестр кейсов, прогон, отчёты
├── selftest.mjs         # мутационные тесты самих проверок
├── package.json
├── lib/
│   ├── markdown.mjs     # frontmatter, секции, таблицы, блоки
│   ├── model.mjs        # модель артефакта
│   ├── check.mjs        # коллектор результатов и сводка
│   ├── judge.mjs        # промпты, внешняя команда, приём оценок
│   ├── report.mjs       # консоль, JSON, Markdown, baseline
│   └── checks/          # сами проверки
├── cases/
│   ├── public/          # синтетика, коммитится
│   └── private/         # реальные данные, не коммитится
└── README.md
```

## Формат кейса

```text
cases/public/SYN-SORT-001/
├── case.json
├── source.md
├── artifacts/
│   ├── requirement-review.v1.md
│   ├── jira-tasks.v1.md
│   ├── test-model.v1.md
│   └── coverage-map.md
└── _judge/              # создаётся при --judge, не коммитится
```

`case.json`:

| Поле | Назначение |
|---|---|
| `id` | уникальный идентификатор кейса |
| `title` | человекочитаемое название |
| `visibility` | `public` или `private` |
| `source` | `synthetic` или `confluence` |
| `source_file` | файл входных требований, по умолчанию `source.md` |
| `expect.minRequirements` | минимальное число REQ |
| `expect.minTasks` | минимальное число TASK |
| `expect.minTestCases` | минимальное число TC |
| `judge.rubric[]` | критерии LLM-judge: `id`, `title`, `weight`, `question` |

Артефакты выбираются по маскам `requirement-review*.md`, `jira-tasks*.md`, `test-model*.md`, `coverage-map*.md`; при нескольких версиях берётся последняя по алфавиту.

## Проверки

| Семейство | Примеры | Смысл |
|---|---|---|
| `FM-*` | `FM-REQUIRED-FIELDS`, `FM-RUN-ID-FORMAT` | frontmatter и допустимые значения |
| `ST-*` | `ST-SECTIONS-PRESENT`, `ST-GATE-SELF-CHECK-ALL-YES`, `ST-NO-TEMPLATE-PLACEHOLDERS` | структура и готовность артефакта |
| `ID-*` | `ID-FORMAT`, `ID-UNIQUE`, `ID-SEQUENTIAL` | идентификаторы |
| `TR-RR-*` | `TR-RR-REF-INTEGRITY`, `TR-RR-TRACEABILITY-FULL` | трассировка требований |
| `TR-JIRA-*` | `TR-JIRA-ISSUE-TYPE-VALID`, `TR-JIRA-COVERAGE-CONSISTENCY` | задачи и их покрытие |
| `TR-TEST-*` | `TR-TEST-EXPECTED-RESULT`, `TR-TEST-COVERAGE-CONSISTENCY` | сценарии и их покрытие |
| `CV-*` | `CV-STATUS-VALUES`, `CV-SUMMARY-MATCH` | Coverage Map |
| `HY-*` | `HY-SECRETS`, `HY-PII`, `HY-ABS-PATH` | гигиена и безопасность |
| `X-*` | `X-RUN-ID-CONSISTENT` | согласованность бандла |
| `EV-*` | `EV-MIN-VOLUME` | минимальный объём из `case.json` |

`severity=error` влияет на вердикт, `severity=warn` только сигнализирует. `ID-SEQUENTIAL` — предупреждение: пропуск номера может быть осознанным.

## LLM-judge

CLI не вызывает модель. Он формирует промпт по рубрике и принимает оценки в JSON.

```bash
# 1. Подготовить промпты и, если задана команда, сразу получить оценки
EVAL_JUDGE_CMD='node my-judge.mjs' node .opencode/evals/run-evals.mjs --case SYN-SORT-001 --judge

# 2. Либо оценить вручную и учесть готовые оценки
node .opencode/evals/run-evals.mjs --case SYN-SORT-001 --judge-ingest
```

Файлы: `_judge/<stage>.prompt.md` и `_judge/<stage>.scores.json`.

Формат ответа оценщика:

```json
{
  "case": "SYN-SORT-001",
  "stage": "requirement-review",
  "judge": "model-or-human",
  "scores": [
    { "id": "J-FAITHFUL", "score": 3, "max": 3, "comment": "Все REQ имеют источник SRC-001." }
  ],
  "verdict": "PASS"
}
```

Валидация: все критерии рубрики присутствуют, балл в диапазоне `0..weight`, обоснование непустое. Порог PASS — 75% взвешенной суммы. Некорректный ответ даёт `FAIL` с указанием причины.

## Baseline

```bash
node .opencode/evals/run-evals.mjs --json eval-baseline.json
# после изменения проверок или артефактов
node .opencode/evals/run-evals.mjs --baseline eval-baseline.json --update-baseline
```

Baseline сравнивает score по кейсам и подсвечивает регрессии `PASS → FAIL`.

## Selftest

```bash
node .opencode/evals/run-evals.mjs --selftest --verbose
```

Selftest берёт эталонный кейс, вносит по одному дефекту и требует, чтобы конкретная проверка его поймала: отсутствие `status`, `NO` в Gate, несуществующий AC, шаблонная заглушка, токен, неверный Issue Type, рассогласование Coverage, расхождение сводки, разные `run_id`. Если проверку сломают, selftest упадёт.

## Приватность

- `cases/public/` — только синтетические обезличенные данные.
- `cases/private/` и `**/_judge/` исключены из git.
- Реальные page ID, токены, email, accountId и адреса пространства в публичный набор не попадают.
- Артефакты с секретами не индексируются: `HY-*` вернёт ошибку раньше, чем файл попадёт в коммит.

## Новый кейс

1. Создай `cases/public/<CASE-ID>/` с `case.json` и `source.md`.
2. Положи эталонные артефакты в `artifacts/`.
3. Запусти `node .opencode/evals/run-evals.mjs --case <CASE-ID> --verbose` и добейся PASS без ослабления проверок.
4. Добавь минимум одну рубрику judge, если кейс проверяет семантику.
5. Убедись, что `--selftest` по-прежнему зелёный.

## CI

```yaml
- run: node .opencode/evals/run-evals.mjs --selftest
- run: node .opencode/evals/run-evals.mjs --json eval-report.json --md eval-report.md
```
