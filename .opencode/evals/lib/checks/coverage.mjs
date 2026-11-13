/**
 * Проверки Coverage Map: арифметика сводки и согласованность статусов.
 */

import { stripTicks } from "../markdown.mjs"

const STATUSES = new Set(["COVERED", "PARTIAL", "GAP"])

const SUMMARY_KEYS = {
    total: [/всего/i],
    covered: [/полностью/i],
    partial: [/частично/i],
    gap: [/не покрыт/i]
}

function summaryNumber(rows, patterns) {
    for (const row of rows) {
        const label = stripTicks(row[0] ?? "")
        if (!patterns.some((re) => re.test(label))) continue
        const value = Number(String(stripTicks(row[1] ?? "")).replace(/[^\d-]/g, ""))
        if (Number.isFinite(value)) return value
    }
    return null
}

export function checkCoverageMap(c, map) {
    const stage = "coverage-map"
    if (!map) return

    const points = map.points ?? []

    // 1. Статусы допустимы
    const badStatus = points
        .map((p) => ({ id: p.point, value: stripTicks(p.status).toUpperCase() }))
        .filter((p) => !STATUSES.has(p.value))
    c.assert(
        badStatus.length === 0,
        stage,
        "CV-STATUS-VALUES",
        "Coverage Status принимает только COVERED, PARTIAL или GAP",
        `Недопустимые статусы: ${badStatus.map((p) => `${p.id}=${p.value || "—"}`).join(", ")}`,
        badStatus.map((p) => `${p.id}=${p.value || "—"}`)
    )

    // 2. Арифметика сводки
    const computed = {
        total: points.length,
        covered: points.filter((p) => stripTicks(p.status).toUpperCase() === "COVERED").length,
        partial: points.filter((p) => stripTicks(p.status).toUpperCase() === "PARTIAL").length,
        gap: points.filter((p) => stripTicks(p.status).toUpperCase() === "GAP").length
    }

    const declared = {
        total: summaryNumber(map.summary, SUMMARY_KEYS.total),
        covered: summaryNumber(map.summary, SUMMARY_KEYS.covered),
        partial: summaryNumber(map.summary, SUMMARY_KEYS.partial),
        gap: summaryNumber(map.summary, SUMMARY_KEYS.gap)
    }

    const mismatches = Object.keys(computed)
        .filter((key) => declared[key] !== null && declared[key] !== computed[key])
        .map((key) => `${key}: в сводке ${declared[key]}, по таблице ${computed[key]}`)

    c.assert(
        mismatches.length === 0,
        stage,
        "CV-SUMMARY-MATCH",
        "Сводка Coverage Map совпадает с таблицей",
        `Расхождения: ${mismatches.join("; ")}`,
        mismatches
    )

    // 3. GAP должны быть перечислены в Uncovered Requirements
    const gapIds = points
        .filter((p) => stripTicks(p.status).toUpperCase() === "GAP")
        .map((p) => stripTicks(p.point))

    if (gapIds.length > 0) {
        const listed = new Set(
            (map.sections.get("Uncovered Requirements") ?? "")
                .split(/\r?\n/)
                .filter((line) => line.trim().startsWith("|"))
                .map((line) => stripTicks(line.split("|")[1] ?? ""))
                .filter(Boolean)
        )
        const missing = gapIds.filter((id) => !listed.has(id))
        if (missing.length === 0) {
            c.pass(stage, "CV-GAP-LISTED", "Все GAP перечислены в Uncovered Requirements")
        } else {
            c.warn(
                stage,
                "CV-GAP-LISTED",
                "Все GAP перечислены в Uncovered Requirements",
                `Отсутствуют: ${missing.join(", ")}`,
                missing
            )
        }
    } else {
        c.pass(stage, "CV-GAP-LISTED", "Все GAP перечислены в Uncovered Requirements")
    }
}

/** Минимальные объёмы из case.json — защита от вырожденных артефактов. */
export function checkExpectedVolume(c, expected, bundle) {
    if (!expected) return
    const stage = "dataset"

    const actual = {
        minRequirements: bundle.rr?.requirements?.length ?? 0,
        minTasks: bundle.jira?.tasks?.length ?? 0,
        minTestCases: bundle.tests?.cases?.length ?? 0
    }

    const problems = []
    for (const [key, min] of Object.entries(expected)) {
        if (typeof min !== "number") continue
        if ((actual[key] ?? 0) < min) problems.push(`${key}: нужно ≥ ${min}, фактически ${actual[key] ?? 0}`)
    }

    c.assert(
        problems.length === 0,
        stage,
        "EV-MIN-VOLUME",
        "Артефакты содержат минимально ожидаемый объём",
        problems.join("; "),
        problems
    )
}
