import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runVibyMcpStdioBridge } from './vibyMcpStdioBridge'

describe('runVibyMcpStdioBridge', () => {
    beforeEach(() => {
        vi.restoreAllMocks()
    })

    it('exits with code 2 because the Viby MCP bridge is removed', async () => {
        const exitError = new Error('process.exit:2')
        const stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(((message?: string | Uint8Array) => {
            void message
            return true
        }) as typeof process.stderr.write)
        vi.spyOn(process, 'exit').mockImplementation(((code?: string | number | null) => {
            throw code === 2 ? exitError : new Error(`process.exit:${code}`)
        }) as typeof process.exit)

        await expect(runVibyMcpStdioBridge(['--url', 'http://127.0.0.1:4319/'])).rejects.toThrow(exitError)
        expect(stderrWrite).toHaveBeenCalled()
    })
})
