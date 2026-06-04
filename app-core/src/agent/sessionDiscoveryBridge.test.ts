import { describe, expect, it, vi } from 'vitest'
import { createSessionDiscoveryBridge, reportDiscoveredSessionId } from './sessionDiscoveryBridge'

const flushDetachedTasks = async () => {
    await Promise.resolve()
    await Promise.resolve()
}

describe('sessionDiscoveryBridge', () => {
    it('reports discovered ids once and replays the latest id to a late follower', async () => {
        const commit = vi.fn()
        const follower = {
            onNewSession: vi.fn(),
        }
        const discovery = createSessionDiscoveryBridge(commit)

        expect(discovery.reportDiscoveredSessionId(' session-1 ')).toBe('session-1')
        expect(discovery.reportDiscoveredSessionId('session-1')).toBe('session-1')
        expect(commit).toHaveBeenCalledTimes(1)
        expect(commit).toHaveBeenCalledWith('session-1')

        discovery.attachScannerFollower(follower)
        await flushDetachedTasks()

        expect(follower.onNewSession).toHaveBeenCalledTimes(1)
        expect(follower.onNewSession).toHaveBeenCalledWith('session-1')

        expect(discovery.reportDiscoveredSessionId('session-2')).toBe('session-2')
        await flushDetachedTasks()

        expect(commit).toHaveBeenCalledTimes(2)
        expect(commit).toHaveBeenNthCalledWith(2, 'session-2')
        expect(follower.onNewSession).toHaveBeenCalledTimes(2)
        expect(follower.onNewSession).toHaveBeenNthCalledWith(2, 'session-2')
    })

    it('ignores malformed session ids', async () => {
        const commit = vi.fn()
        const follower = {
            onNewSession: vi.fn(),
        }
        const discovery = createSessionDiscoveryBridge(commit)
        discovery.attachScannerFollower(follower)

        expect(discovery.reportDiscoveredSessionId(undefined)).toBeNull()
        expect(discovery.reportDiscoveredSessionId(null)).toBeNull()
        expect(discovery.reportDiscoveredSessionId('')).toBeNull()
        expect(discovery.reportDiscoveredSessionId('   ')).toBeNull()
        await flushDetachedTasks()

        expect(commit).not.toHaveBeenCalled()
        expect(follower.onNewSession).not.toHaveBeenCalled()
    })

    it('supports one-off direct discovery reports', () => {
        const commit = vi.fn()

        expect(reportDiscoveredSessionId(commit, ' session-direct ')).toBe('session-direct')
        expect(reportDiscoveredSessionId(commit, '   ')).toBeNull()

        expect(commit).toHaveBeenCalledTimes(1)
        expect(commit).toHaveBeenCalledWith('session-direct')
    })
})
