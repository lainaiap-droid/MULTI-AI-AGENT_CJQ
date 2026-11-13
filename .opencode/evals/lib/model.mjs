/**
 * Модель артефакта: разбирает файл в структуры, пригодные для проверок.
 */

import { readFileSync, existsSync } from "node:fs"
import {
    parseFrontmatter,
    parseSections,
    parseBlocks,
    parseTables,
    parseListFields,
    tableToObjects,
    matchIds
} from "./markdown.mjs"

export const STAGES = ["requirement-review", "jira-tasks", "test-model", "coverage-map"]

export const ID_PATTERNS = {
    req: /\bREQ-\d{3}\b/g,
    br: /\bBR-\d{3}\b/g,
    ac: /\bAC-\d{3}\b/g,
    val: /\bVAL-\d{3}\b/g,
    bnd: /\bBND-\d{3}\b/g,
    dep: /\bDEP-\d{3}\b/g,
    amb: /\bAMB-\d{3}\b/g,
    miss: /\bMISS-\d{3}\b/g,
    con: /\bCON-\d{3}\b/g,
    risk: /\bRISK-\d{3}\b/g,
    oq: /\bOQ-\d{3}\b/g,
    flowp: /\bFLOW-P-\d{3}\b/g,
    flown: /\bFLOW-N-\d{3}\b/g,
    src: /\bSRC-\d{3}\b/g,
    task: /\bTASK-\d{3}\b/g,
    tc: /\bTC-\d{3}\b/g
}

const RR_SPECS = {
    sources: { id: ["SRC ID", "SRC"], text: ["Page ID"], version: ["Version"], status: ["Status"], url: ["URL"] },
    requirements: { id: ["REQ ID", "REQ"], text: ["Requirement", "Требование"], source: ["Source", "Источник"] },
    br: { id: ["BR ID", "BR"], text: ["Rule", "Правило"], source: ["Source", "Источник"] },
    ac: { id: ["AC ID", "AC"], text: ["Criterion", "Критерий"], source: ["Source", "Источник"] },
    val: { id: ["VAL ID", "VAL"], text: ["Rule", "Правило"] },
    bnd: { id: ["BND ID", "BND"], text: ["Граничное условие", "Boundary"] },
    dep: { id: ["DEP ID", "DEP"], text: ["Dependency", "Зависимость"] },
    amb: { id: ["AMB ID", "AMB"], text: ["Описание", "Description"] },
    miss: { id: ["MISS ID", "MISS"], text: ["Чего не хватает", "Missing"] },
    con: { id: ["CON ID", "CON"], text: ["Суть конфликта", "Conflict"] },
    risks: { id: ["RISK ID", "RISK"], text: ["Риск", "Risk"] },
    oq: { id: ["OQ ID", "OQ"], text: ["Вопрос", "Question"] },
    flowp: { id: ["FLOW ID", "FLOW"], text: ["Описание", "Flow"] },
    flown: { id: ["FLOW ID", "FLOW"], text: ["Описание", "Flow"] },
    trace: { req: ["REQ ID", "REQ"], brs: ["BR IDs", "BR"], acs: ["AC IDs", "AC"] }
}

const JIRA_SPEC = {
    coverage: { req: ["REQ ID", "REQ"], task: ["TASK ID", "TASK"], covered: ["Covered", "Покрыто"] },
    duplicates: { task: ["TASK ID", "TASK"], key: ["Existing Jira Key", "Jira Key"] },
    blockers: { id: ["ID"], text: ["Вопрос или блокер", "Вопрос"], impact: ["Влияние на задачу"] }
}

const TEST_SPEC = {
    coverage: { req: ["REQ ID", "REQ"], tc: ["TC ID", "TC"], covered: ["Covered", "Покрыто"] },
    riskBased: { risk: ["RISK ID", "RISK"], tc: ["TC ID", "TC"], why: ["Почему сценарий risk-based"] },
    blockers: { id: ["ID"], text: ["Вопрос или блокер", "Вопрос"], impact: ["Влияние на сценарий"] }
}

const COVERAGE_SPEC = {
    points: {
        point: ["Functional Point", "REQ ID"],
        reqs: ["REQ IDs"],
        jira: ["Jira Key"],
        cases: ["Qase Case IDs"],
        status: ["Coverage Status"],
        gaps: ["Gaps"]
    }
}

function firstTable(sections, name) {
    const text = sections.get(name)
    if (!text) return null
    return parseTables(text)[0] ?? null
}

function objectsOf(sections, name, spec) {
    return tableToObjects(firstTable(sections, name), spec)
}

export function loadArtifactText(text, path = "<memory>") {
    const fm = parseFrontmatter(text)
    const sections = parseSections(fm.body)

    const model = {
        path,
        text,
        fm: fm.data,
        fmOk: fm.ok,
        sections,
        stage: fm.data.artifact || null
    }

    if (model.stage === "requirement-review") {
        model.sources = objectsOf(sections, "Source References", RR_SPECS.sources)
        model.requirements = objectsOf(sections, "Requirements", RR_SPECS.requirements)
        model.br = objectsOf(sections, "Business Rules", RR_SPECS.br)
        model.ac = objectsOf(sections, "Acceptance Criteria", RR_SPECS.ac)
        model.val = objectsOf(sections, "Validation Rules", RR_SPECS.val)
        model.bnd = objectsOf(sections, "Boundaries", RR_SPECS.bnd)
        model.dep = objectsOf(sections, "Dependencies", RR_SPECS.dep)
        model.amb = objectsOf(sections, "Ambiguities", RR_SPECS.amb)
        model.miss = objectsOf(sections, "Missing Information", RR_SPECS.miss)
        model.con = objectsOf(sections, "Conflicts", RR_SPECS.con)
        model.risks = objectsOf(sections, "Risks", RR_SPECS.risks)
        model.oq = objectsOf(sections, "Open Questions", RR_SPECS.oq)
        model.flowp = objectsOf(sections, "Positive Flows", RR_SPECS.flowp)
        model.flown = objectsOf(sections, "Negative Flows", RR_SPECS.flown)
        model.trace = objectsOf(sections, "Traceability", RR_SPECS.trace)

        model.ids = {
            req: model.requirements.map((r) => r.id).filter(Boolean),
            br: model.br.map((r) => r.id).filter(Boolean),
            ac: model.ac.map((r) => r.id).filter(Boolean),
            val: model.val.map((r) => r.id).filter(Boolean),
            bnd: model.bnd.map((r) => r.id).filter(Boolean),
            risk: model.risks.map((r) => r.id).filter(Boolean),
            src: model.sources.map((r) => r.id).filter(Boolean)
        }
    }

    if (model.stage === "jira-tasks") {
        model.tasks = [...parseBlocks(sections.get("Tasks") ?? "").entries()].map(([id, body]) => ({
            id,
            body,
            fields: parseListFields(body)
        }))
        model.coverage = objectsOf(sections, "Coverage", JIRA_SPEC.coverage)
        model.duplicates = objectsOf(sections, "Duplicate Candidates", JIRA_SPEC.duplicates)
        model.blockers = objectsOf(sections, "Open Questions and Blockers", JIRA_SPEC.blockers)
        model.idsFor = (id) => matchIds(id, ID_PATTERNS.task)
    }

    if (model.stage === "test-model") {
        model.cases = [...parseBlocks(sections.get("Scenarios") ?? "").entries()].map(([id, body]) => ({
            id,
            body,
            fields: parseListFields(body)
        }))
        model.coverage = objectsOf(sections, "Coverage", TEST_SPEC.coverage)
        model.riskBased = objectsOf(sections, "Risk-Based Scenarios", TEST_SPEC.riskBased)
        model.blockers = objectsOf(sections, "Open Questions and Blockers", TEST_SPEC.blockers)
    }

    if (model.stage === "coverage-map") {
        const text = sections.get("Coverage Map") ?? fm.body
        model.points = tableToObjects(parseTables(text)[0] ?? null, COVERAGE_SPEC.points)
        const summaryText = sections.get("Summary") ?? ""
        model.summary = parseTables(summaryText)[0]?.rows ?? []
    }

    return model
}

export function loadArtifact(path) {
    return loadArtifactText(readFileSync(path, "utf8"), path)
}

export function tryLoad(path) {
    return path && existsSync(path) ? loadArtifact(path) : null
}
