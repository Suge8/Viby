import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const INDEX_HTML_PATH = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    'index.html'
)

function readIndexHtml() {
    return readFileSync(INDEX_HTML_PATH, 'utf8')
}

describe('index.html boot recovery guard', () => {
    it('requires explicit asset evidence before the early boot shell can trigger a reload', () => {
        const html = readIndexHtml()

        expect(html).toContain('function hasKnownLoadFailure(values)')
        expect(html).toContain('return hasKnownLoadFailure([message, stack])')
    })

    it('does not keep the old asset-path-only recovery fallback in the inline boot script', () => {
        const html = readIndexHtml()

        expect(html).not.toContain([
            'return ERROR_PATTERNS.some(function (pattern) {',
            '                        return message.indexOf(pattern) !== -1',
            '                    }) || containsAssetPath(filename) || containsAssetPath(stack)'
        ].join('\n'))
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
})
