export type PreferredTextRenderMode = 'plain' | 'markdown' | 'auto'
export type TextRenderMode = Exclude<PreferredTextRenderMode, 'auto'>

const MARKDOWN_PATTERNS = [
    /```|~~~/,
    /`[^`\n]+`/,
    /(^|\n)\s{0,3}#{1,6}\s/,
    /(^|\n)\s*>\s/,
    /(^|\n)\s*(?:[-*+]\s|\d+\.\s)/,
    /\[[^\]]+\]\([^)]+\)/,
    /(^|[\s(])(?:\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|_[^_\n]+_)(?=$|[\s).,!?:;])/,
    /(^|\n).*\|.*\|/,
] as const

export function isLikelyMarkdownText(text: string): boolean {
    return MARKDOWN_PATTERNS.some((pattern) => pattern.test(text))
}

export function resolveTextRenderMode(
    text: string,
    preferredMode: PreferredTextRenderMode = 'auto'
): TextRenderMode {
    if (preferredMode === 'plain' || preferredMode === 'markdown') {
        return preferredMode
    }

    return isLikelyMarkdownText(text) ? 'markdown' : 'plain'
}
