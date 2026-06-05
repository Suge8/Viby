import { describe, expect, it } from 'bun:test'

const requiredFields = ['ERROR', 'reason:', 'fix:', 'details:']

function expectDevErrorContract(lines: string[]): void {
    const output = lines.join('\n')
    for (const field of requiredFields) expect(output).toContain(field)
    expect(output).not.toContain('Error:')
    expect(output).not.toMatch(/^\s+at /m)
}

describe('desktop dev output scripts', () => {
    it('formats ensure-app-core missing errors with the terminal contract', async () => {
        const { formatMissingAppCoreError } = await import('../desktop/scripts/ensure-app-core.mjs')
        const lines = formatMissingAppCoreError('/tmp/missing-app-core')

        expectDevErrorContract(lines)
        expect(lines).toContain('[desktop] fix: bun run build:app-core && bun run --cwd desktop prepare:app-core')
    })

    it('formats prepare-app-core failures with the terminal contract', async () => {
        const { formatPrepareAppCoreError } = await import('../desktop/scripts/prepare-app-core.mjs')
        const lines = formatPrepareAppCoreError('Missing AppCore binary at /tmp/app-core.')

        expectDevErrorContract(lines)
        expect(lines).toContain('[desktop] fix: bun run build:app-core && bun run --cwd desktop prepare:app-core')
    })
})
