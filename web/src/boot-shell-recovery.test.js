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
        expect(html).toContain('return hasKnownLoadFailure([normalize(message), normalize(stack)])')
    })

    it('does not regress to URL-path-only asset failure heuristics that misfire on modulepreload hints', () => {
        const html = readIndexHtml()

        expect(html).not.toContain('function readResourceUrl(target)')
        expect(html).not.toContain('resourceUrl: readResourceUrl(event.target)')
        expect(html).not.toContain('containsAssetPath(resourceUrl)')
        expect(html).not.toContain('containsAssetPath(filename)')
        expect(html).not.toContain('containsAssetPath(stack)')
    })

    it('keeps the default boot shell neutral instead of claiming the workspace is loading', () => {
        const html = readIndexHtml()

        expect(html).toContain('<h1 class="boot-shell-title" id="app-boot-shell-title"></h1>')
        expect(html).toContain('<span class="boot-shell-mark"></span>')
        expect(html).toContain('.boot-shell-mark-stage')
        expect(html).not.toContain('.boot-shell-orb::before')
        expect(html).not.toContain('rgba(255, 159, 114')
        expect(html).not.toContain('/brand-browser-icon.png')
        expect(html).not.toContain('/brand-logo.png')
        expect(html).toContain("normal: ''")
        expect(html).not.toContain('Preparing your workspace…')
        expect(html).not.toContain('正在准备你的工作区…')
    })

    it('keeps the boot document free of render-blocking third-party font stylesheets', () => {
        const html = readIndexHtml()

        expect(html).not.toContain('fonts.googleapis.com')
        expect(html).not.toContain('fonts.gstatic.com')
        expect(html).not.toContain('Manrope')
        expect(html).not.toContain('Outfit')
    })

    it('preserves explicit recovery copy for restore-mode launches', () => {
        const html = readIndexHtml()

        expect(html).toContain("recovery: 'Restoring your session…'")
        expect(html).toContain("recovery: '正在恢复刚才的会话…'")
    })

    it('hides the boot shell on recovery reloads after this tab has already revealed the app once outside pairing boot routes', () => {
        const html = readIndexHtml()

        expect(html).toContain("var APP_SHELL_REVEALED_KEY = 'viby-app-shell-revealed'")
        expect(html).toContain('function isPairingBootRoute()')
        expect(html).toContain('function hasSearchParam(name, value)')
        expect(html).toContain("window.location.pathname.indexOf('/p/') === 0")
        expect(html).toContain("hasSearchParam('remote', '1')")
        expect(html).toContain("document.documentElement.setAttribute('data-boot-pairing', 'true')")
        expect(html).toContain("else if (sessionStorage.getItem(APP_SHELL_REVEALED_KEY) === 'done')")
        expect(html).toContain("document.documentElement.setAttribute('data-boot-shell-hidden', 'true')")
        expect(html).toContain('html[data-boot-shell-hidden="true"] #app-boot-shell')
    })

    it('keeps remote pairing boot copy aligned with the React connecting surface', () => {
        const html = readIndexHtml()

        expect(html).toContain("pairing: 'Connecting to your computer…'")
        expect(html).toContain("pairing: '正在连接你的电脑…'")
        expect(html).toContain("document.documentElement.getAttribute('data-boot-pairing') === 'true'")
    })

    it('does not unregister service workers on remote workspace wake restores', () => {
        const html = readIndexHtml()

        expect(html).toContain('function isPairingServiceWorkerResetRoute()')
        expect(html).toContain('if (!isPairingServiceWorkerResetRoute()) return')
        expect(html).not.toContain('if (!isPairingBootRoute()) return\n                    var resetKey')
    })

    it('queues an explicit runtime update instead of auto-reloading revealed apps on asset failure', () => {
        const html = readIndexHtml()

        expect(html).toContain("var RUNTIME_UPDATE_READY_EVENT = 'viby:runtime-update-ready'")
        expect(html).toContain("var RUNTIME_UPDATE_STORAGE_KEY = 'viby-runtime-update-ready'")
        expect(html).toContain("recoveryReason: 'runtime-asset-reload'")
        expect(html).toContain('window.dispatchEvent(new CustomEvent(RUNTIME_UPDATE_READY_EVENT')
    })

    it('recovers when a generated script or stylesheet element fails to load before React boots', () => {
        const html = readIndexHtml()

        expect(html).toContain('function isFatalAssetTagFailure(target)')
        expect(html).toContain("if (tag === 'SCRIPT') {")
        expect(html).toContain("if (tag === 'LINK') {")
        expect(html).toContain("return normalize(target.rel) === 'stylesheet'")
        expect(html).toContain("&& normalize(target.href).indexOf('/assets/') !== -1")
        expect(html).toContain("void recoverRuntimeAssets('asset:' + (event.target.tagName || '').toLowerCase())")
    })

    it('guards the boot recovery path against reload loops', () => {
        const html = readIndexHtml()

        // 任何 marker 存在即拒，不再按 reason 比较。
        expect(html).toContain('if (sessionStorage.getItem(RECOVERY_KEY)) {')
        // 不再使用 finally 强制 reload 的反模式。
        expect(html).not.toMatch(/finally\s*\{[^}]*window\.location\.reload\(\)[^}]*\}/)
        // reload 只允许在明确清理路径：/p/<id> 旧 SW 一次、runtime asset 恢复一次。
        const reloadOccurrences = html.match(/window\.location\.reload\(\)/g) || []
        expect(reloadOccurrences.length).toBe(2)
    })

    it('keeps the boot progress rail free of moving sheen decoration', () => {
        const html = readIndexHtml()

        expect(html).not.toContain('boot-shell-sheen')
        expect(html).not.toContain('.boot-shell-rail-fill::after')
    })
})
