/**
 * Минимальный парсер Markdown-артефактов: frontmatter, секции, таблицы, блоки.
 * Без внешних зависимостей — только то, что нужно evals.
 */

const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/

export function parseFrontmatter(text) {
    const m = text.match(FM_RE)
    if (!m) return { data: {}, body: text, ok: false }

    const data = {}
    for (const line of m[1].split(/\r?\n/)) {
        const i = line.indexOf(":")
        if (i === -1) continue
        const key = line.slice(0, i).trim()
        let value = line.slice(i + 1).trim()
        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1)
        }
        if (key) data[key] = value
    }

    const body = text.slice(m[0].length)
    const lineOffset = m[0].split(/\r?\n/).length - 1
    return { data, body, ok: true, lineOffset }
}

/** Разбивает тело по заголовкам второго уровня. */
export function parseSections(body) {
    const sections = new Map()
    const lines = body.split(/\r?\n/)
    let current = null
    let buffer = []

    const flush = () => {
        if (current !== null) sections.set(current, buffer.join("\n"))
    }

    for (const line of lines) {
        const m = line.match(/^##\s+(.+?)\s*$/)
        if (m) {
            flush()
            current = m[1].trim()
            buffer = []
            continue
        }
        if (current !== null) buffer.push(line)
    }
    flush()
    return sections
}

/** Разбивает текст секции по заголовкам третьего уровня (TASK-001, TC-001). */
export function parseBlocks(sectionText) {
    const blocks = new Map()
    if (!sectionText) return blocks

    const lines = sectionText.split(/\r?\n/)
    let current = null
    let buffer = []

    const flush = () => {
        if (current !== null) blocks.set(current, buffer.join("\n"))
    }

    for (const line of lines) {
        const m = line.match(/^###\s+(.+?)\s*$/)
        if (m) {
            flush()
            current = m[1].trim()
            buffer = []
            continue
        }
        if (current !== null) buffer.push(line)
    }
    flush()
    return blocks
}

/** Возвращает все таблицы из текста: {header: string[], rows: string[][]}. */
export function parseTables(text) {
    if (!text) return []
    const tables = []
    let current = null

    for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim()
        const isRow = line.startsWith("|") && line.endsWith("|") && line.length > 2

        if (!isRow) {
            current = null
            continue
        }

        if (!current) {
            current = { header: null, rows: [] }
            tables.push(current)
        }

        const cells = line.slice(1, -1).split("|").map((c) => c.trim())

        if (current.header === null) {
            current.header = cells
            continue
        }
        if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue
        current.rows.push(cells)
    }

    return tables
}

/** Поля вида «- **Summary:** значение». */
export function parseListFields(blockText) {
    const fields = new Map()
    if (!blockText) return fields

    for (const line of blockText.split(/\r?\n/)) {
        const m = line.match(/^\s*[-*]\s+\*\*(.+?):\*\*\s*(.*)$/)
        if (!m) continue
        fields.set(m[1].trim(), stripTicks(m[2].trim()))
    }
    return fields
}

export function stripTicks(value) {
    return String(value ?? "")
        .replace(/^`+|`+$/g, "")
        .trim()
}

export function normHeader(value) {
    return stripTicks(value)
        .toLowerCase()
        .replace(/[*_]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
}

/** Индекс колонки по списку допустимых названий. */
export function columnIndex(table, aliases) {
    if (!table?.header) return -1
    const headers = table.header.map(normHeader)
    for (const alias of aliases) {
        const target = normHeader(alias)
        const exact = headers.indexOf(target)
        if (exact !== -1) return exact
    }
    for (const alias of aliases) {
        const target = normHeader(alias)
        const partial = headers.findIndex((h) => h.startsWith(target) || target.startsWith(h))
        if (partial !== -1) return partial
    }
    return -1
}

/** Преобразует таблицу в массив объектов по карте {key: [aliases]}. */
export function tableToObjects(table, spec) {
    if (!table) return []
    const map = {}
    for (const [key, aliases] of Object.entries(spec)) {
        map[key] = columnIndex(table, aliases)
    }

    return table.rows
        .map((row) => {
            const obj = {}
            for (const [key, idx] of Object.entries(map)) {
                obj[key] = idx === -1 ? "" : stripTicks(row[idx] ?? "")
            }
            return obj
        })
        .filter((obj) => Object.values(obj).some((v) => v !== ""))
}

/** Находит все ID по шаблону, например TC-001. */
export function matchIds(value, pattern) {
    return [...String(value ?? "").matchAll(pattern)].map((m) => m[0])
}
