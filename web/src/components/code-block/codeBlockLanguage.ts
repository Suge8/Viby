export type CodeHighlightMode = 'auto' | 'always' | 'never'

export const CODE_BLOCK_PLAIN_TEXT_LANGUAGE = 'text'

// Large blocks are expensive to tokenize on the main thread during streaming
// and on low-end mobile devices; fall back to plain rendering once they cross
// these bounds.
const MAX_SHIKI_HIGHLIGHT_LINES = 320
const MAX_SHIKI_HIGHLIGHT_CHARS = 16_000

const AUTO_HIGHLIGHT_DISABLED_LANGUAGES = new Set([CODE_BLOCK_PLAIN_TEXT_LANGUAGE, 'plaintext', 'txt', 'json'])

const AUTO_HIGHLIGHT_ENABLED_LANGUAGES = new Set([
    'shellscript',
    'powershell',
    'yaml',
    'toml',
    'markdown',
    'html',
    'css',
    'javascript',
    'typescript',
    'jsx',
    'tsx',
    'sql',
    'graphql',
    'rust',
    'go',
    'python',
    'diff',
])

export const SHIKI_SUPPORTED_LANGUAGES = new Set(['json', ...AUTO_HIGHLIGHT_ENABLED_LANGUAGES])

export const CODE_LANGUAGE_ALIASES: Record<string, string> = {
    sh: 'shellscript',
    bash: 'shellscript',
    zsh: 'shellscript',
    shell: 'shellscript',
    ps1: 'powershell',
    js: 'javascript',
    ts: 'typescript',
    mjs: 'javascript',
    cjs: 'javascript',
    mts: 'typescript',
    cts: 'typescript',
    yml: 'yaml',
    md: 'markdown',
    htm: 'html',
    pgsql: 'sql',
    mysql: 'sql',
    postgres: 'sql',
    gql: 'graphql',
    py: 'python',
    rs: 'rust',
    kt: 'kotlin',
    cs: 'csharp',
    makefile: 'make',
}

export function resolveCodeLanguage(language: string | undefined): string {
    if (!language) {
        return CODE_BLOCK_PLAIN_TEXT_LANGUAGE
    }

    const cleaned = language.startsWith('language-') ? language.slice('language-'.length) : language
    const normalized = cleaned.toLowerCase().trim()

    if (normalized === CODE_BLOCK_PLAIN_TEXT_LANGUAGE || normalized === 'plaintext' || normalized === 'txt') {
        return CODE_BLOCK_PLAIN_TEXT_LANGUAGE
    }

    return CODE_LANGUAGE_ALIASES[normalized] ?? normalized
}

function exceedsShikiHighlightBudget(code: string): boolean {
    if (code.length > MAX_SHIKI_HIGHLIGHT_CHARS) {
        return true
    }

    let lineCount = 1
    for (let index = 0; index < code.length; index += 1) {
        if (code.charCodeAt(index) === 10) {
            lineCount += 1
            if (lineCount > MAX_SHIKI_HIGHLIGHT_LINES) {
                return true
            }
        }
    }

    return false
}

export function shouldUseShikiHighlight(options: {
    code: string
    language: string
    highlight?: CodeHighlightMode
}): boolean {
    const highlight = options.highlight ?? 'auto'
    if (highlight === 'never') {
        return false
    }

    if (options.language === CODE_BLOCK_PLAIN_TEXT_LANGUAGE) {
        return false
    }

    if (highlight === 'always') {
        return SHIKI_SUPPORTED_LANGUAGES.has(options.language) && !exceedsShikiHighlightBudget(options.code)
    }

    return (
        AUTO_HIGHLIGHT_ENABLED_LANGUAGES.has(options.language) &&
        !AUTO_HIGHLIGHT_DISABLED_LANGUAGES.has(options.language) &&
        !exceedsShikiHighlightBudget(options.code)
    )
}
