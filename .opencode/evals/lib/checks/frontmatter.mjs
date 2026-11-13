/**
 * Проверки frontmatter артефакта.
 */

const REQUIRED_FIELDS = ["artifact", "version", "run_id", "status", "generated_by", "source"]
const STATUSES = new Set(["READY", "PARTIAL", "BLOCKED"])
const RUN_ID_RE = /^RUN-\d{8}-\d{6}$/

export function checkFrontmatter(c, artifact, stage) {
    if (!artifact) return

    if (!artifact.fmOk) {
        c.fail(stage, "FM-PRESENT", "Frontmatter присутствует", "Файл не начинается с блока --- ... ---")
        return
    }
    c.pass(stage, "FM-PRESENT", "Frontmatter присутствует")

    const missing = REQUIRED_FIELDS.filter((f) => !artifact.fm[f])
    c.assert(
        missing.length === 0,
        stage,
        "FM-REQUIRED-FIELDS",
        "Обязательные поля frontmatter заполнены",
        `Отсутствуют поля: ${missing.join(", ")}`,
        missing
    )

    c.assert(
        artifact.fm.artifact === stage,
        stage,
        "FM-ARTIFACT-TYPE",
        "Поле artifact соответствует типу артефакта",
        `Ожидалось «${stage}», получено «${artifact.fm.artifact ?? "—"}»`
    )

    c.assert(
        STATUSES.has(String(artifact.fm.status ?? "").toUpperCase()),
        stage,
        "FM-STATUS-VALUE",
        "Статус артефакта допустим",
        `Недопустимый статус: «${artifact.fm.status}». Ожидалось READY, PARTIAL или BLOCKED`
    )

    const version = Number(artifact.fm.version)
    c.assert(
        Number.isInteger(version) && version >= 1,
        stage,
        "FM-VERSION-VALUE",
        "Версия артефакта — целое число ≥ 1",
        `Некорректная версия: «${artifact.fm.version}»`
    )

    c.assert(
        RUN_ID_RE.test(String(artifact.fm.run_id ?? "")),
        stage,
        "FM-RUN-ID-FORMAT",
        "run_id соответствует формату RUN-YYYYMMDD-HHMMSS",
        `Некорректный run_id: «${artifact.fm.run_id}»`
    )
}
