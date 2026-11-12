#!/usr/bin/env node
/**
 * qa-tools MCP server (stdio).
 *
 * Exposes:
 * - Confluence read-only operations (env: CONFLUENCE_URL, CONFLUENCE_EMAIL, CONFLUENCE_API_TOKEN)
 * - Qase read operations and create-only write operations (env: QASE_API_TOKEN, optional QASE_URL)
 *
 * This server intentionally has no update/delete/transition operations.
 */

import readline from "node:readline"
import { readFileSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

const SERVER_NAME = "qa-tools"
const SERVER_VERSION = "1.0.0"
const DEFAULT_PROTOCOL_VERSION = "2024-11-05"

// ---------------------------------------------------------------- secrets

let secretsCache = null

function secretsFile() {
    return process.env.QA_SECRETS_FILE?.trim() || join(homedir(), ".secrets", "qa-agent.env")
}

function readSecrets() {
    const path = secretsFile()
    const map = new Map()

    try {
        const stat = statSync(path)
        if (secretsCache && secretsCache.mtimeMs === stat.mtimeMs) return secretsCache.values

        const text = readFileSync(path, "utf8")
        for (const line of text.split(/\r?\n/)) {
            const trimmed = line.trim()
            if (!trimmed || trimmed.startsWith("#")) continue

            const eq = trimmed.indexOf("=")
            if (eq <= 0) continue

            const key = trimmed.slice(0, eq).trim()
            const value = trimmed.slice(eq + 1).trim()
            if (key) map.set(key, value)
        }

        secretsCache = { mtimeMs: stat.mtimeMs, values: map }
    } catch {
        // Файл недоступен — работаем только на переменных окружения.
    }

    return map
}

function secret(name) {
    const fromEnv = process.env[name]
    if (fromEnv && fromEnv.trim()) return fromEnv.trim()

    const fromFile = readSecrets().get(name)
    if (fromFile && fromFile.trim()) return fromFile.trim()

    // Qase token живёт в отдельном файле: его читает официальный MCP
    // штатной подстановкой {file:...}, которая работает только с целым файлом.
    if (name === "QASE_API_TOKEN") {
        try {
            const value = readFileSync(join(homedir(), ".secrets", "qase-token"), "utf8").trim()
            if (value) return value
        } catch {
            // Файла нет — остаёмся без токена.
        }
    }

    return undefined
}

// ---------------------------------------------------------------- utilities

function send(message) {
    process.stdout.write(`${JSON.stringify(message)}\n`)
}

function confluenceConfig() {
    const baseUrl = secret("CONFLUENCE_URL")
    const email = secret("CONFLUENCE_EMAIL")
    const token = secret("CONFLUENCE_API_TOKEN")

    if (!baseUrl || !email || !token) {
        throw new Error(
            "Confluence credentials missing: set CONFLUENCE_URL, CONFLUENCE_EMAIL, CONFLUENCE_API_TOKEN " +
                "as environment variables, or in " +
                secretsFile()
        )
    }

    const trimmed = baseUrl.trim().replace(/\/+$/, "")
    const origin = new URL(trimmed).origin
    const wiki = trimmed.endsWith("/wiki") ? trimmed : `${trimmed}/wiki`

    return { origin, wiki, email, token }
}

function qaseConfig() {
    const token = secret("QASE_API_TOKEN")

    if (!token) {
        throw new Error(
            "Qase credentials missing: set QASE_API_TOKEN as an environment variable, or in " +
                secretsFile()
        )
    }

    const baseUrl = (secret("QASE_URL") ?? "https://api.qase.io/v1").replace(/\/+$/, "")

    return { token, baseUrl }
}

function basicAuth(email, token) {
    return `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`
}

async function getJson(url, headers) {
    const response = await fetch(url, { method: "GET", headers })
    const text = await response.text()

    if (!response.ok) {
        throw new Error(
            `HTTP ${response.status} ${response.statusText}: ${text.slice(0, 500)}`
        )
    }

    try {
        return JSON.parse(text)
    } catch {
        throw new Error("Response is not JSON")
    }
}

async function qaseRequest(method, path, body) {
    const { token, baseUrl } = qaseConfig()
    const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
            Token: token,
            Accept: "application/json",
            ...(body ? { "Content-Type": "application/json" } : {})
        },
        ...(body ? { body: JSON.stringify(body) } : {})
    })

    const text = await response.text()
    let parsed = null
    try {
        parsed = text ? JSON.parse(text) : null
    } catch {
        parsed = null
    }

    if (!response.ok) {
        const message = parsed?.errorMessage ?? parsed?.message ?? text.slice(0, 500)
        throw new Error(`Qase API error: ${response.status} ${response.statusText}. ${message}`)
    }

    if (parsed && parsed.status === false) {
        throw new Error(`Qase API error: ${parsed.errorMessage ?? "unknown error"}`)
    }

    return parsed
}

function pageUrl(origin, links, id) {
    const webui = links?.webui
    return webui
        ? `${origin}${webui.startsWith("/") ? "" : "/"}${webui}`
        : `${origin}/wiki/pages/viewpage.action?pageId=${id}`
}

function mapPage(origin, data) {
    return {
        id: String(data.id),
        title: data.title ?? null,
        status: data.status ?? null,
        spaceId: data.spaceId ? String(data.spaceId) : null,
        parentId: data.parentId ? String(data.parentId) : null,
        version: data.version?.number ?? null,
        versionMessage: data.version?.message ?? null,
        createdAt: data.createdAt ?? null,
        versionCreatedAt: data.version?.createdAt ?? null,
        url: pageUrl(origin, data._links, String(data.id)),
        bodyRepresentation: data?.body?.storage
            ? "storage"
            : data?.body?.view
              ? "view"
              : data?.body?.atlas_doc_format
                ? "atlas_doc_format"
                : null,
        body:
            data?.body?.storage?.value ??
            data?.body?.view?.value ??
            data?.body?.atlas_doc_format?.value ??
            null
    }
}

function normalizeCase(item) {
    return {
        id: item.id,
        title: item.title ?? null,
        suiteId: item.suite_id ?? null,
        description: item.description ?? null,
        preconditions: item.preconditions ?? null,
        postconditions: item.postconditions ?? null,
        priority: item.priority ?? null,
        type: item.type ?? null,
        status: item.status ?? null,
        stepsType: item.steps_type ?? null,
        steps: item.steps ?? [],
        tags: item.tags ?? [],
        created: item.created_at ?? item.created ?? null,
        updated: item.updated_at ?? item.updated ?? null
    }
}

function requireArg(args, name) {
    const value = args?.[name]
    if (value === undefined || value === null || `${value}`.trim() === "") {
        throw new Error(`Missing required argument: ${name}`)
    }
    return `${value}`.trim()
}

function clamp(value, min, max, fallback) {
    const n = Number.isFinite(value) ? value : fallback
    return Math.min(Math.max(n, min), max)
}

// ---------------------------------------------------------------- confluence

async function confluenceGetPage(args) {
    const { origin, wiki, email, token } = confluenceConfig()
    const pageId = requireArg(args, "pageId")
    const bodyFormat = args?.bodyFormat ?? "storage"
    const params = new URLSearchParams({ "body-format": bodyFormat })

    const data = await getJson(`${wiki}/api/v2/pages/${pageId}?${params.toString()}`, {
        Authorization: basicAuth(email, token),
        Accept: "application/json"
    })

    return { page: mapPage(origin, data) }
}

async function confluenceGetChildren(args) {
    const { origin, wiki, email, token } = confluenceConfig()
    const pageId = requireArg(args, "pageId")
    const limit = clamp(args?.limit, 1, 250, 25)
    const params = new URLSearchParams({ limit: String(limit) })
    if (args?.cursor) params.set("cursor", args.cursor)

    const data = await getJson(
        `${wiki}/api/v2/pages/${pageId}/children?${params.toString()}`,
        { Authorization: basicAuth(email, token), Accept: "application/json" }
    )

    return {
        pageId,
        next: data._links?.next ?? null,
        results: (data.results ?? []).map((item) => ({
            id: String(item.id),
            title: item.title ?? null,
            status: item.status ?? null,
            spaceId: item.spaceId ? String(item.spaceId) : null,
            childPosition: item.childPosition ?? null,
            url: pageUrl(origin, item._links, String(item.id))
        }))
    }
}

async function confluenceGetComments(args) {
    const { origin, wiki, email, token } = confluenceConfig()
    const pageId = requireArg(args, "pageId")
    const commentType = args?.commentType ?? "footer"
    const limit = clamp(args?.limit, 1, 250, 25)

    const types =
        commentType === "all"
            ? ["footer", "inline"]
            : commentType === "inline"
              ? ["inline"]
              : ["footer"]

    const results = []
    const next = {}

    for (const type of types) {
        const params = new URLSearchParams({ limit: String(limit) })
        if (args?.cursor) params.set("cursor", args.cursor)

        const data = await getJson(
            `${wiki}/api/v2/pages/${pageId}/${type}-comments?${params.toString()}`,
            { Authorization: basicAuth(email, token), Accept: "application/json" }
        )

        next[type] = data._links?.next ?? null

        for (const item of data.results ?? []) {
            results.push({
                commentType: type,
                id: String(item.id),
                status: item.status ?? null,
                title: item.title ?? null,
                parentCommentId: item.parentCommentId ? String(item.parentCommentId) : null,
                version: item.version?.number ?? null,
                createdAt: item.version?.createdAt ?? item.createdAt ?? null,
                authorId: item.version?.authorId ?? item.authorId ?? null,
                resolved: item.resolved ?? null,
                body:
                    item?.body?.storage?.value ??
                    item?.body?.view?.value ??
                    null,
                url: `${origin}/wiki/pages/viewpage.action?pageId=${pageId}&focusedCommentId=${item.id}`
            })
        }
    }

    return { pageId, commentType, count: results.length, next, results }
}

async function confluenceSearch(args) {
    const { origin, wiki, email, token } = confluenceConfig()
    const cql = requireArg(args, "cql")
    const limit = clamp(args?.limit, 1, 100, 25)
    const params = new URLSearchParams({ cql, limit: String(limit), expand: "space,version" })
    if (args?.start !== undefined) params.set("start", String(args.start))

    const data = await getJson(`${wiki}/rest/api/content/search?${params.toString()}`, {
        Authorization: basicAuth(email, token),
        Accept: "application/json"
    })

    return {
        cql,
        size: data.size ?? null,
        totalSize: data.totalSize ?? null,
        start: data.start ?? null,
        limit: data.limit ?? null,
        next: data._links?.next ?? null,
        results: (data.results ?? []).map((item) => ({
            id: String(item.id),
            type: item.type ?? null,
            status: item.status ?? null,
            title: item.title ?? null,
            spaceKey: item.space?.key ?? null,
            version: item.version?.number ?? null,
            url: pageUrl(origin, item._links, String(item.id))
        }))
    }
}

// --------------------------------------------------------------------- qase

async function qaseListProjects(args) {
    const limit = clamp(args?.limit, 1, 100, 25)
    const offset = Math.max(args?.offset ?? 0, 0)
    const data = await qaseRequest("GET", `/project?limit=${limit}&offset=${offset}`)

    return {
        total: data.result?.total ?? null,
        filtered: data.result?.filtered ?? null,
        count: data.result?.count ?? null,
        entities: (data.result?.entities ?? []).map((p) => ({
            code: p.code,
            title: p.title,
            counts: p.counts ?? null
        }))
    }
}

async function qaseListSuites(args) {
    const projectCode = requireArg(args, "projectCode")
    const limit = clamp(args?.limit, 1, 100, 25)
    const offset = Math.max(args?.offset ?? 0, 0)
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) })
    if (args?.search) params.set("search", args.search)

    const data = await qaseRequest(
        "GET",
        `/suite/${encodeURIComponent(projectCode)}?${params.toString()}`
    )

    return {
        projectCode,
        total: data.result?.total ?? null,
        filtered: data.result?.filtered ?? null,
        entities: (data.result?.entities ?? []).map((s) => ({
            id: s.id,
            title: s.title,
            parentId: s.parent_id ?? null,
            casesCount: s.cases_count ?? null
        }))
    }
}

async function qaseGetSuite(args) {
    const projectCode = requireArg(args, "projectCode")
    const suiteId = requireArg(args, "suiteId")
    const data = await qaseRequest(
        "GET",
        `/suite/${encodeURIComponent(projectCode)}/${suiteId}`
    )
    return { projectCode, suiteId, result: data.result }
}

async function qaseSearchCases(args) {
    const projectCode = requireArg(args, "projectCode")
    const limit = clamp(args?.limit, 1, 100, 25)
    const offset = Math.max(args?.offset ?? 0, 0)
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) })
    if (args?.search) params.set("search", args.search)
    if (args?.suiteId !== undefined) params.set("suite_id", String(args.suiteId))

    const data = await qaseRequest(
        "GET",
        `/case/${encodeURIComponent(projectCode)}?${params.toString()}`
    )

    return {
        projectCode,
        total: data.result?.total ?? null,
        filtered: data.result?.filtered ?? null,
        entities: (data.result?.entities ?? []).map(normalizeCase)
    }
}

async function qaseGetCase(args) {
    const projectCode = requireArg(args, "projectCode")
    const caseId = requireArg(args, "caseId")
    const data = await qaseRequest(
        "GET",
        `/case/${encodeURIComponent(projectCode)}/${caseId}`
    )
    return { projectCode, caseId, result: normalizeCase(data.result) }
}

const QASE_PRIORITY = { HIGH: 1, MEDIUM: 2, LOW: 3 }

async function qaseCreateSuite(args) {
    const projectCode = requireArg(args, "projectCode")
    const title = requireArg(args, "title")

    const body = { title }
    if (args?.description) body.description = args.description
    if (args?.parentId !== undefined) body.parent_id = args.parentId

    const data = await qaseRequest(
        "POST",
        `/suite/${encodeURIComponent(projectCode)}`,
        body
    )

    return { projectCode, created: true, id: data.result?.id ?? null, result: data.result ?? null }
}

async function qaseCreateCase(args) {
    const projectCode = requireArg(args, "projectCode")
    const title = requireArg(args, "title")
    const suiteId = requireArg(args, "suiteId")

    const body = { title, suite_id: Number(suiteId) }
    if (args?.description) body.description = args.description
    if (args?.preconditions) body.preconditions = args.preconditions
    if (args?.postconditions) body.postconditions = args.postconditions

    if (args?.priority) {
        const key = `${args.priority}`.trim().toUpperCase()
        if (!(key in QASE_PRIORITY)) {
            throw new Error("priority must be HIGH, MEDIUM or LOW")
        }
        body.priority = QASE_PRIORITY[key]
    }

    if (Array.isArray(args?.steps) && args.steps.length > 0) {
        body.steps = args.steps.map((step, index) => ({
            position: index + 1,
            action: step.action,
            expected_result: step.expected_result ?? "",
            data: step.data ?? ""
        }))
    }

    const data = await qaseRequest(
        "POST",
        `/case/${encodeURIComponent(projectCode)}`,
        body
    )

    return { projectCode, created: true, id: data.result?.id ?? null, result: data.result ?? null }
}

// ------------------------------------------------------------- registrations

const TOOLS = [
    {
        name: "confluence_get_page",
        description:
            "Read a Confluence page by ID. Returns normalized metadata (id, title, status, version, space, parent, URL) and the page body.",
        inputSchema: {
            type: "object",
            properties: {
                pageId: { type: "string", description: "Confluence page ID" },
                bodyFormat: {
                    type: "string",
                    enum: ["storage", "view", "atlas_doc_format"],
                    description: "Body representation. Default: storage"
                }
            },
            required: ["pageId"]
        },
        handler: confluenceGetPage
    },
    {
        name: "confluence_get_children",
        description: "List direct child pages of a Confluence page.",
        inputSchema: {
            type: "object",
            properties: {
                pageId: { type: "string", description: "Confluence page ID" },
                limit: { type: "number", description: "1-250. Default: 25" },
                cursor: { type: "string", description: "Pagination cursor from a previous response" }
            },
            required: ["pageId"]
        },
        handler: confluenceGetChildren
    },
    {
        name: "confluence_get_comments",
        description: "Read footer and/or inline comments of a Confluence page.",
        inputSchema: {
            type: "object",
            properties: {
                pageId: { type: "string", description: "Confluence page ID" },
                commentType: {
                    type: "string",
                    enum: ["footer", "inline", "all"],
                    description: "Default: footer"
                },
                limit: { type: "number", description: "1-250. Default: 25" },
                cursor: { type: "string", description: "Pagination cursor from a previous response" }
            },
            required: ["pageId"]
        },
        handler: confluenceGetComments
    },
    {
        name: "confluence_search",
        description: "Search Confluence content using CQL.",
        inputSchema: {
            type: "object",
            properties: {
                cql: { type: "string", description: 'CQL, e.g. type = page AND space = "UP"' },
                limit: { type: "number", description: "1-100. Default: 25" },
                start: { type: "number", description: "Offset for legacy pagination" }
            },
            required: ["cql"]
        },
        handler: confluenceSearch
    },
    {
        name: "qase_list_projects",
        description: "List Qase projects available to the token.",
        inputSchema: {
            type: "object",
            properties: {
                limit: { type: "number", description: "1-100. Default: 25" },
                offset: { type: "number", description: "Default: 0" }
            }
        },
        handler: qaseListProjects
    },
    {
        name: "qase_list_suites",
        description: "List suites of a Qase project.",
        inputSchema: {
            type: "object",
            properties: {
                projectCode: { type: "string", description: "Qase project code" },
                search: { type: "string", description: "Optional title filter" },
                limit: { type: "number", description: "1-100. Default: 25" },
                offset: { type: "number", description: "Default: 0" }
            },
            required: ["projectCode"]
        },
        handler: qaseListSuites
    },
    {
        name: "qase_get_suite",
        description: "Read one Qase suite.",
        inputSchema: {
            type: "object",
            properties: {
                projectCode: { type: "string", description: "Qase project code" },
                suiteId: { type: "number", description: "Suite ID" }
            },
            required: ["projectCode", "suiteId"]
        },
        handler: qaseGetSuite
    },
    {
        name: "qase_search_cases",
        description: "Search test cases in a Qase project.",
        inputSchema: {
            type: "object",
            properties: {
                projectCode: { type: "string", description: "Qase project code" },
                search: { type: "string", description: "Optional title filter" },
                suiteId: { type: "number", description: "Optional suite filter" },
                limit: { type: "number", description: "1-100. Default: 25" },
                offset: { type: "number", description: "Default: 0" }
            },
            required: ["projectCode"]
        },
        handler: qaseSearchCases
    },
    {
        name: "qase_get_case",
        description: "Read one Qase test case.",
        inputSchema: {
            type: "object",
            properties: {
                projectCode: { type: "string", description: "Qase project code" },
                caseId: { type: "number", description: "Test case ID" }
            },
            required: ["projectCode", "caseId"]
        },
        handler: qaseGetCase
    },
    {
        name: "qase_create_suite",
        description: "Create a new Qase suite. Does not modify existing suites.",
        inputSchema: {
            type: "object",
            properties: {
                projectCode: { type: "string", description: "Qase project code" },
                title: { type: "string", description: "Suite title" },
                description: { type: "string", description: "Optional description" },
                parentId: { type: "number", description: "Optional parent suite ID" }
            },
            required: ["projectCode", "title"]
        },
        handler: qaseCreateSuite
    },
    {
        name: "qase_create_case",
        description: "Create a new Qase test case. Does not modify existing cases.",
        inputSchema: {
            type: "object",
            properties: {
                projectCode: { type: "string", description: "Qase project code" },
                suiteId: { type: "number", description: "Target suite ID" },
                title: { type: "string", description: "Test case title" },
                description: { type: "string", description: "Optional description" },
                preconditions: { type: "string", description: "Optional preconditions" },
                postconditions: { type: "string", description: "Optional postconditions" },
                priority: {
                    type: "string",
                    enum: ["HIGH", "MEDIUM", "LOW"],
                    description: "Priority (design)"
                },
                steps: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            action: { type: "string" },
                            expected_result: { type: "string" },
                            data: { type: "string" }
                        },
                        required: ["action"]
                    },
                    description: "Classic steps"
                }
            },
            required: ["projectCode", "suiteId", "title"]
        },
        handler: qaseCreateCase
    }
]

const HANDLERS = new Map(TOOLS.map((tool) => [tool.name, tool.handler]))

// ------------------------------------------------------------------- server

function toolList() {
    return TOOLS.map(({ name, description, inputSchema }) => ({
        name,
        description,
        inputSchema
    }))
}

async function handleRequest(request) {
    const { id, method, params } = request

    if (method === "initialize") {
        return {
            protocolVersion: params?.protocolVersion ?? DEFAULT_PROTOCOL_VERSION,
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: SERVER_NAME, version: SERVER_VERSION }
        }
    }

    if (method === "ping") {
        return {}
    }

    if (method === "tools/list") {
        return { tools: toolList() }
    }

    if (method === "tools/call") {
        const name = params?.name
        const handler = HANDLERS.get(name)

        if (!handler) {
            throw new Error(`Unknown tool: ${name}`)
        }

        try {
            const result = await handler(params?.arguments ?? {})
            return {
                content: [
                    {
                        type: "text",
                        text: typeof result === "string" ? result : JSON.stringify(result, null, 2)
                    }
                ]
            }
        } catch (error) {
            return {
                content: [{ type: "text", text: `ERROR: ${error.message}` }],
                isError: true
            }
        }
    }

    const error = new Error(`Method not found: ${method}`)
    error.code = -32601
    throw error
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity })

rl.on("line", (line) => {
    const trimmed = line.trim()
    if (!trimmed) return

    let request
    try {
        request = JSON.parse(trimmed)
    } catch {
        return
    }

    // Notifications have no id and require no response.
    if (request.id === undefined) return

    handleRequest(request)
        .then((result) => {
            send({ jsonrpc: "2.0", id: request.id, result })
        })
        .catch((error) => {
            send({
                jsonrpc: "2.0",
                id: request.id,
                error: { code: error.code ?? -32603, message: error.message }
            })
        })
})

process.on("uncaughtException", (error) => {
    process.stderr.write(`qa-tools fatal: ${error.stack ?? error.message}\n`)
})
