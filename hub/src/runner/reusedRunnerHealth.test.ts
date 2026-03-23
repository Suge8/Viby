import { describe, expect, it } from 'bun:test'
import type { Machine } from '../sync/syncEngine'
import { shouldRestartReusedRunner } from './reusedRunnerHealth'

function createMachine(options: {
    active?: boolean
    pid?: number
    status?: string
} = {}): Machine {
    return {
        id: 'machine-1',
        seq: 1,
        createdAt: 0,
        updatedAt: 0,
        active: options.active ?? true,
        activeAt: 0,
        metadata: {
            host: 'host',
            platform: 'darwin',
            vibyCliVersion: '1.0.0',
            vibyHomeDir: '/tmp/viby'
        },
        metadataVersion: 1,
        runnerState: {
            pid: options.pid,
            status: options.status ?? 'running'
        },
        runnerStateVersion: 1
    }
}

describe('shouldRestartReusedRunner', () => {
    it('returns false when runner is running and pid is alive', () => {
        expect(shouldRestartReusedRunner(createMachine({ pid: 123 }), () => true)).toBe(false)
    })

    it('returns true when runner pid is dead even if machine is still marked running', () => {
        expect(shouldRestartReusedRunner(createMachine({ pid: 123 }), () => false)).toBe(true)
    })

    it('returns true when runner state is no longer running', () => {
        expect(shouldRestartReusedRunner(createMachine({ pid: 123, status: 'shutting-down' }), () => true)).toBe(true)
    })

    it('returns true when machine is offline or missing', () => {
        expect(shouldRestartReusedRunner(createMachine({ active: false, pid: 123 }), () => true)).toBe(true)
        expect(shouldRestartReusedRunner(null, () => true)).toBe(true)
    })
})
