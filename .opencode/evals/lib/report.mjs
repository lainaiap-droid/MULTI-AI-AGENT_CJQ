/**
 * Рендеринг отчёта evals: консоль, JSON, Markdown.
 */

import { summarize } from "./check.mjs"

const ICONS = { pass: "PASS", fail: "FAIL", warn: "WARN", skip: "SKIP" }

export function summarizeCase(caseResult) {
    return summarize(caseResult.results)
}

export function printCase(caseResult, { verbose = false } = {}) {
    const s = summarizeCase(caseResult)
    const verdict = caseResult.verdict ?? s.verdict
    const label = `${caseResult.id}`.padEnd(22)

    console.log(
        `${label} ${verdict.padEnd(5)} score ${String(s.score).padStart(5)}%  ` +
            `pass ${s.pass}  fail ${s.fail}  warn ${s.warn}  skip ${s.skip}` +
            (caseResult.judge ? `  judge ${caseResult.judge.verdict} (${caseResult.judge.earned}/${caseResult.judge.total})` : "")
    )

    const failures = caseResult.results.filter((r) => r.status === "fail" && r.severity === "error")
    for (const failure of failures) {
        console.log(`    ✗ [${failure.stage}] ${failure.id}: ${failure.title}`)
        if (failure.message) console.log(`      ${failure.message}`)
        if (verbose) for (const d of failure.details ?? []) console.log(`      · ${d}`)
    }

    if (verbose) {
        const warnings = caseResult.results.filter((r) => r.status === "warn")
        for (const warning of warnings) {
            console.log(`    ! [${warning.stage}] ${warning.id}: ${warning.message}`)
        }
    }
}

export function toJson(caseResults) {
    const cases = caseResults.map((c) => ({
        id: c.id,
        title: c.title,
        verdict: c.judge ? (c.judge.verdict === "PASS" ? c.verdict : "FAIL") : c.verdict,
        summary: summarizeCase(c),
        judge: c.judge ?? null,
        results: c.results
    }))

    const totals = {
        cases: cases.length,
        passed: cases.filter((c) => c.verdict === "PASS").length,
        failed: cases.filter((c) => c.verdict !== "PASS").length,
        checks: cases.reduce((acc, c) => acc + c.summary.total, 0),
        errors: cases.reduce((acc, c) => acc + c.summary.errors, 0)
    }

    return {
        generatedAt: new Date().toISOString(),
        tool: "qa-multiagent-evals",
        totals,
        cases
    }
}

export function toMarkdown(caseResults, meta = {}) {
    const json = toJson(caseResults)
    const lines = []

    lines.push("# Eval Report")
    lines.push("")
    lines.push(`- Дата: ${json.generatedAt}`)
    if (meta.dataset) lines.push(`- Набор: ${meta.dataset}`)
    if (meta.stage) lines.push(`- Этап: ${meta.stage}`)
    lines.push("")
    lines.push("## Сводка")
    lines.push("")
    lines.push("| Кейс | Вердикт | Score | Pass | Fail | Warn | Skip |")
    lines.push("|---|---|---|---|---|---|---|")

    for (const c of json.cases) {
        lines.push(
            `| \`${c.id}\` | ${c.verdict} | ${c.summary.score}% | ${c.summary.pass} | ${c.summary.fail} | ${c.summary.warn} | ${c.summary.skip} |`
        )
    }

    lines.push("")
    lines.push(`Итого: ${json.totals.passed} из ${json.totals.cases} кейсов пройдено, ошибок ${json.totals.errors}.`)

    const failed = json.cases.filter((c) => c.verdict !== "PASS")
    if (failed.length > 0) {
        lines.push("")
        lines.push("## Проваленные проверки")
        for (const c of failed) {
            lines.push("")
            lines.push(`### ${c.id} — ${c.title}`)
            const errors = c.results.filter((r) => r.status === "fail" && r.severity === "error")
            for (const e of errors) {
                lines.push(`- **${e.id}** (${e.stage}): ${e.title}`)
                if (e.message) lines.push(`  - ${e.message}`)
                for (const d of e.details ?? []) lines.push(`  - ${d}`)
            }
            if (c.judge && c.judge.verdict !== "PASS") {
                lines.push(`- **JD-THRESHOLD**: judge ${c.judge.earned}/${c.judge.total} (${c.judge.ratio})`)
                for (const p of c.judge.problems ?? []) lines.push(`  - ${p}`)
            }
        }
    }

    lines.push("")
    return lines.join("\n")
}

export function compareWithBaseline(current, baseline) {
    if (!baseline?.cases) return []
    const byId = new Map(baseline.cases.map((c) => [c.id, c]))
    const deltas = []

    for (const c of current.cases) {
        const prev = byId.get(c.id)
        if (!prev) continue
        const delta = c.summary.score - prev.summary.score
        if (delta !== 0) {
            deltas.push({ id: c.id, from: prev.summary.score, to: c.summary.score, delta })
        }
        if (prev.verdict === "PASS" && c.verdict !== "PASS") {
            deltas.push({ id: c.id, regression: true, from: prev.verdict, to: c.verdict })
        }
    }

    return deltas
}

export function printIconsLegend() {
    console.log(Object.values(ICONS).join("  "))
}
