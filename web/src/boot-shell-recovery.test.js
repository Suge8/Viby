import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const INDEX_HTML_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'index.html')

function readIndexHtml() {
    return readFileSync(INDEX_HTML_PATH, 'utf8')
}

describe('index.html boot recovery guard', () => {
    it('keeps early asset recovery disabled on the Vite dev server and still requires explicit asset evidence elsewhere', () => {
        const html = readIndexHtml()

        expect(html).toContain("var BOOT_RECOVERY_SURFACE_OWNER_KEY = 'viby-boot-recovery-surface-owner'")
        expect(html).toContain("var IS_VITE_DEV = '%MODE%' === 'development'")
        expect(html).toContain('if (IS_VITE_DEV) {')
        expect(html).toContain('function hasKnownLoadFailure(values)')
        expect(html).toContain('return hasKnownLoadFailure([message, stack])')
    })

    it('does not keep the old asset-path-only recovery fallback in the inline boot script', () => {
        const html = readIndexHtml()

        expect(html).not.toContain(
            [
                'return ERROR_PATTERNS.some(function (pattern) {',
                '                        return message.indexOf(pattern) !== -1',
                '                    }) || containsAssetPath(filename) || containsAssetPath(stack)',
            ].join('\n')
        )
    })

    it('keeps the default boot shell neutral instead of claiming the workspace is loading', () => {
        const html = readIndexHtml()

        expect(html).toContain('<div class="boot-shell-title" id="app-boot-shell-title">Viby</div>')
        expect(html).toContain('<span class="boot-shell-mark"></span>')
        expect(html).toContain('.boot-shell-mark-stage')
        expect(html).not.toContain('.boot-shell-orb::before')
        expect(html).not.toContain('rgba(255, 159, 114')
        expect(html).not.toContain('/brand-browser-icon.png')
        expect(html).not.toContain('/brand-logo.png')
        expect(html).toContain("title: 'Viby'")
        expect(html).not.toContain('Preparing your workspace…')
        expect(html).not.toContain('正在准备你的工作区…')
    })

    it('preserves explicit recovery copy for restore-mode launches', () => {
        const html = readIndexHtml()

        expect(html).toContain("title: 'Restoring your session…'")
        expect(html).toContain("title: '正在恢复刚才的会话…'")
        expect(html).toContain("copy: 'Reopening your session and syncing the latest replies.'")
    })

    it('hides the boot shell on recovery reloads after this tab has already revealed the app once', () => {
        const html = readIndexHtml()

        expect(html).toContain("var APP_SHELL_REVEALED_KEY = 'viby-app-shell-revealed'")
        expect(html).toContain("document.documentElement.setAttribute('data-boot-shell-hidden', 'true')")
        expect(html).toContain('html[data-boot-shell-hidden="true"] #app-boot-shell')
    })

    it('queues an explicit runtime update instead of auto-reloading revealed apps on asset failure', () => {
        const html = readIndexHtml()

        expect(html).toContain("var RUNTIME_UPDATE_READY_EVENT = 'viby:runtime-update-ready'")
        expect(html).toContain("var RUNTIME_UPDATE_STORAGE_KEY = 'viby-runtime-update-ready'")
        expect(html).toContain("recoveryReason: 'runtime-asset-reload'")
        expect(html).toContain('window.dispatchEvent(new CustomEvent(RUNTIME_UPDATE_READY_EVENT')
    })
})
