// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useShikiHighlighter } from './shiki'

let currentColorScheme: 'light' | 'dark' = 'light'
const loadTheme = vi.fn(async (theme: unknown) => theme)
const loadLanguage = vi.fn(async (language: unknown) => language)
const codeToHtml = vi.fn(
    (code: string, options: Record<string, unknown>) =>
        `<span data-code="${code}" data-language="${String(options.lang)}" data-theme="${String(options.theme)}"></span>`
)
const getLoadedThemes = vi.fn(() => [] as string[])
const getLoadedLanguages = vi.fn(() => [] as string[])

vi.mock('@/hooks/useTheme', () => ({
    useTheme: () => ({
        colorScheme: currentColorScheme,
        isDark: currentColorScheme === 'dark',
    }),
}))

vi.mock('shiki/core', () => ({
    createHighlighterCore: vi.fn(async () => ({
        loadTheme,
        loadLanguage,
        codeToHtml,
        getLoadedThemes,
        getLoadedLanguages,
    })),
}))

vi.mock('shiki/engine/javascript', () => ({
    createJavaScriptRegexEngine: vi.fn(() => ({ engine: 'mock' })),
}))

vi.mock('@shikijs/themes/github-light', () => ({
    default: { name: 'github-light' },
}))

vi.mock('@shikijs/themes/github-dark', () => ({
    default: { name: 'github-dark' },
}))

vi.mock('@shikijs/langs/typescript', () => ({
    default: { name: 'typescript' },
}))

function HighlightProbe(props: { code: string; language?: string }): React.JSX.Element {
    const highlighted = useShikiHighlighter(props.code, props.language)
    return highlighted ? <div data-testid="highlighted" dangerouslySetInnerHTML={{ __html: highlighted }} /> : <div />
}

describe('useShikiHighlighter', () => {
    beforeEach(() => {
        currentColorScheme = 'light'
        loadTheme.mockClear()
        loadLanguage.mockClear()
        codeToHtml.mockClear()
        getLoadedThemes.mockClear()
        getLoadedLanguages.mockClear()
        getLoadedThemes.mockReturnValue([])
        getLoadedLanguages.mockReturnValue([])
    })

    afterEach(() => {
        cleanup()
    })

    it('loads only the active theme and renders matching dual-theme tokens', async () => {
        currentColorScheme = 'dark'

        render(<HighlightProbe code={'const value = 1'} language="typescript" />)

        await waitFor(() => {
            expect(screen.getByTestId('highlighted').innerHTML).toContain('data-theme="github-dark"')
        })

        expect(loadTheme).toHaveBeenCalledTimes(1)
        expect(codeToHtml).toHaveBeenCalledTimes(1)
    })

    it('reuses cached highlighted output for the same theme language and code', async () => {
        const code = 'const cachedValue = 2'
        const first = render(<HighlightProbe code={code} language="typescript" />)

        await waitFor(() => {
            expect(screen.getByTestId('highlighted').innerHTML).toContain('data-language="typescript"')
        })

        first.unmount()

        render(<HighlightProbe code={code} language="typescript" />)

        await waitFor(() => {
            expect(screen.getByTestId('highlighted').innerHTML).toContain(`data-code="${code}"`)
        })

        expect(codeToHtml).toHaveBeenCalledTimes(1)
    })
})
