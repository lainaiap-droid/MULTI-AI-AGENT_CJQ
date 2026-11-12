import { tool } from "@opencode-ai/plugin"

/**
 * Qase tool (Qase REST API v1).
 *
 * Read:
 * - list_projects
 * - list_suites
 * - get_suite
 * - search_cases
 * - get_case
 *
 * Write (создание новых сущностей, без изменения существующих):
 * - create_suite
 * - create_case
 *
 * Токен берётся только из переменной окружения QASE_API_TOKEN.
 */

const OPERATIONS = [
    "list_projects",
    "list_suites",
    "get_suite",
    "search_cases",
    "get_case",
    "create_suite",
    "create_case"
] as const

const PRIORITY: Record<string, number> = {
    HIGH: 1,
    MEDIUM: 2,
    LOW: 3
}

function getConfig() {
    const token = process.env.QASE_API_TOKEN

    if (!token) {
        throw new Error("Не задана переменная окружения QASE_API_TOKEN")
    }

    const baseUrl = (process.env.QASE_URL ?? "https://api.qase.io/v1").replace(/\/+$/, "")

    return { token, baseUrl }
}

async function qaseRequest(
    baseUrl: string,
    token: string,
    method: "GET" | "POST",
    path: string,
    body?: unknown
) {
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

    let parsed: any = null
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

function requireString(value: string | undefined, name: string) {
    if (!value || !value.trim()) {
        throw new Error(`Обязательный параметр: ${name}`)
    }
    return value.trim()
}

function normalizeCase(item: any) {
    return {
        id: item.id,
        title: item.title ?? null,
        suiteId: item.suite_id ?? null,
        description: item.description ?? null,
        preconditions: item.preconditions ?? null,
        postconditions: item.postconditions ?? null,
        priority: item.priority ?? null,
        type: item.type ?? null,
        severity: item.severity ?? null,
        automation: item.automation ?? null,
        status: item.status ?? null,
        stepsType: item.steps_type ?? null,
        steps: item.steps ?? [],
        tags: item.tags ?? [],
        created: item.created_at ?? item.created ?? null,
        updated: item.updated_at ?? item.updated ?? null
    }
}

export default tool({
    description:
        "Qase (REST API v1). Чтение: list_projects, list_suites, get_suite, search_cases, get_case. Создание: create_suite, create_case. Не изменяет и не удаляет существующие сущности.",

    args: {
        operation: tool.schema
            .string()
            .describe(
                "Операция: list_projects | list_suites | get_suite | search_cases | get_case | create_suite | create_case"
            ),
        projectCode: tool.schema
            .string()
            .optional()
            .describe("Код проекта Qase, например UP или DEMO"),
        suiteId: tool.schema
            .number()
            .optional()
            .describe("ID suite: обязателен для get_suite, create_case; фильтр для search_cases"),
        caseId: tool.schema.number().optional().describe("ID тест-кейса для get_case"),
        title: tool.schema
            .string()
            .optional()
            .describe("Название suite или тест-кейса для операций создания"),
        description: tool.schema.string().optional().describe("Описание suite или тест-кейса"),
        preconditions: tool.schema.string().optional().describe("Preconditions тест-кейса"),
        postconditions: tool.schema.string().optional().describe("Postconditions тест-кейса"),
        parentId: tool.schema
            .number()
            .optional()
            .describe("ID родительского suite для create_suite"),
        search: tool.schema
            .string()
            .optional()
            .describe("Поисковая строка для search_cases или list_suites"),
        priority: tool.schema
            .string()
            .optional()
            .describe("Priority (design) для create_case: HIGH | MEDIUM | LOW"),
        steps: tool.schema
            .array(
                tool.schema.object({
                    action: tool.schema.string().describe("Шаг теста"),
                    expected_result: tool.schema
                        .string()
                        .optional()
                        .describe("Ожидаемый результат шага"),
                    data: tool.schema.string().optional().describe("Тестовые данные шага")
                })
            )
            .optional()
            .describe("Шаги тест-кейса (classic steps)"),
        limit: tool.schema.number().optional().describe("Максимум записей (1–100)"),
        offset: tool.schema.number().optional().describe("Смещение для пагинации")
    },

    async execute(args) {
        const operation = (args.operation || "").trim()

        if (!OPERATIONS.includes(operation as (typeof OPERATIONS)[number])) {
            throw new Error(`Неизвестная операция: ${operation}. Доступно: ${OPERATIONS.join(", ")}`)
        }

        const { token, baseUrl } = getConfig()
        const limit = Math.min(Math.max(args.limit ?? 25, 1), 100)
        const offset = Math.max(args.offset ?? 0, 0)

        if (operation === "list_projects") {
            const data = await qaseRequest(
                baseUrl,
                token,
                "GET",
                `/project?limit=${limit}&offset=${offset}`
            )

            return JSON.stringify({
                operation,
                total: data.result?.total ?? null,
                filtered: data.result?.filtered ?? null,
                count: data.result?.count ?? null,
                entities: (data.result?.entities ?? []).map((p: any) => ({
                    code: p.code,
                    title: p.title,
                    counts: p.counts ?? null
                }))
            })
        }

        const projectCode = requireString(args.projectCode, "projectCode")

        if (operation === "list_suites") {
            const params = new URLSearchParams({ limit: String(limit), offset: String(offset) })
            if (args.search) params.set("search", args.search)

            const data = await qaseRequest(
                baseUrl,
                token,
                "GET",
                `/suite/${encodeURIComponent(projectCode)}?${params.toString()}`
            )

            return JSON.stringify({
                operation,
                projectCode,
                total: data.result?.total ?? null,
                filtered: data.result?.filtered ?? null,
                entities: (data.result?.entities ?? []).map((s: any) => ({
                    id: s.id,
                    title: s.title,
                    parentId: s.parent_id ?? null,
                    casesCount: s.cases_count ?? null
                }))
            })
        }

        if (operation === "get_suite") {
            const suiteId = requireString(
                args.suiteId !== undefined ? String(args.suiteId) : undefined,
                "suiteId"
            )
            const data = await qaseRequest(
                baseUrl,
                token,
                "GET",
                `/suite/${encodeURIComponent(projectCode)}/${suiteId}`
            )

            return JSON.stringify({ operation, projectCode, suiteId, result: data.result })
        }

        if (operation === "search_cases") {
            const params = new URLSearchParams({ limit: String(limit), offset: String(offset) })
            if (args.search) params.set("search", args.search)
            if (args.suiteId !== undefined) params.set("suite_id", String(args.suiteId))

            const data = await qaseRequest(
                baseUrl,
                token,
                "GET",
                `/case/${encodeURIComponent(projectCode)}?${params.toString()}`
            )

            return JSON.stringify({
                operation,
                projectCode,
                total: data.result?.total ?? null,
                filtered: data.result?.filtered ?? null,
                entities: (data.result?.entities ?? []).map(normalizeCase)
            })
        }

        if (operation === "get_case") {
            const caseId = requireString(
                args.caseId !== undefined ? String(args.caseId) : undefined,
                "caseId"
            )
            const data = await qaseRequest(
                baseUrl,
                token,
                "GET",
                `/case/${encodeURIComponent(projectCode)}/${caseId}`
            )

            return JSON.stringify({
                operation,
                projectCode,
                caseId,
                result: normalizeCase(data.result)
            })
        }

        if (operation === "create_suite") {
            const title = requireString(args.title, "title")

            const body: Record<string, unknown> = { title }
            if (args.description) body.description = args.description
            if (args.parentId !== undefined) body.parent_id = args.parentId

            const data = await qaseRequest(
                baseUrl,
                token,
                "POST",
                `/suite/${encodeURIComponent(projectCode)}`,
                body
            )

            return JSON.stringify({
                operation,
                projectCode,
                created: true,
                id: data.result?.id ?? null,
                result: data.result ?? null
            })
        }

        // create_case
        const title = requireString(args.title, "title")
        const suiteId = requireString(
            args.suiteId !== undefined ? String(args.suiteId) : undefined,
            "suiteId"
        )

        const body: Record<string, unknown> = {
            title,
            suite_id: Number(suiteId)
        }
        if (args.description) body.description = args.description
        if (args.preconditions) body.preconditions = args.preconditions
        if (args.postconditions) body.postconditions = args.postconditions

        if (args.priority) {
            const key = args.priority.trim().toUpperCase()
            if (!(key in PRIORITY)) {
                throw new Error("priority должен быть HIGH, MEDIUM или LOW")
            }
            body.priority = PRIORITY[key]
        }

        if (args.steps && args.steps.length > 0) {
            body.steps = args.steps.map((step: any, index: number) => ({
                position: index + 1,
                action: step.action,
                expected_result: step.expected_result ?? "",
                data: step.data ?? ""
            }))
        }

        const data = await qaseRequest(
            baseUrl,
            token,
            "POST",
            `/case/${encodeURIComponent(projectCode)}`,
            body
        )

        return JSON.stringify({
            operation,
            projectCode,
            created: true,
            id: data.result?.id ?? null,
            result: data.result ?? null
        })
    }
})
