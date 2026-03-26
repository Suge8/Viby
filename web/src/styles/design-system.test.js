import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const DESIGN_SYSTEM_CSS_PATH = resolve(
    dirname(fileURLToPath(import.meta.url)),
    'design-system.css'
)

function readDesignSystemCss() {
    return readFileSync(DESIGN_SYSTEM_CSS_PATH, 'utf8')
}

describe('design-system mobile chat route layout', () => {
    it('keeps mobile chat routes on the internal thread viewport while the composer stays fixed', () => {
        const css = readDesignSystemCss()

        expect(css).toContain("html[data-viby-route='session-chat'] .session-chat-thread-viewport")
        expect(css).toContain("html[data-viby-route='session-chat'] .session-chat-composer-shell")
        expect(css).toContain('position: fixed;')
        expect(css).toContain('padding-bottom: var(--chat-composer-shell-bottom-gap);')
        expect(css).toContain('padding-bottom: calc(var(--chat-composer-reserved-space) + var(--chat-composer-offset-bottom));')
        expect(css).toContain('overflow-y: auto;')
        expect(css).toContain('overflow: hidden;')
        expect(css).toContain('background: transparent;')
    })

    it('only applies the mobile bottom safe-area gap in standalone display mode', () => {
        const css = readDesignSystemCss()

        expect(css).toContain('--chat-composer-standalone-bottom-gap: max(0.4rem, calc(env(safe-area-inset-bottom) - 1rem));')
        expect(css).toContain("html[data-viby-route='session-chat'] .session-chat-layout[data-chat-standalone='true']")
        expect(css).toContain('--chat-composer-shell-bottom-gap: var(--chat-composer-standalone-bottom-gap);')
    })

    it('covers the standalone safe-area strip so thread content does not bleed under the composer', () => {
        const css = readDesignSystemCss()

        expect(css).toContain("html[data-viby-route='session-chat'] .session-chat-composer-shell::after")
        expect(css).toContain('height: var(--chat-composer-shell-bottom-gap);')
        expect(css).toContain('background: var(--app-bg);')
    })

    it('keeps the mobile chat route canvas opaque behind the glass composer', () => {
        const css = readDesignSystemCss()

        expect(css).toContain("html[data-viby-route='session-chat'] .app-shell")
        expect(css).toContain("html[data-viby-route='session-chat'] .session-chat-layout")
        expect(css).toContain('background: var(--app-bg);')
    })

    it('does not keep the old standalone safe-area filler inside the composer card', () => {
        const css = readDesignSystemCss()

        expect(css).not.toContain('--chat-composer-safe-area-bottom')
        expect(css).not.toContain('.ds-composer-surface::after')
        expect(css).not.toContain('padding-bottom: var(--chat-composer-safe-area-bottom);')
    })

    it('uses the same glass surface contract for Safari and PWA', () => {
        const css = readDesignSystemCss()

        expect(css).toContain('--ds-composer-surface-bg:')
        expect(css).toContain('--ds-composer-shell-edge-bg:')
        expect(css).toContain(".session-chat-composer-shell .ds-composer-surface")
        expect(css).toContain('border-bottom-left-radius: calc(var(--ds-radius-2xl) + 4px);')
        expect(css).toContain('border-bottom-right-radius: calc(var(--ds-radius-2xl) + 4px);')
        expect(css).toContain('background: linear-gradient(180deg, var(--ds-composer-surface-bg), var(--ds-composer-shell-edge-bg));')
        expect(css).toContain('-webkit-backdrop-filter: var(--ds-composer-surface-blur);')
        expect(css).toContain('backdrop-filter: var(--ds-composer-surface-blur);')
    })

    it('drops the outer safe-area spacer once the mobile keyboard is open', () => {
        const css = readDesignSystemCss()

        expect(css).toContain(".session-chat-layout[data-chat-keyboard-open='true']")
        expect(css).toContain(".session-chat-layout[data-chat-keyboard-open='true'] .session-chat-composer-shell")
        expect(css).toContain('padding-bottom: 0;')
        expect(css).toContain('--chat-composer-shell-bottom-gap: 0px;')
    })

    it('keeps the mobile bottom rail on the fixed lower rail until keyboard retreat is needed', () => {
        const css = readDesignSystemCss()

        expect(css).toContain('.session-chat-thread-bottom-control-anchor')
        expect(css).toContain('--chat-side-control-rest-bottom-offset:')
        expect(css).toContain(".session-chat-layout[data-chat-keyboard-open='true'] .session-chat-thread-bottom-control-anchor")
        expect(css).toContain('bottom: var(--chat-side-control-bottom-offset);')
        expect(css).not.toContain('--chat-side-control-lower-top')
    })

    it('uses a bottom-control entry animation that does not translate on the Y axis', () => {
        const css = readDesignSystemCss()

        expect(css).toContain('.session-chat-thread-bottom-control')
        expect(css).toContain('animation: thread-bottom-control-enter')
        expect(css).toContain('@keyframes thread-bottom-control-enter')
        expect(css).toContain('transform: scale(0.88);')
    })

    it('does not keep the old visual viewport bottom offset padding path', () => {
        const css = readDesignSystemCss()

        expect(css).not.toContain('--chat-composer-viewport-offset-bottom')
        expect(css).not.toContain('padding-bottom: var(--chat-composer-viewport-offset-bottom)')
    })
})
