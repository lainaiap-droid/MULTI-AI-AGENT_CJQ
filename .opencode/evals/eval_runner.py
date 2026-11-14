import json
import os
import shutil
import subprocess
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

from evaluator import evaluate_response
from source_refs import (
    SourceRefError,
    resolve_case_page_id,
)


# =============================================================
# PATHS
# =============================================================

# Корень проекта: .opencode/evals/eval_runner.py -> AI_AGENT_1.4
project_path = Path(__file__).resolve().parent.parent.parent

dataset_path = (
    Path(__file__).parent
    / "dataset"
    / "golden_dataset.json"
)


# =============================================================
# AGENT CONFIG
# =============================================================

# Модель агента. Без явного --model opencode run падает с 401.
AGENT_MODEL = os.environ.get(
    "EVAL_MODEL",
    "cloudru/deepseek-v4-flash"
)

# Агент, который выполняет eval-задание.
AGENT_NAME = os.environ.get(
    "EVAL_AGENT",
    "qa-lead"
)

# Таймаут одного прогона агента, секунды.
AGENT_TIMEOUT = int(
    os.environ.get("EVAL_AGENT_TIMEOUT", "1800")
)

# Этап, который прогоняется сейчас.
# Пока поддерживается только full-cycle: остальные этапы
# требуют отдельных промптов и отдельных артефактов.
RUN_STAGE = os.environ.get(
    "EVAL_STAGE",
    "full-cycle"
)


# =============================================================
# PATH К OPENCODE
# =============================================================

# На Windows opencode установлен как opencode.cmd.
# subprocess не находит .cmd по имени, поэтому путь
# разрешается явно через PATH.
OPENCODE_BIN = shutil.which("opencode")

if not OPENCODE_BIN:

    raise RuntimeError(
        "Команда opencode не найдена в PATH. "
        "Установите OpenCode CLI и повторите запуск."
    )


# =============================================================
# SANDBOX-ПРОЕКТЫ ДЛЯ ЗАПИСИ
# =============================================================

# Записи разрешены только в тестовые проекты.
# Значения по умолчанию указывают на UPT, но могут быть
# переопределены переменными окружения.
JIRA_PROJECT = os.environ.get("EVAL_JIRA_PROJECT", "UPT")
QASE_PROJECT = os.environ.get("EVAL_QASE_PROJECT", "UPT")


# =============================================================
# QUALITY GATE THRESHOLDS
# =============================================================

# Минимально допустимый процент успешно пройденных Eval Cases.
MIN_PASS_RATE = 95.0

# Минимально допустимый процент выполненных Expected Properties.
MIN_EXPECTED_PROPERTIES_PASS_RATE = 95.0

# Максимально допустимый процент нарушенных Forbidden Behavior.
MAX_FORBIDDEN_BEHAVIOR_VIOLATION_RATE = 0.0

# Допустимое количество технических ошибок.
MAX_ERRORS = 0


# =============================================================
# ИДЕНТИФИКАТОР ЗАПУСКА
# =============================================================

# Каждый запуск получает собственный run_id. Он передаётся
# агенту в промпте, чтобы агент создавал новый артефактный
# каталог и не продолжал прерванные прогоны IN_PROGRESS.
RUN_ID = (
    os.environ.get("EVAL_RUN_ID")
    or "RUN-"
    + datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
)

RUN_STARTED_AT = datetime.now(timezone.utc)


# =============================================================
# УПРАВЛЕНИЕ ПРОЦЕССОМ OPENCODE
# =============================================================

def kill_process_tree(pid):

    # На Windows opencode запускается через cmd.exe-обёртку.
    # Остановка одного PID оставляет живым реальный процесс,
    # поэтому убиваем всё дерево процессов (taskkill /T /F).
    if os.name == "nt":

        subprocess.run(
            ["taskkill", "/PID", str(pid), "/T", "/F"],
            capture_output=True,
            text=True
        )

    else:

        try:
            os.kill(pid, 9)
        except ProcessLookupError:
            pass


def run_opencode(command, timeout_seconds):

    # Запуск через Popen + потоки вместо subprocess.run:
    # 1) события печатаются вживую, а не после завершения;
    # 2) таймаут реально останавливает процесс (taskkill /T);
    # 3) stdout не накапливается целиком в памяти.

    started_at = time.monotonic()

    process = subprocess.Popen(
        command,
        cwd=project_path,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
        bufsize=1
    )

    text_parts = []
    stderr_lines = []

    def read_stdout():

        for line in process.stdout:

            line = line.strip()

            if not line:
                continue

            try:

                event = json.loads(line)

            except json.JSONDecodeError:
                continue

            event_type = event.get("type")

            print(
                "AGENT EVENT:",
                event_type,
                flush=True
            )

            if event_type == "text":

                text = event.get(
                    "part",
                    {}
                ).get("text")

                if text:
                    text_parts.append(text)

    def read_stderr():

        for line in process.stderr:
            stderr_lines.append(line.rstrip())

    stdout_thread = threading.Thread(
        target=read_stdout,
        daemon=True
    )

    stderr_thread = threading.Thread(
        target=read_stderr,
        daemon=True
    )

    stdout_thread.start()
    stderr_thread.start()

    timed_out = False

    while process.poll() is None:

        if time.monotonic() - started_at > timeout_seconds:

            timed_out = True

            print(
                f"QA Agent превысил таймаут "
                f"{timeout_seconds} секунд. "
                f"Останавливаю дерево процессов.",
                flush=True
            )

            kill_process_tree(process.pid)

            break

        time.sleep(1)

    process.wait()

    stdout_thread.join(timeout=30)
    stderr_thread.join(timeout=30)

    return {
        "return_code": process.returncode,
        "text_parts": text_parts,
        "stderr": "\n".join(stderr_lines).strip(),
        "timed_out": timed_out,
        "duration": round(
            time.monotonic() - started_at,
            1
        )
    }


def truncate_middle(text, limit):

    # Обрезка с сохранением начала и конца.
    # Начало содержит заголовок, метаданные и статус
    # артефакта, конец — итоговые разделы, трассировку
    # и сводки. Обрезка только начала теряла бы их.

    if limit <= 0:

        return ""

    if len(text) <= limit:

        return text

    marker = "\n\n... [ПРОПУЩЕНА СЕРЕДИНА ФАЙЛА] ...\n\n"

    keep = max(limit - len(marker), 0)

    head_chars = keep // 2
    tail_chars = keep - head_chars

    return text[:head_chars] + marker + text[len(text) - tail_chars:]


def collect_evidence(run_id, max_file_chars=120000, max_total_chars=400000):

    # Собирает артефакты прогона для передачи judge.
    # Артефакты — фактические результаты работы агента;
    # по ним judge может проверить Expected Properties.

    run_dir = (
        project_path
        / ".opencode"
        / "artifacts"
        / run_id
    )

    if not run_dir.is_dir():

        return "Артефакты прогона не найдены."

    def priority(file):

        name = file.name

        if name in ("run-manifest.json", "created-entities.json"):
            return 0

        if name.startswith("requirement-review"):
            return 1

        if name.startswith("jira-tasks"):
            return 2

        if name.startswith("test-model"):
            return 3

        return 4

    files = sorted(
        run_dir.glob("*"),
        key=lambda item: (priority(item), item.name)
    )

    chunks = []
    used_chars = 0

    for file in files:

        if not file.is_file():
            continue

        text = file.read_text(
            encoding="utf-8",
            errors="replace"
        ).strip()

        if not text:
            continue

        if len(text) > max_file_chars:

            text = truncate_middle(text, max_file_chars)

            text += (
                f"\n... [ФАЙЛ ОБРЕЗАН: {file.name}, "
                f"исходный размер {file.stat().st_size} байт]"
            )

        if used_chars + len(text) > max_total_chars:

            chunk = max_total_chars - used_chars

            if chunk <= 0:
                break

            text = truncate_middle(text, chunk)

            text += "\n... [СУММАРНЫЙ ЛИМИТ ДОСТИГНУТ]"

        chunks.append(
            f"### ФАЙЛ: {file.name}\n\n{text}"
        )

        used_chars += len(text)

    if not chunks:

        return "Артефакты прогона не найдены."

    return "\n\n---\n\n".join(chunks)


# =============================================================
# ЗАГРУЗКА GOLDEN DATASET
# =============================================================

with open(
    dataset_path,
    "r",
    encoding="utf-8"
) as file:

    eval_cases = json.load(file)


eval_results = []


# =============================================================
# ОТБОР EVAL CASES ДЛЯ ПРОГОНА
# =============================================================

# Пока прогоняется только один этап. Остальные кейсы
# требуют отдельных запусков агента и в этот прогон не входят.

selected_cases = [
    eval_case
    for eval_case in eval_cases
    if eval_case["input"].get("stage") == RUN_STAGE
]


if not selected_cases:

    raise RuntimeError(
        f"В датасете нет кейсов для этапа {RUN_STAGE}."
    )


print()
print("=" * 80)
print(f"Eval-стадия: {RUN_STAGE}")
print(f"Кейсов в прогоне: {len(selected_cases)}")
print(
    f"Всего кейсов в датасете: {len(eval_cases)} "
    f"(остальные пропущены)"
)
print("=" * 80)


# =============================================================
# ГРУППИРОВКА EVAL CASES ПО СТРАНИЦЕ CONFLUENCE
# =============================================================

cases_by_page = {}


for eval_case in selected_cases:

    eval_input = eval_case["input"]

    source = eval_input.get("source")


    if source != "confluence":

        raise RuntimeError(
            f"Eval Case {eval_case['id']} использует "
            f"неподдерживаемый источник: {source}"
        )


    try:

        page_id = resolve_case_page_id(
            eval_case,
            project_path
        )

    except SourceRefError as error:

        raise RuntimeError(
            f"Eval Case {eval_case['id']}: {error}"
        ) from error


    if page_id not in cases_by_page:

        cases_by_page[page_id] = []


    cases_by_page[page_id].append(
        eval_case
    )


# =============================================================
# ЗАПУСК QA AGENT
# =============================================================

for page_id, page_eval_cases in cases_by_page.items():

    print()
    print("=" * 80)
    print("ЗАПУСК QA AGENT")
    print("=" * 80)

    print()
    print("Источник требований: Confluence")
    print(f"pageId: {page_id}")

    print(
        f"Количество Eval Cases для этой страницы: "
        f"{len(page_eval_cases)}"
    )

    print()


    # =========================================================
    # PROMPT ДЛЯ QA AGENT
    # =========================================================

    # Runner передаёт агенту только исходную задачу.
    #
    # Expected Properties и Forbidden Behavior
    # агенту не передаются.
    #
    # Focus берётся из input кейсов этого этапа и
    # указывает, какие пункты ТЗ проверяются.

    focus_items = []


    for eval_case in page_eval_cases:

        focus = eval_case["input"].get("focus")

        if focus and focus not in focus_items:

            focus_items.append(focus)


    focus_text = "; ".join(focus_items)


    prompt = (
        f"Начни новый запуск с идентификатором "
        f"run_id={RUN_ID}. "
        f"Создай новый каталог "
        f".opencode/artifacts/{RUN_ID}/ "
        f"и сохраняй все артефакты только в него. "
        f"Не продолжай и не используй артефакты "
        f"других запусков, включая прогоны со статусом "
        f"IN_PROGRESS. "
        f"Получи требования из Confluence "
        f"со страницы pageId={page_id} "
        f"и выполни полный цикл: ревью требований, "
        f"проектирование задач, тестовую модель, "
        f"создание задач в Jira и кейсов в Qase, "
        f"итоговый отчёт. "
        f"Особое внимание удели пунктам ТЗ: {focus_text}. "
        f"Для записи используй только тестовые проекты: "
        f"Jira project {JIRA_PROJECT}, Qase project {QASE_PROJECT}. "
        f"Не создавай, не изменяй и не удаляй сущности "
        f"в других проектах."
    )


    # =========================================================
    # ЗАПУСК OPENCODE
    # =========================================================

    print(
        "QA Agent запущен...",
        flush=True
    )

    try:

        agent_run = run_opencode(
            [
                OPENCODE_BIN,
                "run",
                "--agent",
                AGENT_NAME,
                "--model",
                AGENT_MODEL,
                "--format",
                "json",
                prompt
            ],
            AGENT_TIMEOUT
        )

    except FileNotFoundError as error:

        raise RuntimeError(
            "Команда opencode не найдена в PATH."
        ) from error


    text_parts = agent_run["text_parts"]

    return_code = agent_run["return_code"]

    timed_out = agent_run["timed_out"]


    print()

    print(
        "QA AGENT DURATION:",
        agent_run["duration"],
        "секунд"
    )


    # =========================================================
    # ОБРАБОТКА ТАЙМАУТА
    # =========================================================

    if timed_out:

        print(
            f"QA Agent остановлен по таймауту "
            f"{AGENT_TIMEOUT} секунд."
        )


        for eval_case in page_eval_cases:

            eval_results.append(
                {
                    "id": eval_case["id"],
                    "name": eval_case["name"],
                    "status": "ERROR",
                    "score": 0.0,
                    "expected_properties": [],
                    "forbidden_behavior": []
                }
            )


        continue


    # =========================================================
    # ЗАВЕРШЕНИЕ QA AGENT
    # =========================================================

    agent_response = "\n".join(
        text_parts
    ).strip()


    print()

    print(
        "QA AGENT RETURN CODE:",
        return_code
    )


    # =========================================================
    # ОБРАБОТКА ОШИБКИ QA AGENT
    # =========================================================

    if return_code != 0:

        print(
            "QA Agent завершился с ошибкой."
        )


        stderr = agent_run["stderr"]


        if stderr:

            print(stderr)


        print(
            "STDOUT (последние события):",
            "\n".join(text_parts)[-2000:]
        )


        for eval_case in page_eval_cases:

            eval_results.append(
                {
                    "id": eval_case["id"],
                    "name": eval_case["name"],
                    "status": "ERROR",
                    "score": 0.0,
                    "expected_properties": [],
                    "forbidden_behavior": []
                }
            )


        continue


    # =========================================================
    # ПРОВЕРКА ПУСТОГО ОТВЕТА
    # =========================================================

    if not agent_response:

        print(
            "QA Agent не вернул "
            "текстовый ответ."
        )


        for eval_case in page_eval_cases:

            eval_results.append(
                {
                    "id": eval_case["id"],
                    "name": eval_case["name"],
                    "status": "ERROR",
                    "score": 0.0,
                    "expected_properties": [],
                    "forbidden_behavior": []
                }
            )


        continue


    # =========================================================
    # ВЫВОД ОТВЕТА QA AGENT
    # =========================================================

    print()
    print("=" * 80)
    print("ОТВЕТ QA AGENT")
    print("=" * 80)

    print(agent_response)

    print("=" * 80)


    # =========================================================
    # EVALUATION
    # =========================================================

    # Один фактический Agent Response
    # проверяется всеми Eval Cases этой страницы.

    # Judge получает не только финальный текст, но и
    # артефакты прогона: по ним проверяются критерии,
    # относящиеся к содержимому Requirement Review,
    # задачам Jira и тестовой модели.

    evidence = collect_evidence(RUN_ID)


    print()

    print(
        f"Артефакты для judge: "
        f"{len(evidence)} символов"
    )


    for eval_case in page_eval_cases:

        print()
        print()

        print("-" * 80)

        print(
            f"Evaluation: "
            f"{eval_case['id']}"
        )

        print(
            f"Название: "
            f"{eval_case['name']}"
        )

        print("-" * 80)

        print()
        print("Запускаем Evaluator...")


        try:

            evaluation_result = evaluate_response(
                eval_case,
                agent_response,
                evidence
            )


            print()
            print("=" * 80)
            print("РЕЗУЛЬТАТ EVALUATION")
            print("=" * 80)


            print(
                json.dumps(
                    evaluation_result,
                    ensure_ascii=False,
                    indent=2
                )
            )


            print("=" * 80)


            status = evaluation_result[
                "status"
            ]

            score = evaluation_result[
                "score"
            ]


            eval_results.append(
                {
                    "id": eval_case["id"],
                    "name": eval_case["name"],
                    "status": status,
                    "score": score,

                    "expected_properties":
                        evaluation_result[
                            "expected_properties"
                        ],

                    "forbidden_behavior":
                        evaluation_result[
                            "forbidden_behavior"
                        ]
                }
            )


            print()

            print(
                "EVAL CASE:",
                eval_case["id"]
            )

            print(
                "STATUS:",
                status
            )

            print(
                "SCORE:",
                score
            )


        except Exception as error:

            print()
            print("Ошибка Evaluator:")
            print(error)


            eval_results.append(
                {
                    "id": eval_case["id"],
                    "name": eval_case["name"],
                    "status": "ERROR",
                    "score": 0.0,
                    "expected_properties": [],
                    "forbidden_behavior": []
                }
            )


# =============================================================
# EVALUATION SUMMARY
# =============================================================

print()
print()

print("=" * 80)
print("EVALUATION SUMMARY")
print("=" * 80)


# =============================================================
# BASIC METRICS
# =============================================================

total = len(eval_results)


passed = sum(
    1
    for result in eval_results
    if result["status"] == "PASS"
)


failed = sum(
    1
    for result in eval_results
    if result["status"] == "FAIL"
)


errors = sum(
    1
    for result in eval_results
    if result["status"] == "ERROR"
)


# =============================================================
# PASS RATE
# =============================================================

# ERROR означает, что кейс не был оценён (агент упал,
# таймаут или ошибка judge). Такие кейсы исключаются из
# знаменателя Pass Rate; за ними остаётся отдельный
# критерий Quality Gate errors.
#
# Если оценённых кейсов нет, Pass Rate не вычислялся —
# в отчёте это null, а не «0% качества агента».

evaluated_results = [
    result
    for result in eval_results
    if result["status"] in ("PASS", "FAIL")
]

evaluated_total = len(evaluated_results)


if evaluated_total > 0:

    pass_rate = (
        passed / evaluated_total
    ) * 100

else:

    pass_rate = None


pass_rate_display = (
    f"{pass_rate:.1f}%"
    if pass_rate is not None
    else "n/a"
)


# =============================================================
# AVERAGE SCORE
# =============================================================

if evaluated_total > 0:

    average_score = (
        sum(
            result["score"]
            for result in evaluated_results
        )
        / evaluated_total
    )

else:

    average_score = 0.0


# =============================================================
# EXPECTED PROPERTIES PASS RATE
# =============================================================

total_expected_properties = 0

passed_expected_properties = 0


for result in eval_results:

    expected_properties = result.get(
        "expected_properties",
        []
    )


    for expected_property in expected_properties:

        total_expected_properties += 1


        if expected_property.get(
            "passed"
        ) is True:

            passed_expected_properties += 1


if total_expected_properties > 0:

    expected_properties_pass_rate = (
        passed_expected_properties
        / total_expected_properties
    ) * 100

else:

    expected_properties_pass_rate = 0.0


# =============================================================
# FORBIDDEN BEHAVIOR VIOLATION RATE
# =============================================================

total_forbidden_behaviors = 0

violated_forbidden_behaviors = 0


for result in eval_results:

    forbidden_behaviors = result.get(
        "forbidden_behavior",
        []
    )


    for forbidden_behavior in forbidden_behaviors:

        total_forbidden_behaviors += 1


        if forbidden_behavior.get(
            "violated"
        ) is True:

            violated_forbidden_behaviors += 1


if total_forbidden_behaviors > 0:

    forbidden_behavior_violation_rate = (
        violated_forbidden_behaviors
        / total_forbidden_behaviors
    ) * 100

else:

    forbidden_behavior_violation_rate = 0.0


# =============================================================
# BASIC METRICS OUTPUT
# =============================================================

print()

print(
    f"Total:         {total}"
)

print(
    f"Passed:        {passed}"
)

print(
    f"Failed:        {failed}"
)

print(
    f"Errors:        {errors}"
)

print(
    f"Pass Rate:     "
    f"{pass_rate_display}"
)

print(
    f"Average Score: "
    f"{average_score:.2f}"
)


# =============================================================
# QUALITY METRICS OUTPUT
# =============================================================

print()

print("QUALITY METRICS")

print("-" * 80)


print(
    f"Expected Properties:                 "
    f"{passed_expected_properties}/"
    f"{total_expected_properties}"
)


print(
    f"Expected Properties Pass Rate:       "
    f"{expected_properties_pass_rate:.1f}%"
)


print(
    f"Forbidden Behaviors Violated:        "
    f"{violated_forbidden_behaviors}/"
    f"{total_forbidden_behaviors}"
)


print(
    f"Forbidden Behavior Violation Rate:   "
    f"{forbidden_behavior_violation_rate:.1f}%"
)


# =============================================================
# РЕЗУЛЬТАТЫ ПО КАЖДОМУ EVAL CASE
# =============================================================

print()

print("-" * 80)


for result in eval_results:

    print(
        f"{result['id']:<10}"
        f"{result['status']:<10}"
        f"Score: {result['score']}"
    )


print("-" * 80)


# =============================================================
# QUALITY GATE
# =============================================================

# Теперь решение о допуске принимается
# на основании измеримых метрик.


# -------------------------------------------------------------
# ПРОВЕРКА PASS RATE
# -------------------------------------------------------------

pass_rate_gate = (
    pass_rate is not None
    and pass_rate >= MIN_PASS_RATE
)


# -------------------------------------------------------------
# ПРОВЕРКА EXPECTED PROPERTIES
# -------------------------------------------------------------

expected_properties_gate = (
    expected_properties_pass_rate
    >= MIN_EXPECTED_PROPERTIES_PASS_RATE
)


# -------------------------------------------------------------
# ПРОВЕРКА FORBIDDEN BEHAVIOR
# -------------------------------------------------------------

forbidden_behavior_gate = (
    forbidden_behavior_violation_rate
    <= MAX_FORBIDDEN_BEHAVIOR_VIOLATION_RATE
)


# -------------------------------------------------------------
# ПРОВЕРКА ERRORS
# -------------------------------------------------------------

errors_gate = (
    errors
    <= MAX_ERRORS
)


# =============================================================
# OVERALL QUALITY GATE
# =============================================================

quality_gate_passed = all(
    [
        pass_rate_gate,
        expected_properties_gate,
        forbidden_behavior_gate,
        errors_gate
    ]
)


if quality_gate_passed:

    overall_status = "PASS"

else:

    overall_status = "FAIL"


# =============================================================
# QUALITY GATE OUTPUT
# =============================================================

print()
print("=" * 80)
print("QUALITY GATE")
print("=" * 80)


print()

print(
    f"Pass Rate >= {MIN_PASS_RATE:.1f}%: "
    f"{'PASS' if pass_rate_gate else 'FAIL'} "
    f"(actual: {pass_rate_display})"
)


print(
    f"Expected Properties >= "
    f"{MIN_EXPECTED_PROPERTIES_PASS_RATE:.1f}%: "
    f"{'PASS' if expected_properties_gate else 'FAIL'} "
    f"(actual: {expected_properties_pass_rate:.1f}%)"
)


print(
    f"Forbidden Behavior <= "
    f"{MAX_FORBIDDEN_BEHAVIOR_VIOLATION_RATE:.1f}%: "
    f"{'PASS' if forbidden_behavior_gate else 'FAIL'} "
    f"(actual: {forbidden_behavior_violation_rate:.1f}%)"
)


print(
    f"Errors <= {MAX_ERRORS}: "
    f"{'PASS' if errors_gate else 'FAIL'} "
    f"(actual: {errors})"
)


print()
print(
    "QUALITY GATE STATUS:",
    overall_status
)

print("=" * 80)


# =============================================================
# СОХРАНЕНИЕ РЕЗУЛЬТАТОВ
# =============================================================

results_dir = (
    Path(__file__).parent
    / "results"
)


results_dir.mkdir(
    parents=True,
    exist_ok=True
)


report = {

    # ---------------------------------------------------------
    # RUN CONTEXT
    # ---------------------------------------------------------

    "run": {
        "run_id": RUN_ID,
        "stage": RUN_STAGE,
        "agent": AGENT_NAME,
        "model": AGENT_MODEL,
        "judge_agent": "eval-judge",
        "jira_project": JIRA_PROJECT,
        "qase_project": QASE_PROJECT,
        "skipped_cases": len(eval_cases) - len(selected_cases),
        "started_at": RUN_STARTED_AT.isoformat(),
        "finished_at": datetime.now(timezone.utc).isoformat()
    },


    # ---------------------------------------------------------
    # SUMMARY
    # ---------------------------------------------------------

    "summary": {

        "total": total,

        "evaluated": evaluated_total,

        "passed": passed,

        "failed": failed,

        "errors": errors,

        "pass_rate": (
            round(pass_rate, 1)
            if pass_rate is not None
            else None
        ),

        "average_score": round(
            average_score,
            2
        ),

        "expected_properties_pass_rate": round(
            expected_properties_pass_rate,
            1
        ),

        "forbidden_behavior_violation_rate": round(
            forbidden_behavior_violation_rate,
            1
        ),

        "overall_status": overall_status
    },


    # ---------------------------------------------------------
    # METRICS
    # ---------------------------------------------------------

    "metrics": {

        "expected_properties": {

            "total":
                total_expected_properties,

            "passed":
                passed_expected_properties,

            "pass_rate": round(
                expected_properties_pass_rate,
                1
            )
        },


        "forbidden_behavior": {

            "total":
                total_forbidden_behaviors,

            "violated":
                violated_forbidden_behaviors,

            "violation_rate": round(
                forbidden_behavior_violation_rate,
                1
            )
        }
    },


    # ---------------------------------------------------------
    # QUALITY GATE
    # ---------------------------------------------------------

    "quality_gate": {

        "status": overall_status,

        "criteria": {

            "pass_rate": {
                "threshold": MIN_PASS_RATE,
                "actual": (
                    round(pass_rate, 1)
                    if pass_rate is not None
                    else None
                ),
                "passed": pass_rate_gate
            },

            "expected_properties_pass_rate": {
                "threshold":
                    MIN_EXPECTED_PROPERTIES_PASS_RATE,

                "actual": round(
                    expected_properties_pass_rate,
                    1
                ),

                "passed":
                    expected_properties_gate
            },

            "forbidden_behavior_violation_rate": {
                "threshold":
                    MAX_FORBIDDEN_BEHAVIOR_VIOLATION_RATE,

                "actual": round(
                    forbidden_behavior_violation_rate,
                    1
                ),

                "passed":
                    forbidden_behavior_gate
            },

            "errors": {
                "threshold": MAX_ERRORS,
                "actual": errors,
                "passed": errors_gate
            }
        }
    },


    # ---------------------------------------------------------
    # EVAL CASE RESULTS
    # ---------------------------------------------------------

    "results": eval_results
}


# =============================================================
# ЗАПИСЬ JSON
# =============================================================

results_file = (
    results_dir
    / "eval_results.json"
)


with open(
    results_file,
    "w",
    encoding="utf-8"
) as file:

    json.dump(
        report,
        file,
        ensure_ascii=False,
        indent=2
    )


# =============================================================
# ЗАПИСЬ MARKDOWN-ОТЧЁТА
# =============================================================

markdown_file = (
    results_dir
    / "eval_report.md"
)


lines = [
    "# Eval Report",
    "",
    "## Контекст",
    "",
    "| Параметр | Значение |",
    "|---|---|",
    f"| run_id | `{RUN_ID}` |",
    f"| Стадия | `{RUN_STAGE}` |",
    f"| Агент | `{AGENT_NAME}` |",
    f"| Модель | `{AGENT_MODEL}` |",
    f"| Jira project | `{JIRA_PROJECT}` |",
    f"| Qase project | `{QASE_PROJECT}` |",
    f"| Кейсов в прогоне | {total} |",
    f"| Оценено кейсов | {evaluated_total} |",
    f"| Пропущено кейсов | {len(eval_cases) - len(selected_cases)} |",
    "",
    "## Quality Gate",
    "",
    f"**{overall_status}**",
    "",
    "| Критерий | Порог | Факт | Результат |",
    "|---|---|---|---|",
    f"| Pass Rate | >= {MIN_PASS_RATE:.1f}% | {pass_rate_display} | "
    f"{'PASS' if pass_rate_gate else 'FAIL'} |",
    f"| Expected Properties | >= {MIN_EXPECTED_PROPERTIES_PASS_RATE:.1f}% | "
    f"{expected_properties_pass_rate:.1f}% | "
    f"{'PASS' if expected_properties_gate else 'FAIL'} |",
    f"| Forbidden Behavior | <= {MAX_FORBIDDEN_BEHAVIOR_VIOLATION_RATE:.1f}% | "
    f"{forbidden_behavior_violation_rate:.1f}% | "
    f"{'PASS' if forbidden_behavior_gate else 'FAIL'} |",
    f"| Errors | <= {MAX_ERRORS} | {errors} | "
    f"{'PASS' if errors_gate else 'FAIL'} |",
    "",
    "## Кейсы",
    "",
    "| Eval Case | Статус | Score |",
    "|---|---|---|"
]


for result in eval_results:

    lines.append(
        f"| `{result['id']}` {result['name']} | "
        f"{result['status']} | {result['score']} |"
    )


with open(
    markdown_file,
    "w",
    encoding="utf-8"
) as file:

    file.write("\n".join(lines) + "\n")


print()

print(
    f"Результаты сохранены: "
    f"{results_file}"
)

print(
    f"Отчёт сохранён: "
    f"{markdown_file}"
)


# =============================================================
# EXIT CODE
# =============================================================

# Ненулевой код нужен, чтобы Quality Gate работал в CI.
import sys

sys.exit(0 if quality_gate_passed else 1)