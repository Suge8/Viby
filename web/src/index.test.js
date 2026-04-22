import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const INDEX_CSS_PATH = resolve(dirname(fileURLToPath(import.meta.url)), 'index.css')

const INDEX_HTML_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'index.html')

function readIndexCss() {
    return readFileSync(INDEX_CSS_PATH, 'utf8')
}

function readIndexHtml() {
    return readFileSync(INDEX_HTML_PATH, 'utf8')
}

describe('index.css route ownership constraints', () => {
    it('does not reintroduce a document-level session-chat route owner', () => {
        const css = readIndexCss()

        expect(css).not.toContain("html[data-viby-route='session-chat']")
        expect(css).not.toContain("body[data-viby-route='session-chat']")
    })

    it('keeps the root mounted to the viewport height globally', () => {
        const css = readIndexCss()

        expect(css).toContain('#root {')
        expect(css).toContain('height: 100%;')
        expect(css).not.toContain('#root {\n        height: auto;')
    })

    it('keeps the desktop session list scrollbar gutter stable so tab switches do not shift the header layout', () => {
        const css = readIndexCss()

        expect(css).toContain('.desktop-scrollbar-stable {')
        expect(css).toContain('scrollbar-gutter: stable both-edges;')
        expect(css).not.toContain('.desktop-scrollbar-left')
        expect(css).not.toContain('direction: rtl;')
    })

    it('does not reintroduce transcript content-visibility placeholder rendering', () => {
        const css = readIndexCss()

        expect(css).not.toContain('.viby-thread-messages > * {')
        expect(css).not.toContain('content-visibility: auto;')
        expect(css).not.toContain('contain-intrinsic-size:')
        expect(css).not.toContain('data-viby-measure-all')
    })
})

describe('index.html viewport policy', () => {
    it('keeps viewport-fit and the keyboard resize contract on the single viewport meta tag', () => {
        const html = readIndexHtml()

        expect(html).toContain('viewport-fit=cover')
        expect(html).toContain('interactive-widget=resizes-content')
    })
})
