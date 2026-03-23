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
})
