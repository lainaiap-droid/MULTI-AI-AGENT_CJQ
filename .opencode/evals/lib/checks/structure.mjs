/**
 * Структурные проверки: обязательные секции, Gate Self-Check, шаблонные заглушки.
 */

import { parseTables, columnIndex, stripTicks } from "../markdown.mjs"

const REQUIRED_SECTIONS = {
    "requirement-review": [
        "Scope",
        "Source References",
        "Requirements",
        "Business Rules",
        "Acceptance Criteria",
        "Validation Rules",
        "Boundaries",
        "Risks",
        "Open Questions",
        "Traceability",
        "Gate Self-Check"
    ],
    "jira-tasks": ["Tasks", "Coverage", "Gate Self-Check"],
    "test-model": ["Scenarios", "Coverage", "Gate Self-Check"],
    "coverage-map": ["Summary", "Uncovered Requirements"]
}

const PLACEHOLDER_RE = /<[\p{L}\p{N}_][^<>\n]{0,80}>/gu

export function findPlaceholders(text) {
    const hits = []
    const lines = text.split(/\r?\n/)
    for (let i = 0; i < lines.length; i++) {
        const matches = lines[i].match(PLACEHOLDER_RE)
        if (!matches) continue
        for (const m of matches) hits.push({ line: i + 1, value: m })
    }
    return hits
}

export function checkStructure(c, artifact, stage) {
    if (!artifact) return

    const required = REQUIRED_SECTIONS[stage] ?? []
    const missing = required.filter((name) => !artifact.sections.has(name))

    c.assert(
        missing.length === 0,
        stage,
        "ST-SECTIONS-PRESENT",
        "Обязательные секции присутствуют",
        `Отсутствуют секции: ${missing.join(", ")}`,
        missing
    )

    // Gate Self-Check: все критерии YES
    const gateText = artifact.sections.get("Gate Self-Check")
    if (gateText) {
        const table = parseTables(gateText)[0]
        if (!table) {
            c.fail(stage, "ST-GATE-TABLE", "Gate Self-Check оформлен таблицей", "Таблица не найдена")
        } else {
            const resIdx = columnIndex(table, ["Результат", "Result"])
            const critIdx = columnIndex(table, ["Критерий", "Criterion"])

            if (resIdx === -1) {
                c.fail(stage, "ST-GATE-TABLE", "Gate Self-Check содержит колонку «Результат»", "Колонка не найдена")
            } else {
                const notYes = table.rows
                    .map((row) => ({
                        criterion: stripTicks(critIdx === -1 ? "" : row[critIdx]),
                        value: stripTicks(row[resIdx]).toUpperCase()
                    }))
                    .filter((r) => r.criterion && r.value !== "YES")

                c.assert(
                    notYes.length === 0,
                    stage,
                    "ST-GATE-SELF-CHECK-ALL-YES",
                    "Все критерии Gate Self-Check равны YES",
                    `Не YES: ${notYes.map((r) => `${r.criterion} → ${r.value || "пусто"}`).join("; ")}`,
                    notYes.map((r) => `${r.criterion} → ${r.value || "пусто"}`)
                )
            }
        }
    }

    // Незаполненные шаблонные заглушки
    const placeholders = findPlaceholders(artifact.text)
    c.assert(
        placeholders.length === 0,
        stage,
        "ST-NO-TEMPLATE-PLACEHOLDERS",
        "Шаблонные заглушки не остались в артефакте",
        `Найдено заглушек: ${placeholders.length}`,
        placeholders.slice(0, 10).map((p) => `строка ${p.line}: ${p.value}`)
    )
}

/** Проверка, что таблица в секции не пуста. */
export function assertTableFilled(c, artifact, stage, section, checkId, title) {
    if (!artifact?.sections.has(section)) return
    const table = parseTables(artifact.sections.get(section))[0]
    const rows = table?.rows?.filter((r) => r.some((cell) => stripTicks(cell) !== "")) ?? []

    c.assert(
        rows.length > 0,
        stage,
        checkId,
        title,
        `Таблица «${section}» не содержит строк`
    )
}
