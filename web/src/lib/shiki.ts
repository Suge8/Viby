import { useEffect, useState } from 'react'
import type { HighlighterCore } from 'shiki/core'
import { createHighlighterCore } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import {
    CODE_BLOCK_PLAIN_TEXT_LANGUAGE,
    CODE_LANGUAGE_ALIASES,
    resolveCodeLanguage,
    SHIKI_SUPPORTED_LANGUAGES,
} from '@/components/code-block/codeBlockLanguage'
import { useTheme } from '@/hooks/useTheme'

const THEME_LOADERS = {
    'github-light': () => import('@shikijs/themes/github-light'),
    'github-dark': () => import('@shikijs/themes/github-dark'),
} as const

const LANGUAGE_LOADERS = {
    shellscript: () => import('@shikijs/langs/shellscript'),
    powershell: () => import('@shikijs/langs/powershell'),
    json: () => import('@shikijs/langs/json'),
    yaml: () => import('@shikijs/langs/yaml'),
    toml: () => import('@shikijs/langs/toml'),
    markdown: () => import('@shikijs/langs/markdown'),
    html: () => import('@shikijs/langs/html'),
    css: () => import('@shikijs/langs/css'),
    javascript: () => import('@shikijs/langs/javascript'),
    typescript: () => import('@shikijs/langs/typescript'),
    jsx: () => import('@shikijs/langs/jsx'),
    tsx: () => import('@shikijs/langs/tsx'),
    sql: () => import('@shikijs/langs/sql'),
    graphql: () => import('@shikijs/langs/graphql'),
    rust: () => import('@shikijs/langs/rust'),
    go: () => import('@shikijs/langs/go'),
    python: () => import('@shikijs/langs/python'),
    diff: () => import('@shikijs/langs/diff'),
} as const

export const SHIKI_THEMES = {
    light: 'github-light',
    dark: 'github-dark',
} as const

const SHIKI_RENDER_CACHE_LIMIT = 100

export const langAlias = CODE_LANGUAGE_ALIASES

let highlighterPromise: Promise<HighlighterCore> | null = null
const themeLoadPromises = new Map<string, Promise<void>>()
const languageLoadPromises = new Map<string, Promise<boolean>>()
const highlightedHtmlCache = new Map<string, string>()

function getHighlighter(): Promise<HighlighterCore> {
    if (!highlighterPromise) {
        highlighterPromise = createHighlighterCore({
            themes: [],
            langs: [],
            engine: createJavaScriptRegexEngine({ forgiving: true }),
        })
    }
    return highlighterPromise
}

async function ensureThemeLoaded(
    highlighter: HighlighterCore,
    theme: typeof SHIKI_THEMES.light | typeof SHIKI_THEMES.dark
): Promise<void> {
    if (highlighter.getLoadedThemes().includes(theme)) {
        return
    }

    const existing = themeLoadPromises.get(theme)
    if (existing) {
        await existing
        return
    }

    const loadTheme = THEME_LOADERS[theme]
    const task = (async () => {
        await highlighter.loadTheme(await loadTheme())
    })()
    themeLoadPromises.set(theme, task)
    await task
}

async function ensureLanguageLoaded(highlighter: HighlighterCore, language: string): Promise<boolean> {
    if (language === CODE_BLOCK_PLAIN_TEXT_LANGUAGE) {
        return false
    }
    if (!SHIKI_SUPPORTED_LANGUAGES.has(language)) {
        return false
    }

    if (highlighter.getLoadedLanguages().includes(language)) {
        return true
    }

    const existing = languageLoadPromises.get(language)
    if (existing) {
        return await existing
    }

    const loadLanguage = LANGUAGE_LOADERS[language as keyof typeof LANGUAGE_LOADERS]
    if (!loadLanguage) {
        return false
    }

    const task = (async () => {
        await highlighter.loadLanguage(await loadLanguage())
        return true
    })()
    languageLoadPromises.set(language, task)
    return await task
}

function getHighlightCacheKey(theme: string, language: string, code: string): string {
    return `${theme}\u0000${language}\u0000${code}`
}

function readHighlightedHtmlCache(key: string): string | null {
    const cached = highlightedHtmlCache.get(key)
    if (!cached) {
        return null
    }

    highlightedHtmlCache.delete(key)
    highlightedHtmlCache.set(key, cached)
    return cached
}

function writeHighlightedHtmlCache(key: string, rendered: string): void {
    if (highlightedHtmlCache.has(key)) {
        highlightedHtmlCache.delete(key)
    }

    highlightedHtmlCache.set(key, rendered)
    if (highlightedHtmlCache.size <= SHIKI_RENDER_CACHE_LIMIT) {
        return
    }

    const oldestKey = highlightedHtmlCache.keys().next().value
    if (typeof oldestKey === 'string') {
        highlightedHtmlCache.delete(oldestKey)
    }
}

/**
 * Custom hook for syntax highlighting with our minimal Shiki bundle
 */
export function useShikiHighlighter(code: string, language: string | undefined): string | null {
    const { colorScheme } = useTheme()
    const [highlighted, setHighlighted] = useState<string | null>(null)

    useEffect(() => {
        let cancelled = false
        const lang = resolveCodeLanguage(language)
        const theme = SHIKI_THEMES[colorScheme]

        async function highlight() {
            const highlighter = await getHighlighter()
            if (cancelled) return

            const loaded = await Promise.all([
                ensureThemeLoaded(highlighter, theme),
                ensureLanguageLoaded(highlighter, lang),
            ])
            if (cancelled) return

            if (!loaded[1]) {
                setHighlighted(null)
                return
            }

            const cacheKey = getHighlightCacheKey(theme, lang, code)
            const cached = readHighlightedHtmlCache(cacheKey)
            if (cached) {
                setHighlighted(cached)
                return
            }

            const html = highlighter.codeToHtml(code, {
                lang,
                theme,
                structure: 'inline',
            })

            if (cancelled) return

            writeHighlightedHtmlCache(cacheKey, html)
            setHighlighted(html)
        }

        // Debounce highlighting — 150ms reduces CPU pressure on Windows during
        // streaming where code blocks update rapidly (see #310)
        const timer = setTimeout(highlight, 150)
        return () => {
            cancelled = true
            clearTimeout(timer)
        }
    }, [code, colorScheme, language])

    return highlighted
}
