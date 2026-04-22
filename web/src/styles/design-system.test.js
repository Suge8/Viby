import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const DESIGN_SYSTEM_CSS_PATH = resolve(dirname(fileURLToPath(import.meta.url)), 'design-system.css')

function readDesignSystemCss() {
    return readCssWithImports(DESIGN_SYSTEM_CSS_PATH)
}

function readCssWithImports(filePath, seen = new Set()) {
    if (seen.has(filePath)) {
        return ''
    }
    seen.add(filePath)

    const css = readFileSync(filePath, 'utf8')
    const expandedCss = css.replace(/@import\s+"([^"]+)";/g, (_, importPath) => {
        const resolvedImportPath = resolve(dirname(filePath), importPath)
        return readCssWithImports(resolvedImportPath, seen)
    })
    return expandedCss.replaceAll('"', "'").replace(/\s+/g, ' ').trim()
}

describe('design-system mobile chat route layout', () => {
    it('keeps mobile chat routes on the internal thread viewport while the composer stays fixed', () => {
        const css = readDesignSystemCss()

        expect(css).toContain(".app-shell[data-viby-route='session-chat'] .session-chat-thread-viewport")
        expect(css).toContain(".app-shell[data-viby-route='session-chat'] .session-chat-composer-shell")
        expect(css).toContain('position: fixed;')
        expect(css).toContain('overflow-y: auto;')
        expect(css).toContain('overflow: hidden;')
        expect(css).toContain('background: var(--app-bg);')
    })

    it('keeps the mobile composer geometry free of extra safe-area rails', () => {
        const css = readDesignSystemCss()

        expect(css).toContain('--chat-composer-visual-clearance: 0.375rem;')
        expect(css).not.toContain('--chat-composer-safe-area-inset')
    })

    it('derives composer/list bottom reservation from the same occupied-space contract as the current composer mode', () => {
        const css = readDesignSystemCss()

        expect(css).toContain('--chat-composer-occupied-space: var(--chat-composer-visual-clearance);')
        expect(css).toMatch(
            /--chat-composer-occupied-space:\s*calc\(\s*var\(--chat-composer-reserved-space\)\s*\+\s*var\(--chat-composer-visual-clearance\)\s*\);/
        )
        expect(css).toContain('calc(var(--chat-composer-occupied-space) - var(--chat-bottom-control-lift))')
    })

    it('keeps mobile side controls as overlays instead of reserving a right-side rail inside the transcript lane', () => {
        const css = readDesignSystemCss()

        expect(css).not.toContain('.ds-thread-side-rail-inset')
        expect(css).toContain('.ds-thread-bottom-control-wrapper')
        expect(css).toContain('.ds-thread-history-control-wrapper')
        expect(css).toContain('pointer-events: none;')
    })

    it('keeps the composer fixed to bottom without a synthetic safe-area filler path', () => {
        const css = readDesignSystemCss()

        expect(css).toContain(".app-shell[data-viby-route='session-chat'] .session-chat-composer-shell")
        expect(css).not.toContain('.session-chat-composer-shell::after')
        expect(css).not.toContain('--chat-composer-shell-bottom-gap')
        expect(css).not.toContain('--chat-composer-safe-area-inset')
    })

    it('keeps the mobile chat route canvas opaque behind the glass composer', () => {
        const css = readDesignSystemCss()

        expect(css).toContain(".app-shell[data-viby-route='session-chat']")
        expect(css).toContain(".app-shell[data-viby-route='session-chat'] .session-chat-layout")
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
        expect(css).toContain('.session-chat-composer-shell .ds-composer-surface')
        expect(css).toContain('border-bottom-left-radius: calc(var(--ds-radius-2xl) + 4px);')
        expect(css).toContain('border-bottom-right-radius: calc(var(--ds-radius-2xl) + 4px);')
        expect(css).toContain(
            'background: linear-gradient(180deg, var(--ds-composer-surface-bg), var(--ds-composer-shell-edge-bg));'
        )
        expect(css).toContain('-webkit-backdrop-filter: var(--ds-composer-surface-blur);')
        expect(css).toContain('backdrop-filter: var(--ds-composer-surface-blur);')
    })

    it('keeps the replying indicator out of normal composer height flow', () => {
        const css = readDesignSystemCss()

        expect(css).toContain('.ds-replying-indicator-anchor')
        expect(css).toContain('position: absolute;')
        expect(css).toContain('bottom: calc(100% + 0.35rem);')
    })

    it('keeps the mobile bottom rail on the fixed lower rail until keyboard retreat is needed', () => {
        const css = readDesignSystemCss()

        expect(css).toContain('.session-chat-thread-bottom-control-anchor')
        expect(css).toContain('--chat-side-control-rest-bottom-offset:')
        expect(css).toContain(
            ".session-chat-layout[data-chat-keyboard-open='true'] .session-chat-thread-bottom-control-anchor"
        )
        expect(css).toContain('bottom: var(--chat-side-control-bottom-offset);')
        expect(css).not.toContain('--chat-side-control-lower-top')
    })

    it('anchors the bottom control without a bespoke entry animation owner', () => {
        const css = readDesignSystemCss()

        expect(css).toContain('.session-chat-thread-bottom-control')
        expect(css).toContain('.ds-thread-bottom-control-wrapper')
        expect(css).toContain('bottom: var(--chat-side-control-rest-bottom-offset);')
        expect(css).not.toContain('thread-bottom-control-enter')
    })

    it('keeps chat icon-only side controls fully round on mobile and desktop', () => {
        const css = readDesignSystemCss()

        expect(css).toContain('.ds-thread-history-control')
        expect(css).toContain('.ds-thread-bottom-control')
        expect(css).toContain('border-radius: 999px;')
        expect(css).toContain('height: var(--chat-side-control-size);')
        expect(css).toContain('width: var(--chat-side-control-size);')
    })

    it('anchors the desktop history control to the page header clear zone instead of the thread root', () => {
        const css = readDesignSystemCss()

        expect(css).toContain('--ds-session-chat-header-layer: 20;')
        expect(css).toContain('--chat-header-visual-clearance: 0.5rem;')
        expect(css).toContain(
            '--chat-header-anchor-space: calc(var(--ds-session-chat-header-clearance) + var(--chat-header-visual-clearance));'
        )
        expect(css).toContain('--ds-session-chat-history-control-layer: 15;')
        expect(css).toContain('--ds-session-chat-history-control-top-desktop:')
        expect(css).toContain('.ds-thread-history-control-wrapper')
        expect(css).toContain('--chat-desktop-stage-center-x: 50vw;')
        expect(css).toContain('position: fixed;')
        expect(css).toContain('top: var(--ds-session-chat-history-control-top-desktop);')
        expect(css).toContain('left: var(--chat-desktop-stage-center-x);')
        expect(css).toContain('z-index: var(--ds-session-chat-history-control-layer);')
        expect(css).not.toContain('.ds-thread-history-control-wrapper { position: absolute;')
    })

    it('anchors the desktop bottom control above the composer stage instead of the viewport edge', () => {
        const css = readDesignSystemCss()

        expect(css).toContain('--chat-composer-stage-top: 100vh;')
        expect(css).toContain('--chat-desktop-bottom-control-gap: 0.5rem;')
        expect(css).toContain('.ds-thread-bottom-control-wrapper')
        expect(css).toMatch(
            /top:\s*calc\(\s*var\(--chat-composer-stage-top\)\s*-\s*var\(--chat-side-control-size\)\s*-\s*var\(--chat-desktop-bottom-control-gap\)\s*\);/
        )
        expect(css).toContain('left: var(--chat-desktop-stage-center-x);')
    })

    it('does not keep the old visual viewport bottom offset padding path', () => {
        const css = readDesignSystemCss()

        expect(css).not.toContain('--chat-composer-viewport-offset-bottom')
        expect(css).not.toContain('padding-bottom: var(--chat-composer-viewport-offset-bottom)')
    })

    it('does not apply paint containment hacks to critical chat shells', () => {
        const css = readDesignSystemCss()

        expect(css).not.toMatch(
            /\.session-chat-page,\s*\.session-chat-page-body,\s*\.session-chat-thread-root,\s*\.session-chat-composer-shell,\s*\.session-chat-header-shell,\s*\.session-chat-local-notice-stack\s*\{[\s\S]*?contain:\s*paint;[\s\S]*?backface-visibility:\s*hidden;/
        )
    })

    it('does not force message surfaces onto translateZ compositor layers', () => {
        const css = readDesignSystemCss()

        expect(css).not.toMatch(/\.ds-message-surface\s*\{[\s\S]*transform:\s*translateZ\(0\);/)
    })

    it('keeps assistant transcript bubbles off backdrop-filter blur layers', () => {
        const css = readDesignSystemCss()

        expect(css).not.toMatch(/\.ds-message-surface-assistant\s*\{[^}]*backdrop-filter:/)
    })

    it('does not use outer drop shadows on transcript message bubbles inside the clipped viewport', () => {
        const css = readDesignSystemCss()

        expect(css).toContain('.ds-message-surface-user')
        expect(css).toContain('.ds-message-surface-assistant')
        expect(css).toContain('box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12);')
        expect(css).not.toContain('0 14px 32px rgba(20, 42, 86, 0.12)')
        expect(css).not.toContain('0 16px 34px rgba(17, 36, 72, 0.16)')
        expect(css).not.toContain('0 10px 24px rgba(9, 15, 35, 0.06)')
    })

    it('gives inline tool cards a dedicated transcript surface instead of inheriting ds-panel shadow', () => {
        const css = readDesignSystemCss()

        expect(css).toContain('.ds-tool-card-surface')
        expect(css).toContain('border: 1px solid color-mix(in srgb, var(--ds-border-default) 72%, transparent);')
        expect(css).toContain('box-shadow: none;')
        expect(css).toContain('background: color-mix(in srgb, var(--ds-panel-strong) 96%, transparent);')
    })

    it('keeps transcript tool cards on the same rounded surface family as message bubbles', () => {
        const css = readDesignSystemCss()

        expect(css).toContain('.ds-message-surface')
        expect(css).toContain('border-radius: var(--ds-radius-2xl);')
    })

    it('defines transcript row spacing through shared row-gap classes instead of per-component outer padding', () => {
        const css = readDesignSystemCss()

        expect(css).toContain('--ds-transcript-row-gap-compact: 0.5rem;')
        expect(css).toContain('--ds-transcript-row-gap-base: 0.75rem;')
        expect(css).toContain('--ds-transcript-row-gap-loose: 1rem;')
        expect(css).toContain(".ds-transcript-row[data-row-gap='compact']")
        expect(css).toContain(".ds-transcript-row[data-row-gap='base']")
        expect(css).toContain(".ds-transcript-row[data-row-gap='loose']")
        expect(css).toContain(".ds-transcript-row[data-row-gap='none']")
        expect(css).toContain('scroll-padding-top: var(--chat-header-anchor-space);')
        expect(css).toContain('scroll-margin-top: var(--chat-header-anchor-space);')
    })
})
