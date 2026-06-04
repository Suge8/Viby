import { beforeEach, describe, expect, it, vi } from 'vitest'

const existsSyncMock = vi.fn<(path: string) => boolean>()
const execSyncMock = vi.fn<(command: string, options?: unknown) => string>()

vi.mock('node:fs', () => ({
    existsSync: existsSyncMock,
}))

vi.mock('node:child_process', () => ({
    execSync: execSyncMock,
}))

vi.mock('@/ui/logger', () => ({
    logger: {
        debug: vi.fn(),
    },
}))

describe('getDefaultCodexPath', () => {
    beforeEach(() => {
        existsSyncMock.mockReset()
        execSyncMock.mockReset()
        delete process.env.VIBY_CODEX_PATH
    })

    it('uses explicit env override first', async () => {
        process.env.VIBY_CODEX_PATH = '/custom/codex'
        const { getDefaultCodexPath } = await import('./codexPath')
        expect(getDefaultCodexPath()).toBe('/custom/codex')
    })

    it('prefers known unix installation paths', async () => {
        existsSyncMock.mockImplementation((path) => path === '/opt/homebrew/bin/codex')
        const { getDefaultCodexPath } = await import('./codexPath')
        expect(getDefaultCodexPath()).toBe('/opt/homebrew/bin/codex')
    })

    it('falls back to command -v output', async () => {
        existsSyncMock.mockImplementation((path) => path === '/usr/local/bin/codex')
        execSyncMock.mockReturnValue('/usr/local/bin/codex\n')
        const { getDefaultCodexPath } = await import('./codexPath')
        expect(getDefaultCodexPath()).toBe('/usr/local/bin/codex')
    })
})
