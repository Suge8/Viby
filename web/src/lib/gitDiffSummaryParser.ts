export type DiffFileStat = {
    file: string
    changes: number
    insertions: number
    deletions: number
    binary: boolean
}

export type DiffSummary = {
    files: DiffFileStat[]
    insertions: number
    deletions: number
    changes: number
    changed: number
}

const NUMSTAT_REGEX = /^(\d+|-)\t(\d+|-)\t(.*)$/

export function parseNumStat(numStatOutput: string): DiffSummary {
    const lines = numStatOutput
        .trim()
        .split('\n')
        .filter((line) => line.length > 0)
    const result: DiffSummary = {
        files: [],
        insertions: 0,
        deletions: 0,
        changes: 0,
        changed: 0,
    }

    for (const line of lines) {
        const match = NUMSTAT_REGEX.exec(line)
        if (!match) {
            continue
        }

        const insertionsStr = match[1]
        const deletionsStr = match[2]
        const file = match[3]
        const isBinary = insertionsStr === '-' || deletionsStr === '-'
        const insertions = isBinary ? 0 : parseInt(insertionsStr, 10)
        const deletions = isBinary ? 0 : parseInt(deletionsStr, 10)
        const changes = insertions + deletions

        result.files.push({
            file,
            changes,
            insertions,
            deletions,
            binary: isBinary,
        })
        result.insertions += insertions
        result.deletions += deletions
        result.changes += changes
        result.changed += 1
    }

    return result
}

export function createDiffStatsMap(
    summary: DiffSummary
): Record<string, { added: number; removed: number; binary: boolean }> {
    const stats: Record<string, { added: number; removed: number; binary: boolean }> = {}

    for (const file of summary.files) {
        const paths = normalizeNumstatPath(file.file)
        const stat = {
            added: file.insertions,
            removed: file.deletions,
            binary: file.binary,
        }
        stats[file.file] = stat
        if (paths.newPath && paths.newPath !== file.file) {
            stats[paths.newPath] = stat
        }
        if (paths.oldPath && paths.oldPath !== file.file && paths.oldPath !== paths.newPath) {
            stats[paths.oldPath] = stat
        }
    }

    return stats
}

function normalizeNumstatPath(rawPath: string): { newPath: string; oldPath?: string } {
    const trimmed = rawPath.trim()
    if (trimmed.includes('{') && trimmed.includes('=>') && trimmed.includes('}')) {
        const newPath = trimmed.replace(/\{([^{}]+?)\s*=>\s*([^{}]+?)\}/g, (_, _oldPart: string, newPart: string) =>
            newPart.trim()
        )
        const oldPath = trimmed.replace(/\{([^{}]+?)\s*=>\s*([^{}]+?)\}/g, (_, oldPart: string) => oldPart.trim())
        return { newPath, oldPath }
    }

    if (trimmed.includes('=>')) {
        const parts = trimmed.split(/\s*=>\s*/)
        const oldPath = parts[0]?.trim()
        const newPath = parts[parts.length - 1]?.trim()
        if (newPath) {
            return { newPath, oldPath }
        }
    }

    return { newPath: trimmed }
}
