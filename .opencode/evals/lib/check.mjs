/**
 * Коллектор результатов проверок.
 * severity: error влияет на exit code, warn — только предупреждение.
 */

export function createCollector() {
    const results = []

    const push = (entry) => {
        results.push({ severity: "error", details: [], ...entry })
    }

    return {
        results,

        pass(stage, id, title) {
            push({ stage, id, title, status: "pass" })
        },

        fail(stage, id, title, message, details = [], extra = {}) {
            push({ stage, id, title, status: "fail", message, details, ...extra })
        },

        warn(stage, id, title, message, details = []) {
            push({ stage, id, title, status: "warn", severity: "warn", message, details })
        },

        skip(stage, id, title, message) {
            push({ stage, id, title, status: "skip", message })
        },

        /** Универсальный assert: либо pass, либо fail. */
        assert(condition, stage, id, title, failMessage, details = []) {
            if (condition) this.pass(stage, id, title)
            else this.fail(stage, id, title, failMessage, details)
            return Boolean(condition)
        }
    }
}

export function summarize(results) {
    const counts = { pass: 0, fail: 0, warn: 0, skip: 0 }
    for (const r of results) counts[r.status] = (counts[r.status] ?? 0) + 1

    const errors = results.filter((r) => r.status === "fail" && r.severity === "error").length
    const checks = counts.pass + counts.fail
    const score = checks === 0 ? 0 : Math.round((counts.pass / checks) * 1000) / 10

    return {
        ...counts,
        errors,
        total: results.length,
        score,
        verdict: errors === 0 ? "PASS" : "FAIL"
    }
}
