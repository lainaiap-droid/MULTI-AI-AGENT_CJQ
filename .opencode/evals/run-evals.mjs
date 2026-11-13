#!/usr/bin/env node
/**
 * CLI evals для QA-мультиагента.
 *
 * Примеры:
 *   node .opencode/evals/run-evals.mjs
 *   node .opencode/evals/run-evals.mjs --list
 *   node .opencode/evals/run-evals.mjs --case SYN-SORT-001 --verbose
 *   node .opencode/evals/run-evals.mjs --md eval-report.md --json eval-report.json
 *   node .opencode/evals/run-evals.mjs --judge            # подготовить промпты
 *   node .opencode/evals/run-evals.mjs --judge-ingest     # учесть оценки
 *   node .opencode/evals/run-evals.mjs --selftest
 */

import { readFileSync, readdirSync, existsSync, writeFileSync, statSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join, resolve, basename } from "node:path"

import { tryLoad } from "./lib/model.mjs"
import { runBundleChecks } from "./lib/checks/index.mjs"
import { summarizeCase, printCase, toJson, toMarkdown, compareWithBaseline } from "./lib/report.mjs"
import { emitJudgePrompts, readScores, runJudgeCommand, scoreJudge } from "./lib/judge.mjs"
import { runSelftest } from "./selftest.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, "..", "..")

const ARTIFACT_FILES = {
    "requirement-review": /^requirement-review.*\.md$/,
    "jira-tasks": /^jira-tasks.*\.md$/,
    "test-model": /^test-model.*\.md$/,
    "coverage-map": /^coverage-map.*\.md$/
}

function parseArgs(argv) {
    const args = { _: [] }
    for (let i = 0; i < argv.length; i++) {
        const token = argv[i]
        if (!token.startsWith("--")) {
            args._.push(token)
            continue
        }
        const key = token.slice(2)
        const next = argv[i + 1]
        if (next && !next.startsWith("--")) {
            args[key] = next
            i++
        } else {
            args[key] = true
        }
    }
    return args
}

function listCaseDirs(root) {
    if (!existsSync(root)) return []
    return readdirSync(root)
        .map((name) => join(root, name))
        .filter((path) => statSync(path).isDirectory() && existsSync(join(path, "case.json")))
}

function discoverCases(args) {
    const roots = args.cases
        ? [resolve(process.cwd(), args.cases)]
        : [join(HERE, "cases", "public"), join(HERE, "cases", "private")]

    const dirs = roots.flatMap((root) => listCaseDirs(root))
    if (args.case) return dirs.filter((dir) => basename(dir) === args.case || JSON.parse(readFileSync(join(dir, "case.json"), "utf8")).id === args.case)
    return dirs
}

function loadArtifacts(caseDir) {
    const dir = join(caseDir, "artifacts")
    const bundle = { rr: null, jira: null, tests: null, map: null }

    if (!existsSync(dir)) return bundle

    const files = readdirSync(dir)
    const pick = (re) => {
        const matches = files.filter((f) => re.test(f)).sort()
        return matches.length ? join(dir, matches[matches.length - 1]) : null
    }

    bundle.rr = tryLoad(pick(ARTIFACT_FILES["requirement-review"]))
    bundle.jira = tryLoad(pick(ARTIFACT_FILES["jira-tasks"]))
    bundle.tests = tryLoad(pick(ARTIFACT_FILES["test-model"]))
    bundle.map = tryLoad(pick(ARTIFACT_FILES["coverage-map"]))
    return bundle
}

function applyStageFilter(results, stage) {
    if (!stage) return results
    return results.filter((r) => r.stage === stage || r.stage === "dataset")
}

function evaluateCase(caseDir, { judge = false, stage = null, verbose = false } = {}) {
    const caseJson = JSON.parse(readFileSync(join(caseDir, "case.json"), "utf8"))
    const bundle = loadArtifacts(caseDir)
    const sourcePath = join(caseDir, caseJson.source_file ?? "source.md")
    const sourceText = existsSync(sourcePath) ? readFileSync(sourcePath, "utf8") : ""

    const results = applyStageFilter(runBundleChecks(bundle, caseJson.expect ?? null), stage)

    const caseResult = {
        id: caseJson.id,
        title: caseJson.title,
        dir: caseDir,
        results,
        verdict: "PASS",
        judge: null
    }

    // Внешние оценки, если уже лежат в _judge
    const existing = (readScores(caseDir) ?? []).filter((entry) => !stage || entry.stage === stage)
    if (existing.length > 0 && caseJson.judge?.rubric) {
        const merged = { earned: 0, total: 0, ratio: 1, problems: [], valid: true, verdict: "PASS" }
        for (const entry of existing) {
            const scored = scoreJudge(caseJson.judge.rubric, entry.data)
            merged.earned += scored.earned
            merged.total += scored.total
            merged.problems.push(...scored.problems)
            if (scored.verdict !== "PASS") merged.verdict = "FAIL"
            merged.valid = merged.valid && scored.valid
        }
        if (merged.total > 0) merged.ratio = Math.round((merged.earned / merged.total) * 1000) / 1000
        caseResult.judge = merged
    }

    if (judge) {
        const artifacts = {
            "requirement-review": bundle.rr,
            "jira-tasks": bundle.jira,
            "test-model": bundle.tests,
            "coverage-map": bundle.map
        }
        const outDir = join(caseDir, "_judge")
        const prompts = emitJudgePrompts(caseDir, caseJson, artifacts, sourceText, outDir)

        for (const item of prompts) {
            const outcome = runJudgeCommand(item.prompt)
            if (outcome.status === "ok") {
                writeFileSync(join(outDir, `${item.stage}.scores.json`), JSON.stringify(outcome.data, null, 2), "utf8")
                if (verbose) console.log(`    judge: ${item.stage} → ${outcome.data.verdict ?? "?"}`)
            } else if (outcome.status === "unavailable") {
                if (verbose) console.log(`    judge: промпт сохранён ${item.file}`)
            } else if (verbose) {
                console.log(`    judge: ошибка ${item.stage}: ${outcome.message}`)
            }
        }
    }

    const summary = summarizeCase(caseResult)
    caseResult.verdict = summary.errors === 0 ? "PASS" : "FAIL"
    if (caseResult.judge && caseResult.judge.verdict !== "PASS") caseResult.verdict = "FAIL"
    return caseResult
}

function printList(dirs) {
    if (dirs.length === 0) {
        console.log("Кейсы не найдены.")
        return
    }
    console.log("Доступные кейсы:\n")
    for (const dir of dirs) {
        const c = JSON.parse(readFileSync(join(dir, "case.json"), "utf8"))
        const artifacts = existsSync(join(dir, "artifacts")) ? readdirSync(join(dir, "artifacts")).length : 0
        console.log(`  ${c.id.padEnd(22)} ${c.title}`)
        console.log(`  ${" ".repeat(22)} артефактов: ${artifacts}, источник: ${c.source_file ?? "—"}`)
    }
}

function main() {
    const args = parseArgs(process.argv.slice(2))

    if (args.help || args.h) {
        const doc = readFileSync(fileURLToPath(import.meta.url), "utf8")
        console.log((doc.match(/\/\*\*([\s\S]*?)\*\//) ?? [, ""])[1].replace(/^ \* ?/gm, "").trim())
        return 0
    }

    if (args.selftest) {
        return runSelftest({ verbose: Boolean(args.verbose) })
    }

    const dirs = discoverCases(args)
    if (args.list) {
        printList(dirs)
        return 0
    }

    if (dirs.length === 0) {
        console.error("Не найдено ни одного кейса. Проверьте --cases или содержимое cases/public.")
        return 2
    }

    console.log(`Evals: ${dirs.length} кейс(ов), корень ${REPO_ROOT}`)
    if (!process.env.EVAL_JUDGE_CMD && args.judge) {
        console.log("LLM-judge: EVAL_JUDGE_CMD не задан — промпты будут сохранены, оценки не запрошены.")
    }
    console.log("")

    const caseResults = dirs.map((dir) =>
        evaluateCase(dir, {
            judge: Boolean(args.judge),
            stage: args.stage,
            verbose: Boolean(args.verbose)
        })
    )

    for (const result of caseResults) printCase(result, { verbose: Boolean(args.verbose) })

    const json = toJson(caseResults)
    console.log("")
    console.log(`Итого: ${json.totals.passed}/${json.totals.cases} кейсов PASS, ошибок ${json.totals.errors}, проверок ${json.totals.checks}`)

    if (args["judge-ingest"]) {
        const ingested = caseResults.filter((r) => r.judge)
        if (ingested.length === 0) {
            console.error(
                "Оценки judge не найдены. Сначала выполните --judge и положите ответы в <case>/_judge/<stage>.scores.json."
            )
            return 2
        }
        console.log(`LLM-judge: учтены оценки для ${ingested.length} кейс(ов).`)
    }

    if (args.baseline) {
        const baselinePath = resolve(process.cwd(), args.baseline)
        const baseline = existsSync(baselinePath) ? JSON.parse(readFileSync(baselinePath, "utf8")) : null
        const deltas = compareWithBaseline(json, baseline)
        if (deltas.length) {
            console.log("\nИзменения относительно baseline:")
            for (const d of deltas) {
                if (d.regression) console.log(`  РЕГРЕССИЯ ${d.id}: ${d.from} → ${d.to}`)
                else console.log(`  ${d.id}: score ${d.from}% → ${d.to}% (${d.delta > 0 ? "+" : ""}${d.delta})`)
            }
        } else if (baseline) {
            console.log("\nОтклонений от baseline нет.")
        }

        if (args["update-baseline"]) {
            writeFileSync(baselinePath, JSON.stringify(json, null, 2), "utf8")
            console.log(`Baseline обновлён: ${baselinePath}`)
        }
    }

    if (args.json) {
        const out = resolve(process.cwd(), args.json)
        writeFileSync(out, JSON.stringify(json, null, 2), "utf8")
        console.log(`JSON: ${out}`)
    }

    if (args.md) {
        const out = resolve(process.cwd(), args.md)
        writeFileSync(out, toMarkdown(caseResults, { dataset: args.cases, stage: args.stage }), "utf8")
        console.log(`Markdown: ${out}`)
    }

    const failed = json.totals.failed > 0
    return failed ? 1 : 0
}

process.exitCode = main()
