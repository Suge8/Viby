import type { GitCommandResponse } from '@/types/api'
import { langAlias } from '@/lib/shiki'
import { decodeBase64 } from '@/lib/utils'

export const MAX_COPYABLE_FILE_BYTES = 1_000_000

export function decodeFilePath(value: string): string {
    if (!value) {
        return ''
    }

    const decoded = decodeBase64(value)
    return decoded.ok ? decoded.text : value
}

export function resolveFileLanguage(path: string): string | undefined {
    const parts = path.split('.')
    if (parts.length <= 1) {
        return undefined
    }

    const extension = parts[parts.length - 1]?.toLowerCase()
    if (!extension) {
        return undefined
    }

    return langAlias[extension] ?? extension
}

export function getUtf8ByteLength(value: string): number {
    return new TextEncoder().encode(value).length
}

export function isBinaryContent(content: string): boolean {
    if (!content) {
        return false
    }

    if (content.includes('\0')) {
        return true
    }

    const nonPrintableCount = content.split('').filter((char) => {
        const code = char.charCodeAt(0)
        return code < 32 && code !== 9 && code !== 10 && code !== 13
    }).length

    return nonPrintableCount / content.length > 0.1
}

export function extractCommandError(result: GitCommandResponse | undefined): string | null {
    if (!result || result.success) {
        return null
    }

    return result.error ?? result.stderr ?? 'Failed to load diff'
}
