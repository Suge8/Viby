import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const DESIGN_SYSTEM_CSS_PATH = resolve(dirname(fileURLToPath(import.meta.url)), 'design-system.css')
const INDEX_CSS_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../index.css')

function readDesignSystemCss() {
    return readCssWithImports(DESIGN_SYSTEM_CSS_PATH)
}

function readIndexCss() {
    return normalizeCss(readFileSync(INDEX_CSS_PATH, 'utf8'))
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
    return normalizeCss(expandedCss)
}

function normalizeCss(css) {
    return css.replaceAll('"', "'").replace(/\s+/g, ' ').trim()
}

describe('design-system mobile chat route layout', () => {
    it('keeps cold connection pages centered on the viewport', () => {
        const css = readDesignSystemCss()

        expect(css).toContain('.ds-connection-page')
        expect(css).toContain('align-items: center;')
        expect(css).toContain('justify-content: center;')
        expect(css).toContain('.ds-connection-panel')
        expect(css).toContain('text-align: center;')
    })

    it('keeps one native-feel app shell owner for ambient canvas and sessions panes', () => {
        const css = readDesignSystemCss()

        expect(css).toContain('.app-shell::before')
        expect(css).toContain('background: var(--ds-canvas);')
        expect(css).toContain('.app-route-layer')
        expect(css).toContain('z-index: 1;')
        expect(css).toContain('.ds-native-sessions-shell')
        expect(css).toContain('.ds-sessions-list-pane')
        expect(css).toContain('--ds-native-sidebar:')
        expect(css).toContain('--ds-native-shadow-strong:')
    })

    it('keeps mobile chat routes on the internal thread viewport while the composer stays fixed', () => {
        const css = readDesignSystemCss()

        expect(css).toContain(".app-shell[data-viby-route='session-chat'] .session-chat-thread-viewport")
        expect(css).toContain(".app-shell[data-viby-route='session-chat'] .session-chat-composer-shell")
        expect(css).toContain('position: fixed;')
        expect(css).toContain('overflow-y: auto;')
        expect(css).toContain('overflow: hidden;')
        expect(css).toContain('background: var(--app-bg);')
    })

    it('pauses covered mobile pane animations while another pane owns the screen', () => {
        const css = readDesignSystemCss()

        expect(css).toContain(".sessions-mobile-list-pane[aria-hidden='true'] *")
        expect(css).toContain(".sessions-mobile-detail-pane[aria-hidden='true'] *::after")
        expect(css).toContain('animation-play-state: paused;')
    })

    it('keeps repeated session list cards off blur and state-shadow layers', () => {
        const css = readDesignSystemCss()

        expect(css).not.toMatch(/\.session-list-item,\s*\.ds-session-list-new-button\s*\{[^}]*backdrop-filter:/)
        expect(css).not.toContain('--app-session-processing-shadow')
        expect(css).not.toContain('--app-session-awaiting-shadow')
        expect(css).not.toContain('--app-session-closed-shadow')
        expect(css).not.toContain('--app-session-archived-shadow')
    })

    it('keeps spinner rotation isolated to its own transform layer', () => {
        const css = readIndexCss()

        expect(css).toContain('.animate-spin')
        expect(css).toContain('contain: paint;')
        expect(css).toContain('transform-origin: center;')
        expect(css).toContain('will-change: transform;')
    })

    it('anchors the remote pairing link badge with one bottom expression that mirrors the outline trigger on chat and the create FAB centerline elsewhere', () => {
        const css = readIndexCss()

        // FAB-centerline baseline token must exist and be derived (no magic 1.375rem).
        expect(css).toContain('--app-remote-link-badge-min-height: 2.25rem;')
        expect(css).toMatch(
            /--app-remote-link-badge-corner-baseline:\s*calc\(\s*var\(--app-overlay-edge-offset\)\s*\+\s*\(3\.5rem\s*-\s*var\(--app-remote-link-badge-min-height\)\)\s*\/\s*2\s*\)/
        )

        // The bottom expression is a single `max()` of the two anchors; the chat branch must NOT
        // re-introduce `--app-safe-area-inset-bottom` (regression guard for the PWA offset bug).
        expect(css).toMatch(
            /\.remote-pairing-link-badge\s*\{[^}]*bottom:\s*max\(\s*calc\(\s*var\(--app-safe-area-inset-bottom\)\s*\+\s*var\(--app-remote-link-badge-corner-baseline\)\s*\),\s*calc\(\s*var\(--chat-composer-offset-bottom\)\s*\+\s*var\(--chat-composer-reserved-space\)\s*\+\s*var\(--chat-desktop-bottom-control-gap\)\s*\)\s*\)/
        )

        // Badge mirrors the outline trigger by living on the left rail.
        expect(css).toMatch(/\.remote-pairing-link-badge\s*\{[^}]*left:\s*calc\(\s*var\(--app-safe-area-inset-left\)/)
        expect(css).not.toMatch(/\.remote-pairing-link-badge\s*\{[^}]*right:/)

        // The legacy magic offset must be gone.
        expect(css).not.toContain('--app-remote-link-badge-mobile-bottom')
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
    })

    it('reserves an active-turn footer headroom so the new user turn can sit pinned at the header anchor', () => {
        const css = readDesignSystemCss()

        expect(css).toMatch(
            /height:\s*calc\(\s*var\(--chat-composer-occupied-space\)\s*\+\s*var\(--chat-active-turn-headroom,\s*0px\)\s*\);/
        )
    })

    it('keeps side controls as floating overlays without reserving a right-side rail inside the transcript lane', () => {
        const css = readDesignSystemCss()

        expect(css).not.toContain('.ds-thread-side-rail-inset')
        expect(css).toContain('.ds-thread-bottom-control-wrapper')
        expect(css).toContain('.ds-thread-outline-trigger-wrapper')
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

    it('drops the legacy in-composer replying indicator anchor in favor of the transcript thinking row', () => {
        const css = readDesignSystemCss()

        expect(css).not.toContain('.ds-replying-indicator-anchor')
        expect(css).not.toContain('--ds-replying-indicator-exit-duration')
        expect(css).toContain('.ds-replying-indicator')
    })

    it('drops the legacy mobile-only bottom-control rail tokens that fought the keyboard', () => {
        const css = readDesignSystemCss()

        expect(css).not.toContain('--chat-side-control-rest-bottom-offset')
        expect(css).not.toContain('--chat-side-control-bottom-offset')
        expect(css).not.toContain('--chat-bottom-control-bottom-offset')
        expect(css).not.toContain('--chat-bottom-control-min-offset')
        expect(css).not.toContain('--chat-bottom-control-lift')
        expect(css).not.toContain('--chat-side-control-upper-top')
        expect(css).not.toContain("data-chat-keyboard-open='true'")
    })

    it('drops the dedicated history control surface and tokens once the outline owner subsumes the upward jump', () => {
        const css = readDesignSystemCss()

        expect(css).not.toContain('.ds-thread-history-control')
        expect(css).not.toContain('--ds-session-chat-history-control-layer')
        expect(css).not.toContain('--ds-session-chat-history-control-top-desktop')
        expect(css).not.toContain('--ds-session-chat-history-control-inset')
    })

    it('keeps chat icon-only side controls fully round on both side-control families', () => {
        const css = readDesignSystemCss()

        expect(css).toContain('.ds-thread-bottom-control')
        expect(css).toContain('.ds-thread-outline-trigger')
        expect(css).toContain('border-radius: 999px;')
        expect(css).toContain('height: var(--chat-side-control-size);')
        expect(css).toContain('width: var(--chat-side-control-size);')
    })

    it('anchors both side controls above the composer stage with a split desktop / mobile owner', () => {
        const css = readDesignSystemCss()

        expect(css).toContain('--chat-desktop-bottom-control-gap: 0.5rem;')
        expect(css).toContain('.ds-thread-bottom-control-wrapper')
        expect(css).toContain('.ds-thread-outline-trigger-wrapper')
        // Desktop default: composer is in-flow, anchor to measured composer rect
        expect(css).toMatch(
            /top:\s*calc\(\s*var\(--chat-composer-stage-top\)\s*-\s*var\(--chat-side-control-size\)\s*-\s*var\(--chat-desktop-bottom-control-gap\)\s*\);/
        )
        expect(css).toContain('left: var(--chat-desktop-stage-center-x);')
        expect(css).toContain('right: var(--chat-desktop-stage-trailing-x);')
        expect(css).toContain(
            '--chat-desktop-stage-trailing-x: calc(100vw - var(--chat-desktop-header-stage-content-right-x, 100vw))'
        )
        // Mobile chat scope: composer is fixed, anchor to shared composer geometry tokens
        expect(css).toMatch(
            /bottom:\s*calc\(\s*var\(--chat-composer-offset-bottom\)\s*\+\s*var\(--chat-composer-reserved-space\)\s*\+\s*var\(--chat-desktop-bottom-control-gap\)\s*\);/
        )
        expect(css).toContain('left: 50%;')
        expect(css).toContain('right: var(--chat-stage-trailing-x);')
    })

    it('keeps the outline popover on a single floating glass surface owner with no manual load-older button', () => {
        const css = readDesignSystemCss()

        expect(css).toContain('.ds-thread-outline-popover')
        expect(css).toContain('transform-origin: bottom right;')
        expect(css).toContain('.ds-thread-outline-popover-header-count')
        expect(css).toContain('.ds-thread-outline-popover-item')
        expect(css).toContain('.ds-thread-outline-popover-tail')
        expect(css).not.toContain('.ds-thread-outline-popover-load-older')
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

    it('gives inline tool cards a dedicated transcript surface separated from message bubbles by tone and radius', () => {
        const css = readDesignSystemCss()

        expect(css).toContain('.ds-tool-card-surface')
        expect(css).toContain('border: 1px solid color-mix(in srgb, var(--ds-border-default) 36%, transparent);')
        expect(css).toContain('border-radius: var(--ds-radius-lg);')
        expect(css).toContain('box-shadow: none;')
        expect(css).toContain('background: color-mix(in srgb, var(--ds-panel) 50%, transparent);')
    })

    it('keeps user transcript bubbles on the rounded surface family', () => {
        const css = readDesignSystemCss()

        expect(css).toContain('.ds-message-surface')
        expect(css).toContain('border-radius: var(--ds-radius-2xl);')
    })

    it('flattens assistant transcript bubbles into paper-like flowing text without bubble chrome or clipping', () => {
        const css = readDesignSystemCss()
        const block = css.match(/\.ds-message-surface-assistant\s*\{[^}]+\}/)?.[0] ?? ''

        expect(block).toMatch(/border-color:\s*transparent;/)
        expect(block).toMatch(/background:\s*transparent;/)
        // Must also neutralize inherited bubble geometry from .ds-message-surface
        // (radius + overflow) so paper-flow text is not clipped at the corners.
        expect(block).toMatch(/border-radius:\s*0;/)
        expect(block).toMatch(/overflow:\s*visible;/)
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
