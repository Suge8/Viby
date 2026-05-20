import { describe, expect, it } from 'vitest'
import { deferRenderBlockingStylesheets } from '../scripts/indexHtmlPostBuildSupport'

describe('indexHtmlPostBuildSupport', () => {
    it('turns generated app CSS into a non-render-blocking preload with a noscript fallback', () => {
        const html = '<link rel="stylesheet" crossorigin href="/assets/index-abc.css">'

        expect(deferRenderBlockingStylesheets(html)).toBe(
            [
                '<link rel="preload" as="style" href="/assets/index-abc.css" crossorigin data-viby-nonblocking-style="true" onload="this.onload=null;this.rel=\'stylesheet\'">',
                '<noscript><link rel="stylesheet" href="/assets/index-abc.css" crossorigin></noscript>',
            ].join('')
        )
    })

    it('does not touch external or already patched stylesheets', () => {
        const external = '<link rel="stylesheet" href="https://example.com/app.css">'
        const patched = '<link rel="preload" as="style" href="/assets/index.css" data-viby-nonblocking-style="true">'

        expect(deferRenderBlockingStylesheets(external)).toBe(external)
        expect(deferRenderBlockingStylesheets(patched)).toBe(patched)
    })
})
