---
artifact: jira-tasks
version: 1
run_id: RUN-20260101-120000
status: READY
generated_by: task-designer
source: requirement-review.v1.md
---

# Jira Tasks

## Tasks

### TASK-001

- **Summary:** Реализовать серверную сортировку списка задач по полю и направлению
- **Issue Type:** `Task`
- **Issue Type source:** `project-context`
- **Description:** Добавить в выдачу списка задач параметры поля сортировки и направления. Поддержать поля «приоритет», «срок выполнения» и «дата создания». Для поля приоритета использовать фиксированный порядок: высокий, средний, низкий. При равенстве значений сортировать по дате создания от новых к старым. Задачи без срока при сортировке по сроку размещать в конце независимо от направления. Скрытые задачи исключать из сортируемого набора.
- **Source Requirements:** `REQ-001, REQ-002, REQ-003, REQ-004, REQ-007, REQ-009`
- **Acceptance Criteria:** `AC-001, AC-002, AC-003`
- **Dependencies:** —
- **Priority (design):** `HIGH`
- **Traceability:** `TASK-001 → REQ-001, REQ-002, REQ-003, REQ-004, REQ-007, REQ-009 → BR-001, BR-002, BR-003, BR-004 → AC-001, AC-002, AC-003`

### TASK-002

- **Summary:** Добавить в интерфейс выбор поля сортировки и переключение направления
- **Issue Type:** `Task`
- **Issue Type source:** `project-context`
- **Description:** Вывести в списке задач элемент выбора поля сортировки и кнопку переключения направления между возрастанием и убыванием. Список доступных полей получать из настройки платформы, не фиксировать перечень в клиенте. При неизвестном поле не блокировать отображение списка.
- **Source Requirements:** `REQ-001, REQ-005, REQ-010`
- **Acceptance Criteria:** `AC-001`
- **Dependencies:** `TASK-001`
- **Priority (design):** `HIGH`
- **Traceability:** `TASK-002 → REQ-001, REQ-005, REQ-010 → BR-005 → AC-001`

### TASK-003

- **Summary:** Сохранять выбранную сортировку пользователя между сессиями
- **Issue Type:** `Task`
- **Issue Type source:** `project-context`
- **Description:** Сохранять выбранное поле и направление сортировки в пользовательских предпочтениях и применять их при следующем входе. При отсутствии сохранённого значения применять сортировку по умолчанию — по дате создания от новых к старым.
- **Source Requirements:** `REQ-002, REQ-006`
- **Acceptance Criteria:** `AC-004`
- **Dependencies:** `TASK-001`
- **Priority (design):** `MEDIUM`
- **Traceability:** `TASK-003 → REQ-002, REQ-006 → BR-003 → AC-004`

### TASK-004

- **Summary:** Показать состояние пустого списка задач
- **Issue Type:** `Task`
- **Issue Type source:** `project-context`
- **Description:** При отсутствии задач в списке показывать сообщение об отсутствии задач вместо пустой таблицы. Сообщение не должно перекрывать элементы управления сортировкой.
- **Source Requirements:** `REQ-008`
- **Acceptance Criteria:** `AC-005`
- **Dependencies:** `TASK-002`
- **Priority (design):** `LOW`
- **Traceability:** `TASK-004 → REQ-008 → AC-005`

## Coverage

| REQ ID | TASK ID | Covered |
|---|---|---|
| `REQ-001` | `TASK-001, TASK-002` | `YES` |
| `REQ-002` | `TASK-001, TASK-003` | `YES` |
| `REQ-003` | `TASK-001` | `YES` |
| `REQ-004` | `TASK-001` | `YES` |
| `REQ-005` | `TASK-002` | `YES` |
| `REQ-006` | `TASK-003` | `YES` |
| `REQ-007` | `TASK-001` | `YES` |
| `REQ-008` | `TASK-004` | `YES` |
| `REQ-009` | `TASK-001` | `YES` |
| `REQ-010` | `TASK-002` | `YES` |

## Duplicate Candidates

| TASK ID | Existing Jira Key | Причина совпадения | Решение |
|---|---|---|---|
| — | — | — | — |

## Open Questions and Blockers

| ID | Вопрос или блокер | Влияние на задачу |
|---|---|---|
| `OQ-001` | Отображение индикатора сортировки при первом входе | `TASK-002` |
| `OQ-002` | Обработка сохранённого поля, удалённого из настройки | `TASK-002, TASK-003` |

## Gate Self-Check

| Критерий | Результат |
|---|---|
| Каждая задача имеет основание в Requirement Review | `YES` |
| Issue Type определён и обоснован | `YES` |
| Значимые требования покрыты или явно отмечены | `YES` |
| Отсутствующие AC помечены как MISSING | `YES` |
| Summary и Description понятны без истории чата | `YES` |
| Acceptance Criteria не содержат придуманных правил | `YES` |
| Traceability сохранена | `YES` |
| Необоснованные дубликаты отсутствуют | `YES` |
| Критические Ambiguities и Conflicts не скрыты | `YES` |
