/**
 * Гигиена артефакта: секреты, PII, абсолютные пути, приватные хосты, маркеры запуска.
 */

const SECRET_PATTERNS = [
    { id: "ATLASSIAN_TOKEN", re: /ATATT[0-9A-Za-z_\-=]{20,}/ },
    { id: "BEARER_TOKEN", re: /Bearer\s+[A-Za-z0-9._\-]{20,}/ },
    { id: "BASIC_AUTH", re: /Basic\s+[A-Za-z0-9+/=]{20,}/ },
    { id: "PRIVATE_KEY", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
    { id: "AWS_KEY", re: /AKIA[0-9A-Z]{16}/ },
    { id: "GITHUB_TOKEN", re: /gh[pousr]_[A-Za-z0-9]{20,}/ },
    { id: "OPENAI_KEY", re: /sk-[A-Za-z0-9]{20,}/ },
    { id: "GENERIC_SECRET", re: /(?:token|secret|password|api[_-]?key)\s*[:=]\s*["']?[A-Za-z0-9_\-]{24,}/i }
]

const EMAIL_RE = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/
const ABS_PATH_RE = /\b[A-Za-z]:[\\/](?:Users|LABS|Projects|workspace)\b|\/home\/[A-Za-z0-9._-]+\//
const PRIVATE_HOST_RE = /\b[a-z0-9-]+\.atlassian\.net\b/i
const ACCOUNT_ID_RE = /\b712020:[0-9a-f-]{16,}\b/i

function scanLines(text, predicate) {
    const hits = []
    text.split(/\r?\n/).forEach((line, i) => {
        const found = predicate(line)
        if (found) hits.push({ line: i + 1, value: found })
    })
    return hits
}

export function checkHygiene(c, artifact, stage) {
    if (!artifact) return
    const text = artifact.text

    // Секреты
    const secretHits = []
    for (const { id, re } of SECRET_PATTERNS) {
        for (const hit of scanLines(text, (line) => (re.test(line) ? id : null))) {
            secretHits.push(`строка ${hit.line}: ${hit.value}`)
        }
    }
    c.assert(
        secretHits.length === 0,
        stage,
        "HY-SECRETS",
        "В артефакте нет токенов и секретов",
        `Найдены потенциальные секреты: ${secretHits.length}`,
        secretHits.slice(0, 10)
    )

    // PII: email и accountId
    const piiHits = [
        ...scanLines(text, (line) => line.match(EMAIL_RE)?.[0]),
        ...scanLines(text, (line) => line.match(ACCOUNT_ID_RE)?.[0])
    ].map((h) => `строка ${h.line}: ${h.value}`)
    c.assert(
        piiHits.length === 0,
        stage,
        "HY-PII",
        "В артефакте нет email и идентификаторов пользователей",
        `Найдено PII: ${piiHits.length}`,
        piiHits.slice(0, 10)
    )

    // Абсолютные локальные пути
    const pathHits = scanLines(text, (line) => line.match(ABS_PATH_RE)?.[0]).map(
        (h) => `строка ${h.line}: ${h.value}`
    )
    c.assert(
        pathHits.length === 0,
        stage,
        "HY-ABS-PATH",
        "В артефакте нет абсолютных путей рабочей машины",
        `Найдены пути: ${pathHits.length}`,
        pathHits.slice(0, 10)
    )

    // Приватные хосты — предупреждение, ссылка на источник допустима
    const hostHits = scanLines(text, (line) => line.match(PRIVATE_HOST_RE)?.[0]).map(
        (h) => `строка ${h.line}: ${h.value}`
    )
    if (hostHits.length === 0) {
        c.pass(stage, "HY-PRIVATE-HOST", "В артефакте нет адресов пространства заказчика")
    } else {
        c.warn(
            stage,
            "HY-PRIVATE-HOST",
            "В артефакте нет адресов пространства заказчика",
            `Найдены адреса: ${hostHits.length}`,
            hostHits.slice(0, 10)
        )
    }
}

/** Маркер запуска внутри TASK/TC должен ссылаться на тот же объект. */
export function checkRunMarkers(c, artifact, stage) {
    if (!artifact) return

    const blocks = stage === "jira-tasks" ? artifact.tasks : stage === "test-model" ? artifact.cases : null
    if (!blocks) return

    const runId = String(artifact.fm.run_id ?? "")
    const problems = []

    for (const block of blocks) {
        const marker = block.body.match(/\[agent-run:([^\]]+)\]/)
        if (!marker) continue

        const [, payload] = marker
        const parts = payload.split(":")
        if (parts.length !== 2) {
            problems.push(`${block.id}: маркер не соответствует [agent-run:<run_id>:<ID>]`)
            continue
        }
        const [markerRun, markerId] = parts
        if (markerId !== block.id) problems.push(`${block.id}: маркер указывает на ${markerId}`)
        if (runId && markerRun !== runId) problems.push(`${block.id}: run_id маркера ${markerRun} ≠ ${runId}`)
    }

    if (problems.length === 0) {
        c.pass(stage, "HY-RUN-MARKER", "Маркеры запуска корректны")
    } else {
        c.warn(stage, "HY-RUN-MARKER", "Маркеры запуска корректны", `Проблемы: ${problems.join("; ")}`, problems)
    }
}
