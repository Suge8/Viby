import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const INDEX_CSS_PATH = resolve(
    dirname(fileURLToPath(import.meta.url)),
    'index.css'
)

const INDEX_HTML_PATH = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    'index.html'
)

function readIndexCss() {
    return readFileSync(INDEX_CSS_PATH, 'utf8')
}

function readIndexHtml() {
    return readFileSync(INDEX_HTML_PATH, 'utf8')
}

describe('index.css mobile session-chat route constraints', () => {
    it('keeps the mobile chat route on a fixed app shell instead of restoring body scroll', () => {
        const css = readIndexCss()

        expect(css).toContain("body[data-viby-route='session-chat']")
        expect(css).toContain('height: 100%;')
        expect(css).toContain('min-height: 100dvh;')
        expect(css).toContain('overflow: hidden;')
        expect(css).toContain('overscroll-behavior-y: none;')
    })

    it('keeps the mobile chat route root mounted to the viewport height', () => {
        const css = readIndexCss()

        expect(css).toContain("body[data-viby-route='session-chat'] #root")
        expect(css).toContain('height: 100%;')
        expect(css).toContain('min-height: 0;')
        expect(css).not.toContain("body[data-viby-route='session-chat'] #root {\n        height: auto;")
    })
})

describe('index.html viewport policy', () => {
    it('keeps a minimal cross-browser viewport meta without unsupported interactive-widget hints', () => {
        const html = readIndexHtml()

        expect(html).toContain('viewport-fit=cover')
        expect(html).not.toContain('interactive-widget=')
    })
})
