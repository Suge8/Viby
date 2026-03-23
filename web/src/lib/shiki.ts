import { createHighlighterCore } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import type { HighlighterCore } from 'shiki/core'
import { useState, useEffect, type ReactNode } from 'react'
import { toJsxRuntime } from 'hast-util-to-jsx-runtime'
import { jsx, jsxs, Fragment } from 'react/jsx-runtime'
import {
    CODE_LANGUAGE_ALIASES,
    CODE_BLOCK_PLAIN_TEXT_LANGUAGE,
    resolveCodeLanguage,
} from '@/components/code-block/codeBlockLanguage'

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
    xml: () => import('@shikijs/langs/xml'),
    ini: () => import('@shikijs/langs/ini'),
    markdown: () => import('@shikijs/langs/markdown'),
    html: () => import('@shikijs/langs/html'),
    css: () => import('@shikijs/langs/css'),
    scss: () => import('@shikijs/langs/scss'),
    javascript: () => import('@shikijs/langs/javascript'),
    typescript: () => import('@shikijs/langs/typescript'),
    jsx: () => import('@shikijs/langs/jsx'),
    tsx: () => import('@shikijs/langs/tsx'),
    sql: () => import('@shikijs/langs/sql'),
    graphql: () => import('@shikijs/langs/graphql'),
    c: () => import('@shikijs/langs/c'),
    rust: () => import('@shikijs/langs/rust'),
    go: () => import('@shikijs/langs/go'),
    java: () => import('@shikijs/langs/java'),
    kotlin: () => import('@shikijs/langs/kotlin'),
    python: () => import('@shikijs/langs/python'),
    php: () => import('@shikijs/langs/php'),
    swift: () => import('@shikijs/langs/swift'),
    csharp: () => import('@shikijs/langs/csharp'),
    dockerfile: () => import('@shikijs/langs/dockerfile'),
    make: () => import('@shikijs/langs/make'),
    diff: () => import('@shikijs/langs/diff'),
} as const

export const SHIKI_THEMES = {
    light: 'github-light',
    dark: 'github-dark',
} as const

export const langAlias = CODE_LANGUAGE_ALIASES

let highlighterPromise: Promise<HighlighterCore> | null = null
const themeLoadPromises = new Map<string, Promise<void>>()
const languageLoadPromises = new Map<string, Promise<boolean>>()

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

async function ensureLanguageLoaded(
    highlighter: HighlighterCore,
    language: string
): Promise<boolean> {
    if (language === CODE_BLOCK_PLAIN_TEXT_LANGUAGE) {
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

/**
 * Custom hook for syntax highlighting with our minimal Shiki bundle
 */
export function useShikiHighlighter(
    code: string,
    language: string | undefined
): ReactNode | null {
    const [highlighted, setHighlighted] = useState<ReactNode | null>(null)

    useEffect(() => {
        let cancelled = false
        const lang = resolveCodeLanguage(language)

        async function highlight() {
            const highlighter = await getHighlighter()
            if (cancelled) return

            const loaded = await Promise.all([
                ensureThemeLoaded(highlighter, SHIKI_THEMES.light),
                ensureThemeLoaded(highlighter, SHIKI_THEMES.dark),
                ensureLanguageLoaded(highlighter, lang),
            ])
            if (cancelled) return

            if (!loaded[2]) {
                setHighlighted(null)
                return
            }

            const hast = highlighter.codeToHast(code, {
                lang,
                themes: SHIKI_THEMES,
                defaultColor: false,
                structure: 'inline',
            })

            if (cancelled) return

            const rendered = toJsxRuntime(hast, {
                jsx,
                jsxs,
                Fragment,
            })
            setHighlighted(rendered as ReactNode)
        }

        // Debounce highlighting — 150ms reduces CPU pressure on Windows during
        // streaming where code blocks update rapidly (see #310)
        const timer = setTimeout(highlight, 150)
        return () => {
            cancelled = true
            clearTimeout(timer)
        }
    }, [code, language])

    return highlighted
}
