import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const repoRoot = resolve(import.meta.dir, '../..')

function readRepoFile(path: string): string {
    return readFileSync(join(repoRoot, path), 'utf8')
}

describe('web build metrics contract', () => {
    it('keeps the actual chat runtime chunk under budget instead of only checking stale chunk names', () => {
        const metricsScript = readRepoFile('web/scripts/reportBuildMetrics.mjs')

        expect(metricsScript).toContain("label: 'chat-route-runtime'")
        expect(metricsScript).toContain('pattern: /^chat-.*\\.js$/')
    })
})
