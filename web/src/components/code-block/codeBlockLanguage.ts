export type CodeHighlightMode = 'auto' | 'always' | 'never'

export const CODE_BLOCK_PLAIN_TEXT_LANGUAGE = 'text'

const AUTO_HIGHLIGHT_DISABLED_LANGUAGES = new Set([
    CODE_BLOCK_PLAIN_TEXT_LANGUAGE,
    'plaintext',
    'txt',
    'json',
])

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

    const cleaned = language.startsWith('language-')
        ? language.slice('language-'.length)
        : language
    const normalized = cleaned.toLowerCase().trim()

    if (
        normalized === CODE_BLOCK_PLAIN_TEXT_LANGUAGE
        || normalized === 'plaintext'
        || normalized === 'txt'
    ) {
        return CODE_BLOCK_PLAIN_TEXT_LANGUAGE
    }

    return CODE_LANGUAGE_ALIASES[normalized] ?? normalized
}

export function shouldUseShikiHighlight(options: {
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
        return true
    }

    return !AUTO_HIGHLIGHT_DISABLED_LANGUAGES.has(options.language)
}
