#!/usr/bin/env node
/**
 * Самопроверка evals: мутационные тесты.
 *
 * Каждый тест берёт эталонный кейс, вносит один дефект и требует,
 * чтобы конкретная проверка его поймала. Так evals нельзя «сломать молча»:
 * если проверка перестанет срабатывать, selftest упадёт.
 */

import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

import { loadArtifactText } from "./lib/model.mjs"
import { runBundleChecks } from "./lib/checks/index.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const BASE_CASE = join(HERE, "cases", "public", "SYN-SORT-001")

function readBaseTexts() {
    const dir = join(BASE_CASE, "artifacts")
    return {
        rr: readFileSync(join(dir, "requirement-review.v1.md"), "utf8"),
        jira: readFileSync(join(dir, "jira-tasks.v1.md"), "utf8"),
        tests: readFileSync(join(dir, "test-model.v1.md"), "utf8"),
        map: readFileSync(join(dir, "coverage-map.md"), "utf8")
    }
}

function buildBundle(texts) {
    return {
        rr: loadArtifactText(texts.rr, "requirement-review.v1.md"),
        jira: loadArtifactText(texts.jira, "jira-tasks.v1.md"),
        tests: loadArtifactText(texts.tests, "test-model.v1.md"),
        map: loadArtifactText(texts.map, "coverage-map.md")
    }
}

function evaluate(texts) {
    return runBundleChecks(buildBundle(texts), null)
}

function replaceOnce(text, from, to) {
    const index = text.indexOf(from)
    if (index === -1) return text
    return text.slice(0, index) + to + text.slice(index + from.length)
}

function removeLine(text, startsWith) {
    return text
        .split(/\r?\n/)
        .filter((line) => !line.trim().startsWith(startsWith))
        .join("\n")
}

const MUTATIONS = [
    {
        name: "удалён status во frontmatter",
        target: "rr",
        apply: (text) => removeLine(text, "status: READY"),
        expect: { stage: "requirement-review", id: "FM-REQUIRED-FIELDS" }
    },
    {
        name: "Gate Self-Check содержит NO",
        target: "rr",
        apply: (text) =>
            replaceOnce(
                text,
                "| Все релевантные требования проанализированы | `YES` |",
                "| Все релевантные требования проанализированы | `NO` |"
            ),
        expect: { stage: "requirement-review", id: "ST-GATE-SELF-CHECK-ALL-YES" }
    },
    {
        name: "Traceability ссылается на несуществующий AC",
        target: "rr",
        apply: (text) =>
            replaceOnce(
                text,
                "| `REQ-005` | `BR-003` | `AC-001` |",
                "| `REQ-005` | `BR-003` | `AC-999` |"
            ),
        expect: { stage: "requirement-review", id: "TR-RR-REF-INTEGRITY" }
    },
    {
        name: "в артефакте осталась шаблонная заглушка",
        target: "rr",
        apply: (text) => replaceOnce(text, "## Scope\n", "## Scope\n\n<текст>\n"),
        expect: { stage: "requirement-review", id: "ST-NO-TEMPLATE-PLACEHOLDERS" }
    },
    {
        name: "в задачу попал токен доступа",
        target: "jira",
        apply: (text) => replaceOnce(text, "## Tasks\n", `## Tasks\n\nТокен: ATATT${"A".repeat(30)}\n`),
        expect: { stage: "jira-tasks", id: "HY-SECRETS" }
    },
    {
        name: "Issue Type вне допустимого набора",
        target: "jira",
        apply: (text) => replaceOnce(text, "- **Issue Type:** `Task`", "- **Issue Type:** `Improvement`"),
        expect: { stage: "jira-tasks", id: "TR-JIRA-ISSUE-TYPE-VALID" }
    },
    {
        name: "Coverage ссылается на несуществующую задачу",
        target: "jira",
        apply: (text) =>
            replaceOnce(
                text,
                "| `REQ-003` | `TASK-001` | `YES` |",
                "| `REQ-003` | `TASK-999` | `YES` |"
            ),
        expect: { stage: "jira-tasks", id: "TR-JIRA-COVERAGE-CONSISTENCY" }
    },
    {
        name: "Coverage помечает требование NO, но оставляет сценарии",
        target: "tests",
        apply: (text) =>
            replaceOnce(
                text,
                "| `REQ-001` | `TC-001, TC-002` | `YES` |",
                "| `REQ-001` | `TC-001, TC-002` | `NO` |"
            ),
        expect: { stage: "test-model", id: "TR-TEST-COVERAGE-CONSISTENCY" }
    },
    {
        name: "пропала обязательная секция Coverage",
        target: "tests",
        apply: (text) => replaceOnce(text, "## Coverage\n", "## Coverage Details\n"),
        expect: { stage: "test-model", id: "ST-SECTIONS-PRESENT" }
    },
    {
        name: "сводка Coverage Map расходится с таблицей",
        target: "map",
        apply: (text) => replaceOnce(text, "| Полностью покрыто | 9 |", "| Полностью покрыто | 7 |"),
        expect: { stage: "coverage-map", id: "CV-SUMMARY-MATCH" }
    },
    {
        name: "артефакты относятся к разным запускам",
        target: "map",
        apply: (text) => replaceOnce(text, "run_id: RUN-20260101-120000", "run_id: RUN-20260101-999999"),
        expect: { stage: "dataset", id: "X-RUN-ID-CONSISTENT" }
    }
]

export function runSelftest({ verbose = false } = {}) {
    const failures = []
    let passed = 0

    const report = (ok, name, detail = "") => {
        if (ok) {
            passed++
            if (verbose) console.log(`  PASS  ${name}`)
            return
        }
        failures.push(detail ? `${name}: ${detail}` : name)
        console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`)
    }

    console.log("Evals selftest: эталонный кейс и мутации")
    console.log("")

    const baseTexts = readBaseTexts()
    const baseResults = evaluate(baseTexts)
    const baseErrors = baseResults.filter((r) => r.status === "fail" && r.severity === "error")

    report(
        baseErrors.length === 0,
        "эталонный кейс проходит без ошибок",
        baseErrors.map((e) => `${e.id}: ${e.message}`).join("; ")
    )

    // Проверка, что модель действительно разбирает артефакты, а не проходит вхолостую.
    const baseBundle = buildBundle(baseTexts)
    report(
        baseBundle.rr?.requirements?.length === 10 &&
            baseBundle.jira?.tasks?.length === 4 &&
            baseBundle.tests?.cases?.length === 9 &&
            baseBundle.map?.points?.length === 10,
        "модель разбирает эталонные артефакты",
        `REQ=${baseBundle.rr?.requirements?.length}, TASK=${baseBundle.jira?.tasks?.length}, ` +
            `TC=${baseBundle.tests?.cases?.length}, points=${baseBundle.map?.points?.length}`
    )

    for (const mutation of MUTATIONS) {
        const texts = { ...baseTexts }
        const mutated = mutation.apply(texts[mutation.target])

        if (mutated === texts[mutation.target]) {
            report(false, mutation.name, "мутация не применилась к тексту")
            continue
        }

        texts[mutation.target] = mutated
        const results = evaluate(texts)
        const caught = results.find(
            (r) => r.id === mutation.expect.id && r.stage === mutation.expect.stage && r.status === "fail"
        )

        report(
            Boolean(caught),
            mutation.name,
            caught ? "" : `проверка ${mutation.expect.stage}/${mutation.expect.id} не сработала`
        )
    }

    console.log("")
    if (failures.length === 0) {
        console.log(`Selftest: PASS (${passed} проверок)`)
        return 0
    }

    console.log(`Selftest: FAIL (${failures.length} из ${passed + failures.length} проверок)`)
    for (const failure of failures) console.log(`  · ${failure}`)
    return 1
}
