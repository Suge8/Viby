import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const spawnSyncMock = vi.fn(() => ({ status: 0 }))

vi.mock('cross-spawn', () => ({
    default: { sync: spawnSyncMock },
}))

const originalPlatformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform')

function setPlatform(value: string): void {
    Object.defineProperty(process, 'platform', { value, configurable: true })
}

describe('Windows process cleanup', () => {
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

    it('hides taskkill windows during process cleanup', async () => {
        setPlatform('win32')
        const { killProcess } = await import('./process')

        expect(await killProcess(123, true)).toBe(true)
        expect(spawnSyncMock).toHaveBeenCalledWith('taskkill', ['/F', '/T', '/PID', '123'], {
            stdio: 'pipe',
            windowsHide: true,
        })
    })
})
