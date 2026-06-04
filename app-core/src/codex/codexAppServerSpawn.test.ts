import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const spawnMock = vi.fn(() => ({ pid: 123 }))

vi.mock('node:child_process', async () => {
    const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process')
    return { ...actual, spawn: spawnMock }
})

vi.mock('./utils/codexPath', () => ({
    getDefaultCodexPath: () => 'codex',
}))

const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform')

function setPlatform(value: string): void {
    Object.defineProperty(process, 'platform', { value, configurable: true })
}

describe('spawnCodexAppServer', () => {
    beforeAll(() => {
        if (!originalPlatformDescriptor?.configurable) {
            throw new Error('process.platform is not configurable in this runtime')
        }
    })

    beforeEach(() => {
        vi.clearAllMocks()
    })

    afterAll(() => {
        if (originalPlatformDescriptor) Object.defineProperty(process, 'platform', originalPlatformDescriptor)
    })

    it('hides the app-server console window on Windows', async () => {
        setPlatform('win32')
        const { spawnCodexAppServer } = await import('./codexAppServerSpawn')

        spawnCodexAppServer()
        expect(spawnMock).toHaveBeenCalledTimes(1)
        const call = spawnMock.mock.calls[0] as unknown[]
        expect(call[2]).toMatchObject({ shell: true, windowsHide: true })
    })

    it('does not request windowsHide outside Windows', async () => {
        setPlatform('linux')
        const { spawnCodexAppServer } = await import('./codexAppServerSpawn')

        spawnCodexAppServer()
        const call = spawnMock.mock.calls[0] as unknown[]
        expect(call[2]).toMatchObject({ shell: false, windowsHide: false })
    })
})
