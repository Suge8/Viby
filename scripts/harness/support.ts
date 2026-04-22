export type DebtTrackerRow = {
    id: string
    status: string
}

const IMPORT_RE =
    /(?:from\s+['"]([^'"]+)['"])|(?:import\(\s*['"]([^'"]+)['"]\s*\))|(?:require\(\s*['"]([^'"]+)['"]\s*\))/g
const MARKDOWN_LINK_RE = /\[[^\]]*]\(([^)]+)\)/g
const BACKTICK_RE = /`([^`\n]+)`/g

export function sanitizeArtifactSegment(value: string): string {
    const sanitized = value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')

    return sanitized.slice(0, 80) || 'artifact'
}

export function extractImportSpecifiers(source: string): string[] {
    const matches = new Set<string>()
    for (const match of source.matchAll(IMPORT_RE)) {
        const specifier = match[1] ?? match[2] ?? match[3]
        if (specifier) {
            matches.add(specifier)
        }
    }
    return [...matches]
}

export function parseDebtTrackerRows(markdown: string): DebtTrackerRow[] {
    return markdown
        .split(/\r?\n/)
        .filter((line) => line.startsWith('| D-'))
        .map((line) => {
            const columns = line
                .split('|')
                .slice(1, -1)
                .map((column) => column.trim())
            return {
                id: columns[0] ?? '',
                status: columns[3] ?? '',
            }
        })
}

export function listQualityScoreModules(markdown: string): string[] {
    return markdown
        .split(/\r?\n/)
        .filter((line) => line.startsWith('| `'))
        .map((line) => {
            const columns = line
                .split('|')
                .slice(1, -1)
                .map((column) => column.trim())
            return columns[0]?.replaceAll('`', '') ?? ''
        })
        .filter(Boolean)
}

export function extractMarkdownPathRefs(markdown: string): string[] {
    const refs = new Set<string>()
    for (const match of markdown.matchAll(MARKDOWN_LINK_RE)) {
        const ref = match[1]?.trim()
        if (ref) {
            refs.add(ref)
        }
    }
    for (const match of markdown.matchAll(BACKTICK_RE)) {
        const ref = match[1]?.trim()
        if (ref) {
            refs.add(ref)
        }
    }
    return [...refs]
}
