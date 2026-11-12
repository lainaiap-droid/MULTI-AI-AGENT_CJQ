import { tool } from "@opencode-ai/plugin"

/**
 * Confluence read-only tool.
 *
 * Operations:
 * - get_page       — нормализованная страница: метаданные + тело
 * - get_children   — дочерние страницы
 * - get_comments   — комментарии страницы (footer / inline / all)
 * - search         — поиск по CQL
 *
 * Доступ только на чтение. Создание, изменение и удаление страниц не реализованы.
 */

const OPERATIONS = ["get_page", "get_children", "get_comments", "search"] as const

function getConfig() {
    const baseUrl = process.env.CONFLUENCE_URL
    const email = process.env.CONFLUENCE_EMAIL
    const token = process.env.CONFLUENCE_API_TOKEN

    if (!baseUrl || !email || !token) {
        throw new Error(
            "Не заданы переменные окружения Confluence: CONFLUENCE_URL, CONFLUENCE_EMAIL, CONFLUENCE_API_TOKEN"
        )
    }

    const trimmed = baseUrl.trim().replace(/\/+$/, "")
    const origin = new URL(trimmed).origin
    const wiki = trimmed.endsWith("/wiki") ? trimmed : `${trimmed}/wiki`

    return { origin, wiki, email, token }
}

function authHeader(email: string, token: string) {
    return `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`
}

async function request(url: string, email: string, token: string) {
    const response = await fetch(url, {
        method: "GET",
        headers: {
            Authorization: authHeader(email, token),
            Accept: "application/json"
        }
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
        throw new Error("Confluence API вернул не-JSON ответ")
    }
}

function pageUrl(origin: string, links: any, id: string) {
    const webui = links?.webui
    return webui ? `${origin}${webui.startsWith("/") ? "" : "/"}${webui}` : `${origin}/wiki/pages/viewpage.action?pageId=${id}`
}

function mapPage(origin: string, data: any) {
    const body =
        data?.body?.storage?.value ??
        data?.body?.view?.value ??
        data?.body?.atlas_doc_format?.value ??
        null

    return {
        id: String(data.id),
        title: data.title ?? null,
        status: data.status ?? null,
        spaceId: data.spaceId ? String(data.spaceId) : null,
        parentId: data.parentId ? String(data.parentId) : null,
        position: data.position ?? null,
        version: data.version?.number ?? null,
        versionMessage: data.version?.message ?? null,
        createdAt: data.createdAt ?? null,
        versionCreatedAt: data.version?.createdAt ?? null,
        authorId: data.authorId ?? null,
        url: pageUrl(origin, data._links, String(data.id)),
        bodyRepresentation: data?.body?.storage
            ? "storage"
            : data?.body?.view
              ? "view"
              : data?.body?.atlas_doc_format
                ? "atlas_doc_format"
                : null,
        body
    }
}

function mapComment(origin: string, pageId: string, data: any) {
    return {
        id: String(data.id),
        status: data.status ?? null,
        title: data.title ?? null,
        parentCommentId: data.parentCommentId ? String(data.parentCommentId) : null,
        version: data.version?.number ?? null,
        createdAt: data.version?.createdAt ?? data.createdAt ?? null,
        authorId: data.version?.authorId ?? data.authorId ?? null,
        resolved: data.resolved ?? null,
        bodyRepresentation: data?.body?.storage ? "storage" : data?.body?.view ? "view" : null,
        body: data?.body?.storage?.value ?? data?.body?.view?.value ?? null,
        url: `${origin}/wiki/pages/viewpage.action?pageId=${pageId}&focusedCommentId=${data.id}`
    }
}

export default tool({
    description:
        "Confluence (только чтение). Операции: get_page — страница с метаданными и телом; get_children — дочерние страницы; get_comments — комментарии страницы; search — поиск по CQL.",

    args: {
        operation: tool.schema
            .string()
            .describe("Операция: get_page | get_children | get_comments | search"),
        pageId: tool.schema
            .string()
            .optional()
            .describe("ID страницы Confluence. Обязателен для get_page, get_children, get_comments"),
        cql: tool.schema
            .string()
            .optional()
            .describe('CQL-запрос для search, например: type = page AND space = "UP"'),
        bodyFormat: tool.schema
            .string()
            .optional()
            .describe("Формат тела для get_page: storage (по умолчанию) | view | atlas_doc_format"),
        commentType: tool.schema
            .string()
            .optional()
            .describe("Тип комментариев для get_comments: footer (по умолчанию) | inline | all"),
        limit: tool.schema.number().optional().describe("Максимум записей (1–250)"),
        start: tool.schema
            .number()
            .optional()
            .describe("Смещение для search (устаревшая пагинация Confluence)"),
        cursor: tool.schema
            .string()
            .optional()
            .describe("Курсор пагинации из предыдущего ответа (_links.next)")
    },

    async execute(args) {
        const operation = (args.operation || "").trim()

        if (!OPERATIONS.includes(operation as (typeof OPERATIONS)[number])) {
            throw new Error(`Неизвестная операция: ${operation}. Доступно: ${OPERATIONS.join(", ")}`)
        }

        const { origin, wiki, email, token } = getConfig()
        const limit = Math.min(Math.max(args.limit ?? 25, 1), 250)

        if (operation === "search") {
            if (!args.cql || !args.cql.trim()) {
                throw new Error("Для search обязателен параметр cql")
            }

            const params = new URLSearchParams({
                cql: args.cql,
                limit: String(limit)
            })
            if (args.start !== undefined) params.set("start", String(args.start))

            const data = await request(
                `${wiki}/rest/api/content/search?${params.toString()}`,
                email,
                token
            )

            return JSON.stringify({
                operation,
                cql: args.cql,
                size: data.size ?? null,
                totalSize: data.totalSize ?? null,
                start: data.start ?? null,
                limit: data.limit ?? null,
                next: data._links?.next ?? null,
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

        if (!args.pageId) {
            throw new Error(`Для операции ${operation} обязателен параметр pageId`)
        }

        const pageId = args.pageId.trim()

        if (operation === "get_page") {
            const bodyFormat = args.bodyFormat ?? "storage"
            const params = new URLSearchParams({ "body-format": bodyFormat })
            const data = await request(
                `${wiki}/api/v2/pages/${pageId}?${params.toString()}`,
                email,
                token
            )

            return JSON.stringify({ operation, page: mapPage(origin, data) })
        }

        if (operation === "get_children") {
            const params = new URLSearchParams({ limit: String(limit) })
            if (args.cursor) params.set("cursor", args.cursor)

            const data = await request(
                `${wiki}/api/v2/pages/${pageId}/children?${params.toString()}`,
                email,
                token
            )

            return JSON.stringify({
                operation,
                pageId,
                next: data._links?.next ?? null,
                results: (data.results ?? []).map((item: any) => ({
                    id: String(item.id),
                    title: item.title ?? null,
                    status: item.status ?? null,
                    spaceId: item.spaceId ? String(item.spaceId) : null,
                    childPosition: item.childPosition ?? null,
                    url: pageUrl(origin, item._links, String(item.id))
                }))
            })
        }

        // get_comments
        const commentType = args.commentType ?? "footer"
        const types =
            commentType === "all" ? ["footer", "inline"] : commentType === "inline" ? ["inline"] : ["footer"]

        const results: any[] = []
        const nextLinks: Record<string, string | null> = {}

        for (const type of types) {
            const params = new URLSearchParams({ limit: String(limit) })
            if (args.cursor) params.set("cursor", args.cursor)

            const data = await request(
                `${wiki}/api/v2/pages/${pageId}/${type}-comments?${params.toString()}`,
                email,
                token
            )

            nextLinks[type] = data._links?.next ?? null
            for (const item of data.results ?? []) {
                results.push({ commentType: type, ...mapComment(origin, pageId, item) })
            }
        }

        return JSON.stringify({
            operation,
            pageId,
            commentType,
            count: results.length,
            next: nextLinks,
            results
        })
    }
})
