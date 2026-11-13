/**
 * LLM-judge: формирование промптов и приём оценок.
 *
 * CLI не вызывает модель сам: он готовит промпт по рубрике и принимает
 * результат в формате JSON. Кто оценивает — отдельный процесс, заданный
 * в EVAL_JUDGE_CMD, или агент по skill `evals`.
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { spawnSync } from "node:child_process"

export function buildJudgePrompt({ caseId, title, stage, rubric, artifactPath, artifactText, sourceText }) {
    const criteria = rubric
        .map(
            (c) =>
                `### ${c.id} — ${c.title} (вес ${c.weight}, максимум ${c.weight})\n${c.question}`
        )
        .join("\n\n")

    return `# Оценка артефакта

Кейс: ${caseId} — ${title}
Этап: ${stage}

Ты — независимый ревьюер QA-артефактов. Оцени артефакт по каждому критерию.
Ставь балл от 0 до веса критерия. Обоснование — одно-два предложения, со ссылкой
на конкретное место артефакта. Не переписывай артефакт и не предлагай правки.

## Критерии

${criteria}

## Исходные требования

\`\`\`markdown
${sourceText}
\`\`\`

## Артефакт (${artifactPath})

\`\`\`markdown
${artifactText}
\`\`\`

## Формат ответа

Верни только JSON без пояснений вокруг:

\`\`\`json
{
  "case": "${caseId}",
  "stage": "${stage}",
  "judge": "<имя модели или human>",
  "scores": [
    { "id": "${rubric[0]?.id ?? "J-001"}", "score": 0, "max": ${rubric[0]?.weight ?? 1}, "comment": "<обоснование>" }
  ],
  "verdict": "PASS | FAIL"
}
\`\`\`

Все идентификаторы критериев из списка выше должны присутствовать ровно один раз.
`
}

export function emitJudgePrompts(caseDir, caseJson, artifacts, sourceText, outDir) {
    const rubric = caseJson.judge?.rubric ?? []
    if (rubric.length === 0) return []

    mkdirSync(outDir, { recursive: true })
    const written = []

    for (const [stage, artifact] of Object.entries(artifacts)) {
        if (!artifact) continue
        const prompt = buildJudgePrompt({
            caseId: caseJson.id,
            title: caseJson.title,
            stage,
            rubric,
            artifactPath: artifact.path,
            artifactText: artifact.text,
            sourceText
        })
        const file = join(outDir, `${stage}.prompt.md`)
        writeFileSync(file, prompt, "utf8")
        written.push({ stage, file, prompt })
    }

    return written
}

export function runJudgeCommand(prompt, timeoutMs = 120000) {
    const cmd = process.env.EVAL_JUDGE_CMD
    if (!cmd) return { status: "unavailable" }

    const result = spawnSync(cmd, {
        input: prompt,
        encoding: "utf8",
        shell: true,
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024
    })

    if (result.error) return { status: "error", message: String(result.error.message) }
    if (result.status !== 0) return { status: "error", message: `код ${result.status}: ${(result.stderr || "").slice(0, 400)}` }

    const json = extractJson(result.stdout)
    if (!json) return { status: "error", message: "ответ не содержит JSON" }
    return { status: "ok", data: json }
}

export function extractJson(text) {
    const fenced = String(text).match(/```json\s*([\s\S]*?)```/)
    const candidate = fenced ? fenced[1] : text
    try {
        return JSON.parse(candidate.trim())
    } catch {
        const start = candidate.indexOf("{")
        const end = candidate.lastIndexOf("}")
        if (start === -1 || end === -1 || end <= start) return null
        try {
            return JSON.parse(candidate.slice(start, end + 1))
        } catch {
            return null
        }
    }
}

/** Проверяет корректность оценок и считает взвешенный результат. */
export function scoreJudge(rubric, payload) {
    const problems = []
    const byId = new Map()

    for (const entry of payload?.scores ?? []) {
        if (entry?.id) byId.set(String(entry.id), entry)
    }

    let earned = 0
    let total = 0

    for (const criterion of rubric) {
        const entry = byId.get(criterion.id)
        total += criterion.weight
        if (!entry) {
            problems.push(`нет оценки для ${criterion.id}`)
            continue
        }
        const score = Number(entry.score)
        if (!Number.isFinite(score) || score < 0 || score > criterion.weight) {
            problems.push(`${criterion.id}: балл ${entry.score} вне диапазона 0..${criterion.weight}`)
            continue
        }
        if (!String(entry.comment ?? "").trim()) problems.push(`${criterion.id}: нет обоснования`)
        earned += score
    }

    const ratio = total === 0 ? 0 : earned / total
    return {
        earned,
        total,
        ratio: Math.round(ratio * 1000) / 1000,
        problems,
        valid: problems.length === 0,
        verdict: problems.length === 0 && ratio >= 0.75 ? "PASS" : "FAIL"
    }
}

export function readScores(caseDir) {
    const dir = join(caseDir, "_judge")
    if (!existsSync(dir)) return null

    const files = readdirSync(dir).filter((f) => f.endsWith(".scores.json"))
    if (files.length === 0) return null

    return files.map((f) => ({
        file: join(dir, f),
        stage: f.replace(/\.scores\.json$/, ""),
        data: JSON.parse(readFileSync(join(dir, f), "utf8"))
    }))
}
