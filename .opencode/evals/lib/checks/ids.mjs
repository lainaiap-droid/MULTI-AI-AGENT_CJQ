/**
 * Проверки идентификаторов: формат, уникальность, непрерывность нумерации.
 */

const KINDS = {
    "requirement-review": [
        ["SRC", /^SRC-\d{3}$/, "sources"],
        ["REQ", /^REQ-\d{3}$/, "requirements"],
        ["BR", /^BR-\d{3}$/, "br"],
        ["AC", /^AC-\d{3}$/, "ac"],
        ["VAL", /^VAL-\d{3}$/, "val"],
        ["BND", /^BND-\d{3}$/, "bnd"],
        ["DEP", /^DEP-\d{3}$/, "dep"],
        ["AMB", /^AMB-\d{3}$/, "amb"],
        ["MISS", /^MISS-\d{3}$/, "miss"],
        ["CON", /^CON-\d{3}$/, "con"],
        ["RISK", /^RISK-\d{3}$/, "risks"],
        ["OQ", /^OQ-\d{3}$/, "oq"],
        ["FLOW-P", /^FLOW-P-\d{3}$/, "flowp"],
        ["FLOW-N", /^FLOW-N-\d{3}$/, "flown"]
    ],
    "jira-tasks": [["TASK", /^TASK-\d{3}$/, "tasks"]],
    "test-model": [["TC", /^TC-\d{3}$/, "cases"]]
}

function sequenceGaps(ids) {
    const numbers = ids
        .map((id) => Number(String(id).match(/(\d{3})$/)?.[1]))
        .filter((n) => Number.isFinite(n))
        .sort((a, b) => a - b)

    if (numbers.length < 2) return []

    const gaps = []
    for (let i = 1; i < numbers.length; i++) {
        if (numbers[i] - numbers[i - 1] > 1) gaps.push(`${numbers[i - 1]} → ${numbers[i]}`)
    }
    return gaps
}

export function checkIds(c, artifact, stage) {
    const kinds = KINDS[stage]
    if (!artifact || !kinds) return

    const badFormat = []
    const duplicates = []

    for (const [label, pattern, key] of kinds) {
        const items = artifact[key] ?? []
        const ids = items.map((item) => item.id ?? item).filter(Boolean)

        for (const id of ids) {
            if (!pattern.test(id)) badFormat.push(`${label}: ${id}`)
        }

        const seen = new Set()
        for (const id of ids) {
            if (seen.has(id)) duplicates.push(id)
            seen.add(id)
        }
    }

    c.assert(
        badFormat.length === 0,
        stage,
        "ID-FORMAT",
        "Идентификаторы соответствуют формату <PREFIX>-NNN",
        `Некорректные ID: ${badFormat.join(", ")}`,
        badFormat
    )

    c.assert(
        duplicates.length === 0,
        stage,
        "ID-UNIQUE",
        "Идентификаторы уникальны внутри артефакта",
        `Дубликаты: ${[...new Set(duplicates)].join(", ")}`,
        [...new Set(duplicates)]
    )

    // Непрерывность — предупреждение, не блокер: пропуск может быть осознанным.
    const gaps = []
    for (const [label, , key] of kinds) {
        const ids = (artifact[key] ?? []).map((item) => item.id ?? item).filter(Boolean)
        for (const gap of sequenceGaps(ids)) gaps.push(`${label}: ${gap}`)
    }

    if (gaps.length === 0) {
        c.pass(stage, "ID-SEQUENTIAL", "Нумерация идентификаторов непрерывна")
    } else {
        c.warn(stage, "ID-SEQUENTIAL", "Нумерация идентификаторов непрерывна", `Пропуски: ${gaps.join(", ")}`, gaps)
    }
}
