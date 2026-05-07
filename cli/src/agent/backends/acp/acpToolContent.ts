import { asString, isObject } from '@viby/protocol'

type HoistedDiff =
    | { name: 'Write'; input: { file_path: string; content: string } }
    | { name: 'Edit'; input: { file_path: string; old_string: string; new_string: string } }

export function deriveToolInputFromUpdate(update: Record<string, unknown>): Record<string, unknown> | null {
    const kind = asString(update.kind)
    if (kind === 'edit') {
        const first = Array.isArray(update.locations) ? update.locations[0] : null
        const path = isObject(first) ? asString(first.path) : null
        return path ? { file_path: path } : null
    }

    const title = asString(update.title)
    if (!title) return null

    switch (kind) {
        case 'read':
            return { file_path: title }
        case 'execute':
            return { command: title }
        case 'search':
            return { pattern: title }
        default:
            return null
    }
}

export function hoistDiffContentIntoInput(content: unknown): HoistedDiff | null {
    const first = Array.isArray(content) ? content[0] : null
    if (!isObject(first) || first.type !== 'diff') return null

    const filePath = asString(first.path)
    const kind = isObject(first._meta) ? asString(first._meta.kind) : null
    if (!filePath || !kind) return null

    const newText = typeof first.newText === 'string' ? first.newText : ''
    if (kind === 'add') {
        return { name: 'Write', input: { file_path: filePath, content: newText } }
    }
    if (kind === 'modify') {
        const oldText = typeof first.oldText === 'string' ? first.oldText : ''
        return { name: 'Edit', input: { file_path: filePath, old_string: oldText, new_string: newText } }
    }
    return null
}

export function normalizeAcpToolContent(content: unknown): string | object | null {
    if (!Array.isArray(content)) return null
    if (content.length === 0) return ''

    let diff: object | null = null
    const textParts: string[] = []

    for (const block of content) {
        if (!isObject(block)) return null
        if (block.type === 'diff') {
            if (diff || textParts.length > 0) return null
            diff = normalizeDiffBlock(block)
            continue
        }
        if (block.type !== 'content' || !isObject(block.content)) return null
        const inner = block.content
        if (inner.type !== 'text' || typeof inner.text !== 'string' || diff) return null
        textParts.push(inner.text)
    }

    return diff ?? textParts.join('')
}

function normalizeDiffBlock(block: Record<string, unknown>): object {
    return {
        path: typeof block.path === 'string' ? block.path : undefined,
        oldText: typeof block.oldText === 'string' ? block.oldText : undefined,
        newText: typeof block.newText === 'string' ? block.newText : undefined,
        kind: isObject(block._meta) && typeof block._meta.kind === 'string' ? block._meta.kind : undefined,
    }
}
