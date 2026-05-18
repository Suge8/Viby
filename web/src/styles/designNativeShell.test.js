import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const STYLES_DIR = dirname(fileURLToPath(import.meta.url))

describe('design native shell styles', () => {
    it('does not render the old green grid overlay', () => {
        const css = readFileSync(resolve(STYLES_DIR, 'design-native-shell.css'), 'utf8')
        const tokens = readFileSync(resolve(STYLES_DIR, 'design-system-tokens.css'), 'utf8')
        expect(`${css}\n${tokens}`).not.toContain('--ds-native-grid')
    })
})
