import { readFileSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { Plugin } from "@opencode/plugin"

/**
 * Confluence REST API (read-only).
 *
 * Основано на вызове /wiki/api/v2/pages/{id}?body-format=storage.
 * Доступ только на чтение: создание, изменение и удаление страниц не реализованы.
 *
 * Секреты читаются в порядке: переменная окружения -> файл секретов.
 * Файл по умолчанию: ~/.secrets/qa-agent.env (переопределяется QA_SECRETS_FILE).
 * Формат файла: строки KEY=VALUE.
 */

type BodyFormat = "storage" | "view" | "atlas_doc_format"

let secretsCache: { mtimeMs: number; values: Map<string, string> } | null = null

function secretsFile() {
    return process.env.QA_SECRETS_FILE?.trim() || join(homedir(), ".secrets", "qa-agent.env")
}

function readSecrets(): Map<string, string> {
    const path = secretsFile()
    const map = new Map<string, string>()

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

function secret(name: string) {
    const fromEnv = process.env[name]
    if (fromEnv && fromEnv.trim()) return fromEnv.trim()

    const fromFile = readSecrets().get(name)
    return fromFile && fromFile.trim() ? fromFile.trim() : undefined
}

function config() {
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

async function request(url: string, email: string, token: string) {
    const auth = Buffer.from(`${email}:${token}`).toString("base64")
    const response = await fetch(url, {
        headers: { Authorization: `Basic ${auth}`, Accept: "application/json" }
    })
    const text = await response.text()

    if (!response.ok) {
        throw new Error(
            `Confluence API error: ${response.status} ${response.statusText}. ${text.slice(0, 500)}`
        )
    }

    try {
        return JSON.parse(text)
    } catch {
        throw new Error("Confluence API returned non-JSON response")
    }
}

function pageUrl(origin: string, links: any, id: string) {
    const webui = links?.webui
    return webui
        ? `${origin}${webui.startsWith("/") ? "" : "/"}${webui}`
        : `${origin}/wiki/pages/viewpage.action?pageId=${id}`
}

async function requestOptional(url: string, email: string, token: string) {
    try {
        return await request(url, email, token)
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (message.includes("404")) return null
        throw error
    }
}

/**
 * Content status (бейдж Confluence) хранится в page property
 * `content-state-published`, а не в поле `status` страницы.
 * `status` — это lifecycle: `current` или `draft`.
 */
async function contentStatus(wiki: string, pageId: string, email: string, token: string) {
    const data = await requestOptional(
        `${wiki}/rest/api/content/${pageId}/property/content-state-published`,
        email,
        token
    )

    if (!data) return null

    let value = data.value
    if (typeof value === "string") {
        try {
            value = JSON.parse(value)
        } catch {
            return null
        }
    }

    const state = value?.contentState
    if (!state) return null

    return {
        name: state.name ?? null,
        id: state.id ? String(state.id) : null,
        color: state.color ?? null,
        isSpaceState: value.isSpaceState ?? null,
        setBy: value.setterAAID ?? null,
        propertyVersion: data.version?.number ?? null
    }
}

function clamp(value: any, min: number, max: number, fallback: number) {
    const n = Number.isFinite(Number(value)) ? Number(value) : fallback
    return Math.min(Math.max(n, min), max)
}

function requireString(value: any, name: string) {
    if (value === undefined || value === null || `${value}`.trim() === "") {
        throw new Error(`Missing required argument: ${name}`)
    }
    return `${value}`.trim()
}

const pageInput = {
    type: "object",
    properties: {
        pageId: { type: "string", description: "Confluence page ID" },
        bodyFormat: {
            type: "string",
            enum: ["storage", "view", "atlas_doc_format"],
            description: "Body representation. Default: storage"
        }
    },
    required: ["pageId"],
    additionalProperties: false
}

export default Plugin.define({
    id: "confluence",
    async setup(ctx) {
        await ctx.tool.transform((editor) => {
            editor.namespace({
                name: "confluence",
                description: "Confluence REST API, read-only: page, children, comments, CQL search"
            })

            editor.add({
                name: "get_page",
                description:
                    "Read a Confluence page by ID via REST API. Returns metadata (id, title, lifecycle status, content status, version, space, parent, URL) and the body.",
                input: pageInput as any,
                options: { namespace: "confluence", codemode: true },
                execute: async (raw) => {
                    const input = raw as { pageId: string; bodyFormat?: BodyFormat }
                    const { origin, wiki, email, token } = config()
                    const pageId = requireString(input.pageId, "pageId")
                    const bodyFormat = input.bodyFormat ?? "storage"
                    const params = new URLSearchParams({ "body-format": bodyFormat })
                    const data = await request(
                        `${wiki}/api/v2/pages/${pageId}?${params.toString()}`,
                        email,
                        token
                    )
                    const contentState = await contentStatus(wiki, pageId, email, token)

                    return {
                        content: JSON.stringify({
                            operation: "get_page",
                            page: {
                                id: String(data.id),
                                title: data.title ?? null,
                                status: data.status ?? null,
                                contentStatus: contentState,
                                spaceId: data.spaceId ? String(data.spaceId) : null,
                                parentId: data.parentId ? String(data.parentId) : null,
                                version: data.version?.number ?? null,
                                versionMessage: data.version?.message ?? null,
                                createdAt: data.createdAt ?? null,
                                versionCreatedAt: data.version?.createdAt ?? null,
                                url: pageUrl(origin, data._links, String(data.id)),
                                bodyRepresentation: bodyFormat,
                                body:
                                    data?.body?.storage?.value ??
                                    data?.body?.view?.value ??
                                    data?.body?.atlas_doc_format?.value ??
                                    null
                            }
                        })
                    }
                }
            })

            editor.add({
                name: "get_children",
                description: "List direct child pages of a Confluence page via REST API.",
                input: {
                    type: "object",
                    properties: {
                        pageId: { type: "string", description: "Confluence page ID" },
                        limit: { type: "number", description: "1-250. Default: 25" },
                        cursor: { type: "string", description: "Pagination cursor" }
                    },
                    required: ["pageId"],
                    additionalProperties: false
                } as any,
                options: { namespace: "confluence", codemode: true },
                execute: async (raw) => {
                    const input = raw as { pageId: string; limit?: number; cursor?: string }
                    const { origin, wiki, email, token } = config()
                    const pageId = requireString(input.pageId, "pageId")
                    const params = new URLSearchParams({
                        limit: String(clamp(input.limit, 1, 250, 25))
                    })
                    if (input.cursor) params.set("cursor", input.cursor)

                    const data = await request(
                        `${wiki}/api/v2/pages/${pageId}/children?${params.toString()}`,
                        email,
                        token
                    )

                    return {
                        content: JSON.stringify({
                            operation: "get_children",
                            pageId,
                            next: data._links?.next ?? null,
                            results: (data.results ?? []).map((item: any) => ({
                                id: String(item.id),
                                title: item.title ?? null,
                                status: item.status ?? null,
                                spaceId: item.spaceId ? String(item.spaceId) : null,
                                url: pageUrl(origin, item._links, String(item.id))
                            }))
                        })
                    }
                }
            })

            editor.add({
                name: "get_comments",
                description: "Read footer and/or inline comments of a Confluence page via REST API.",
                input: {
                    type: "object",
                    properties: {
                        pageId: { type: "string", description: "Confluence page ID" },
                        commentType: {
                            type: "string",
                            enum: ["footer", "inline", "all"],
                            description: "Default: footer"
                        },
                        limit: { type: "number", description: "1-250. Default: 25" }
                    },
                    required: ["pageId"],
                    additionalProperties: false
                } as any,
                options: { namespace: "confluence", codemode: true },
                execute: async (raw) => {
                    const input = raw as {
                        pageId: string
                        commentType?: "footer" | "inline" | "all"
                        limit?: number
                    }
                    const { origin, wiki, email, token } = config()
                    const pageId = requireString(input.pageId, "pageId")
                    const commentType = input.commentType ?? "footer"
                    const limit = clamp(input.limit, 1, 250, 25)
                    const types =
                        commentType === "all"
                            ? ["footer", "inline"]
                            : commentType === "inline"
                              ? ["inline"]
                              : ["footer"]

                    const results: any[] = []
                    for (const type of types) {
                        const data = await request(
                            `${wiki}/api/v2/pages/${pageId}/${type}-comments?limit=${limit}`,
                            email,
                            token
                        )
                        for (const item of data.results ?? []) {
                            results.push({
                                commentType: type,
                                id: String(item.id),
                                status: item.status ?? null,
                                parentCommentId: item.parentCommentId
                                    ? String(item.parentCommentId)
                                    : null,
                                version: item.version?.number ?? null,
                                createdAt: item.version?.createdAt ?? item.createdAt ?? null,
                                authorId: item.version?.authorId ?? item.authorId ?? null,
                                resolved: item.resolved ?? null,
                                body:
                                    item?.body?.storage?.value ?? item?.body?.view?.value ?? null
                            })
                        }
                    }

                    return {
                        content: JSON.stringify({
                            operation: "get_comments",
                            pageId,
                            commentType,
                            count: results.length,
                            results
                        })
                    }
                }
            })

            editor.add({
                name: "search",
                description: "Search Confluence content using CQL via REST API.",
                input: {
                    type: "object",
                    properties: {
                        cql: { type: "string", description: 'CQL, e.g. type = page AND space = "UP"' },
                        limit: { type: "number", description: "1-100. Default: 25" },
                        start: { type: "number", description: "Offset for legacy pagination" }
                    },
                    required: ["cql"],
                    additionalProperties: false
                } as any,
                options: { namespace: "confluence", codemode: true },
                execute: async (raw) => {
                    const input = raw as { cql: string; limit?: number; start?: number }
                    const { origin, wiki, email, token } = config()
                    const cql = requireString(input.cql, "cql")
                    const params = new URLSearchParams({
                        cql,
                        limit: String(clamp(input.limit, 1, 100, 25)),
                        expand: "space,version"
                    })
                    if (input.start !== undefined) params.set("start", String(input.start))

                    const data = await request(
                        `${wiki}/rest/api/content/search?${params.toString()}`,
                        email,
                        token
                    )

                    return {
                        content: JSON.stringify({
                            operation: "search",
                            cql,
                            size: data.size ?? null,
                            totalSize: data.totalSize ?? null,
                            start: data.start ?? null,
                            limit: data.limit ?? null,
                            results: (data.results ?? []).map((item: any) => ({
                                id: String(item.id),
                                type: item.type ?? null,
                                status: item.status ?? null,
                                title: item.title ?? null,
                                spaceKey: item.space?.key ?? null,
                                version: item.version?.number ?? null,
                                url: pageUrl(origin, item._links, String(item.id))
                            }))
                        })
                    }
                }
            })
        })
    }
})
