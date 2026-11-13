/**
 * Проверки трассировки: REQ → BR/AC → TASK → TC.
 */

import { matchIds } from "../markdown.mjs"
import { ID_PATTERNS } from "../model.mjs"

const ISSUE_TYPES = new Set([
    "Epic", "Task", "Story", "Bug", "Sub-task", "Subtask",
    "Эпик", "История", "Задача", "Баг", "Subtask",
    "NEEDS_PROJECT_CONTEXT"
])

const PRIORITIES = new Set(["HIGH", "MEDIUM", "LOW", "NEEDS_HUMAN_DECISION"])
const TC_TYPES = new Set(["positive", "negative", "boundary", "risk-based"])

const REQUIRED_TASK_FIELDS = [
    "Summary",
    "Issue Type",
    "Description",
    "Source Requirements",
    "Acceptance Criteria",
    "Dependencies",
    "Priority (design)",
    "Traceability"
]

const REQUIRED_TC_FIELDS = [
    "Title",
    "Type",
    "Priority (design)",
    "Source Requirement",
    "Preconditions",
    "Steps / Test Intent",
    "Expected Result"
]

const norm = (value) => String(value ?? "").trim()

export function checkRequirementReview(c, rr) {
    const stage = "requirement-review"
    if (!rr) return

    const reqIds = new Set(rr.ids.req)
    const brIds = new Set(rr.ids.br)
    const acIds = new Set(rr.ids.ac)
    const srcIds = new Set(rr.ids.src)

    // 1. Каждый REQ присутствует в Traceability
    const traced = new Set(rr.trace.map((row) => row.req))
    const untraced = [...reqIds].filter((id) => !traced.has(id))
    c.assert(
        untraced.length === 0,
        stage,
        "TR-RR-TRACEABILITY-FULL",
        "Каждое требование присутствует в Traceability",
        `Без строки трассировки: ${untraced.join(", ")}`,
        untraced
    )

    // 2. Ссылки из Traceability существуют
    const unknownRefs = []
    for (const row of rr.trace) {
        for (const br of matchIds(row.brs, ID_PATTERNS.br)) {
            if (!brIds.has(br)) unknownRefs.push(`${row.req} → ${br}`)
        }
        for (const ac of matchIds(row.acs, ID_PATTERNS.ac)) {
            if (!acIds.has(ac)) unknownRefs.push(`${row.req} → ${ac}`)
        }
    }
    c.assert(
        unknownRefs.length === 0,
        stage,
        "TR-RR-REF-INTEGRITY",
        "Ссылки Traceability ведут на существующие BR и AC",
        `Несуществующие ссылки: ${unknownRefs.join(", ")}`,
        unknownRefs
    )

    // 3. Source References у требований
    if (srcIds.size > 0) {
        const missingSource = []
        const unknownSource = []
        for (const req of rr.requirements) {
            const refs = matchIds(req.source, ID_PATTERNS.src)
            if (refs.length === 0) missingSource.push(req.id)
            for (const ref of refs) if (!srcIds.has(ref)) unknownSource.push(`${req.id} → ${ref}`)
        }
        c.assert(
            missingSource.length === 0,
            stage,
            "TR-RR-SOURCE-PRESENT",
            "Каждое требование ссылается на источник",
            `Без источника: ${missingSource.join(", ")}`,
            missingSource
        )
        c.assert(
            unknownSource.length === 0,
            stage,
            "TR-RR-SOURCE-EXISTS",
            "Ссылки на источник существуют в Source References",
            `Несуществующие источники: ${unknownSource.join(", ")}`,
            unknownSource
        )
    } else {
        c.skip(stage, "TR-RR-SOURCE-PRESENT", "Ссылки на источник", "Секция Source References пуста")
    }

    // 4. У каждого AC есть хотя бы одно требование (предупреждение)
    const referencedAc = new Set()
    for (const row of rr.trace) for (const ac of matchIds(row.acs, ID_PATTERNS.ac)) referencedAc.add(ac)
    const orphanAc = [...acIds].filter((id) => !referencedAc.has(id))

    if (orphanAc.length === 0) {
        c.pass(stage, "TR-RR-AC-REFERENCED", "Каждый AC привязан к требованию")
    } else {
        c.warn(stage, "TR-RR-AC-REFERENCED", "Каждый AC привязан к требованию", `Без привязки: ${orphanAc.join(", ")}`, orphanAc)
    }
}

export function checkJiraTasks(c, jira, rr) {
    const stage = "jira-tasks"
    if (!jira) return

    const taskIds = new Set(jira.tasks.map((t) => t.id))
    const rrReqs = rr ? new Set(rr.ids.req) : null
    const rrAcs = rr ? new Set(rr.ids.ac) : null

    // 1. Поля задач
    const fieldProblems = []
    for (const task of jira.tasks) {
        for (const field of REQUIRED_TASK_FIELDS) {
            if (!norm(task.fields.get(field))) fieldProblems.push(`${task.id}: ${field}`)
        }
        // Acceptance Criteria допускает «AC: MISSING»
        const ac = norm(task.fields.get("Acceptance Criteria"))
        if (!ac) fieldProblems.push(`${task.id}: Acceptance Criteria`)
    }
    c.assert(
        fieldProblems.length === 0,
        stage,
        "TR-JIRA-TASK-FIELDS",
        "Все обязательные поля задач заполнены",
        `Пустые поля: ${fieldProblems.join("; ")}`,
        fieldProblems
    )

    // 2. Issue Type
    const badTypes = jira.tasks
        .map((t) => ({ id: t.id, type: norm(t.fields.get("Issue Type")) }))
        .filter((t) => !ISSUE_TYPES.has(t.type))
    c.assert(
        badTypes.length === 0,
        stage,
        "TR-JIRA-ISSUE-TYPE-VALID",
        "Issue Type из допустимого набора",
        `Недопустимые типы: ${badTypes.map((t) => `${t.id}=${t.type || "—"}`).join(", ")}`,
        badTypes.map((t) => `${t.id}=${t.type || "—"}`)
    )

    // 3. Priority (design)
    const badPriorities = jira.tasks
        .map((t) => ({ id: t.id, value: norm(t.fields.get("Priority (design)")).toUpperCase() }))
        .filter((t) => !PRIORITIES.has(t.value))
    c.assert(
        badPriorities.length === 0,
        stage,
        "TR-JIRA-PRIORITY-VALID",
        "Priority (design) из допустимого набора",
        `Недопустимые значения: ${badPriorities.map((t) => `${t.id}=${t.value || "—"}`).join(", ")}`,
        badPriorities.map((t) => `${t.id}=${t.value || "—"}`)
    )

    // 4. Ссылки задач на REQ и AC
    if (rrReqs) {
        const unknownReq = []
        const unknownAc = []
        for (const task of jira.tasks) {
            for (const req of matchIds(task.fields.get("Source Requirements"), ID_PATTERNS.req)) {
                if (!rrReqs.has(req)) unknownReq.push(`${task.id} → ${req}`)
            }
            for (const ac of matchIds(task.fields.get("Acceptance Criteria"), ID_PATTERNS.ac)) {
                if (!rrAcs.has(ac)) unknownAc.push(`${task.id} → ${ac}`)
            }
        }
        c.assert(
            unknownReq.length === 0,
            stage,
            "TR-JIRA-TASK-REQ-EXISTS",
            "Задачи ссылаются на существующие требования",
            `Несуществующие REQ: ${unknownReq.join(", ")}`,
            unknownReq
        )
        c.assert(
            unknownAc.length === 0,
            stage,
            "TR-JIRA-TASK-AC-EXISTS",
            "Задачи ссылаются на существующие AC",
            `Несуществующие AC: ${unknownAc.join(", ")}`,
            unknownAc
        )
    } else {
        c.skip(stage, "TR-JIRA-TASK-REQ-EXISTS", "Ссылки задач на требования", "Requirement Review недоступен")
        c.skip(stage, "TR-JIRA-TASK-AC-EXISTS", "Ссылки задач на AC", "Requirement Review недоступен")
    }

    // 5. Покрытие требований задачами
    if (rrReqs) {
        const coveredReqs = new Set(jira.coverage.map((row) => row.req).filter(Boolean))
        const uncovered = [...rrReqs].filter((id) => !coveredReqs.has(id))
        c.assert(
            uncovered.length === 0,
            stage,
            "TR-JIRA-COVERAGE-ALL-REQ",
            "Каждое требование присутствует в Coverage",
            `Нет строки покрытия: ${uncovered.join(", ")}`,
            uncovered
        )
    } else {
        c.skip(stage, "TR-JIRA-COVERAGE-ALL-REQ", "Покрытие требований", "Requirement Review недоступен")
    }

    // 6. Согласованность Covereded ↔ TASK ID
    const badCoverage = []
    for (const row of jira.coverage) {
        const flag = norm(row.covered).toUpperCase()
        const tasks = matchIds(row.task, ID_PATTERNS.task)

        if (!["YES", "NO"].includes(flag)) {
            badCoverage.push(`${row.req}: Covered=${row.covered || "—"}`)
            continue
        }
        if (flag === "YES") {
            if (tasks.length === 0) badCoverage.push(`${row.req}: YES без TASK ID`)
            for (const t of tasks) if (!taskIds.has(t)) badCoverage.push(`${row.req}: неизвестная задача ${t}`)
        }
    }
    c.assert(
        badCoverage.length === 0,
        stage,
        "TR-JIRA-COVERAGE-CONSISTENCY",
        "Coverage согласован с перечнем задач",
        `Проблемы: ${badCoverage.join("; ")}`,
        badCoverage
    )

    // 7. Поле Traceability внутри задачи
    const badTrace = jira.tasks.filter((t) => {
        const value = norm(t.fields.get("Traceability"))
        return !value.includes(t.id)
    })
    c.assert(
        badTrace.length === 0,
        stage,
        "TR-JIRA-TASK-TRACEABILITY",
        "Поле Traceability содержит собственный TASK ID",
        `Нарушения: ${badTrace.map((t) => t.id).join(", ")}`,
        badTrace.map((t) => t.id)
    )
}

export function checkTestModel(c, tests, rr) {
    const stage = "test-model"
    if (!tests) return

    const rrReqs = rr ? new Set(rr.ids.req) : null
    const rrRisks = rr ? new Set(rr.ids.risk) : null

    // 1. Поля сценариев
    const missingFields = []
    for (const tc of tests.cases) {
        for (const field of REQUIRED_TC_FIELDS) {
            if (!norm(tc.fields.get(field))) missingFields.push(`${tc.id}: ${field}`)
        }
    }
    c.assert(
        missingFields.length === 0,
        stage,
        "TR-TEST-FIELDS",
        "Все обязательные поля сценариев заполнены",
        `Пустые поля: ${missingFields.join("; ")}`,
        missingFields
    )

    // 2. Type
    const badTypes = tests.cases
        .map((tc) => ({ id: tc.id, value: norm(tc.fields.get("Type")).toLowerCase() }))
        .filter((tc) => !TC_TYPES.has(tc.value))
    c.assert(
        badTypes.length === 0,
        stage,
        "TR-TEST-TYPE-VALID",
        "Type сценария из допустимого набора",
        `Недопустимые типы: ${badTypes.map((t) => `${t.id}=${t.value || "—"}`).join(", ")}`,
        badTypes.map((t) => `${t.id}=${t.value || "—"}`)
    )

    // 3. Priority (design)
    const badPriorities = tests.cases
        .map((tc) => ({ id: tc.id, value: norm(tc.fields.get("Priority (design)")).toUpperCase() }))
        .filter((tc) => !PRIORITIES.has(tc.value))
    c.assert(
        badPriorities.length === 0,
        stage,
        "TR-TEST-PRIORITY-VALID",
        "Priority (design) сценария из допустимого набора",
        `Недопустимые значения: ${badPriorities.map((t) => `${t.id}=${t.value || "—"}`).join(", ")}`,
        badPriorities.map((t) => `${t.id}=${t.value || "—"}`)
    )

    // 4. Expected Result определён
    const undefinedExpected = tests.cases
        .map((tc) => ({ id: tc.id, value: norm(tc.fields.get("Expected Result")) }))
        .filter((tc) => !tc.value)
    c.assert(
        undefinedExpected.length === 0,
        stage,
        "TR-TEST-EXPECTED-RESULT",
        "Expected Result определён для каждого сценария",
        `Без ожидаемого результата: ${undefinedExpected.map((t) => t.id).join(", ")}`,
        undefinedExpected.map((t) => t.id)
    )

    // 5. Ожидания, зависящие от нерешённых вопросов — предупреждение
    const uncertain = tests.cases
        .map((tc) => ({ id: tc.id, value: norm(tc.fields.get("Expected Result")) }))
        .filter((tc) => /NEEDS_HUMAN_DECISION|BLOCKED/i.test(tc.value))
    if (uncertain.length === 0) {
        c.pass(stage, "TR-TEST-EXPECTED-CONFIRMED", "Ожидаемые результаты не зависят от открытых решений")
    } else {
        c.warn(
            stage,
            "TR-TEST-EXPECTED-CONFIRMED",
            "Ожидаемые результаты не зависят от открытых решений",
            `Зависят от решения человека: ${uncertain.map((t) => t.id).join(", ")}`,
            uncertain.map((t) => t.id)
        )
    }

    // 6. Ссылки на требования
    if (rrReqs) {
        const unknownReq = []
        for (const tc of tests.cases) {
            const refs = matchIds(tc.fields.get("Source Requirement"), ID_PATTERNS.req)
            for (const ref of refs) if (!rrReqs.has(ref)) unknownReq.push(`${tc.id} → ${ref}`)
        }
        c.assert(
            unknownReq.length === 0,
            stage,
            "TR-TEST-REQ-EXISTS",
            "Сценарии ссылаются на существующие требования",
            `Несуществующие REQ: ${unknownReq.join(", ")}`,
            unknownReq
        )

        const covered = new Set(tests.coverage.map((row) => row.req).filter(Boolean))
        const uncovered = [...rrReqs].filter((id) => !covered.has(id))
        c.assert(
            uncovered.length === 0,
            stage,
            "TR-TEST-COVERAGE-ALL-REQ",
            "Каждое требование присутствует в Coverage",
            `Нет строки покрытия: ${uncovered.join(", ")}`,
            uncovered
        )
    } else {
        c.skip(stage, "TR-TEST-REQ-EXISTS", "Ссылки сценариев на требования", "Requirement Review недоступен")
        c.skip(stage, "TR-TEST-COVERAGE-ALL-REQ", "Покрытие требований", "Requirement Review недоступен")
    }

    // 7. Согласованность Coverage ↔ TC
    const caseIds = new Set(tests.cases.map((tc) => tc.id))
    const badCoverage = []
    for (const row of tests.coverage) {
        const flag = norm(row.covered).toUpperCase()
        const tcs = matchIds(row.tc, ID_PATTERNS.tc)

        if (!["YES", "NO"].includes(flag)) {
            badCoverage.push(`${row.req}: Covered=${row.covered || "—"}`)
            continue
        }
        if (flag === "YES") {
            if (tcs.length === 0) badCoverage.push(`${row.req}: YES без TC ID`)
            for (const tc of tcs) if (!caseIds.has(tc)) badCoverage.push(`${row.req}: неизвестный сценарий ${tc}`)
        }
        if (flag === "NO" && tcs.length > 0) {
            badCoverage.push(`${row.req}: NO, но указаны сценарии`)
        }
    }
    c.assert(
        badCoverage.length === 0,
        stage,
        "TR-TEST-COVERAGE-CONSISTENCY",
        "Coverage согласован с перечнем сценариев",
        `Проблемы: ${badCoverage.join("; ")}`,
        badCoverage
    )

    // 8. Risk Reference существует (предупреждение)
    if (rrRisks && rrRisks.size > 0) {
        const unknownRisk = []
        for (const tc of tests.cases) {
            for (const risk of matchIds(tc.fields.get("Risk Reference"), ID_PATTERNS.risk)) {
                if (!rrRisks.has(risk)) unknownRisk.push(`${tc.id} → ${risk}`)
            }
        }
        if (unknownRisk.length === 0) {
            c.pass(stage, "TR-TEST-RISK-EXISTS", "Risk Reference ведёт на существующий риск")
        } else {
            c.warn(stage, "TR-TEST-RISK-EXISTS", "Risk Reference ведёт на существующий риск", `Несуществующие риски: ${unknownRisk.join(", ")}`, unknownRisk)
        }
    }
}
