/**
 * Реестр проверок: собирает все детерминированные проверки бандла артефактов.
 */

import { createCollector } from "../check.mjs"
import { checkFrontmatter } from "./frontmatter.mjs"
import { checkStructure } from "./structure.mjs"
import { checkIds } from "./ids.mjs"
import { checkRequirementReview, checkJiraTasks, checkTestModel } from "./traceability.mjs"
import { checkCoverageMap, checkExpectedVolume } from "./coverage.mjs"
import { checkHygiene, checkRunMarkers } from "./hygiene.mjs"

function checkCross(c, bundle) {
    const present = [
        ["requirement-review", bundle.rr],
        ["jira-tasks", bundle.jira],
        ["test-model", bundle.tests],
        ["coverage-map", bundle.map]
    ].filter(([, artifact]) => artifact)

    if (present.length === 0) {
        c.fail("dataset", "X-ARTIFACTS-PRESENT", "В наборе есть артефакты", "Ни один артефакт не найден")
        return
    }
    c.pass("dataset", "X-ARTIFACTS-PRESENT", "В наборе есть артефакты")

    const runIds = new Map()
    for (const [stage, artifact] of present) runIds.set(stage, String(artifact.fm.run_id ?? ""))

    const unique = new Set(runIds.values())
    c.assert(
        unique.size === 1,
        "dataset",
        "X-RUN-ID-CONSISTENT",
        "Все артефакты относятся к одному запуску",
        `Разные run_id: ${[...runIds.entries()].map(([s, id]) => `${s}=${id || "—"}`).join(", ")}`,
        [...unique]
    )

    const versions = new Map()
    for (const [stage, artifact] of present) versions.set(stage, String(artifact.fm.version ?? ""))
    c.assert(
        [...versions.values()].every((v) => v === "" || Number(v) >= 1),
        "dataset",
        "X-VERSION-VALID",
        "Версии артефактов заданы корректно"
    )
}

export function runBundleChecks(bundle, expected = null) {
    const c = createCollector()

    const stages = [
        ["requirement-review", bundle.rr],
        ["jira-tasks", bundle.jira],
        ["test-model", bundle.tests],
        ["coverage-map", bundle.map]
    ]

    for (const [stage, artifact] of stages) {
        if (!artifact) {
            c.skip(stage, "ARTIFACT-PRESENT", "Артефакт присутствует в наборе", "Файл не найден")
            continue
        }
        checkFrontmatter(c, artifact, stage)
        checkStructure(c, artifact, stage)
        checkIds(c, artifact, stage)
        checkHygiene(c, artifact, stage)
        checkRunMarkers(c, artifact, stage)
    }

    checkRequirementReview(c, bundle.rr)
    checkJiraTasks(c, bundle.jira, bundle.rr)
    checkTestModel(c, bundle.tests, bundle.rr)
    checkCoverageMap(c, bundle.map)
    checkExpectedVolume(c, expected, bundle)
    checkCross(c, bundle)

    return c.results
}
