import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const TEST_DIR = dirname(fileURLToPath(import.meta.url))

describe('vite pwa boundaries', () => {
    it('keeps dev service workers disabled for local development', () => {
        const configSource = readFileSync(resolve(TEST_DIR, '../vite.config.ts'), 'utf8')

        expect(configSource).toMatch(/devOptions:\s*\{[\s\S]*enabled:\s*false/)
    })
})
