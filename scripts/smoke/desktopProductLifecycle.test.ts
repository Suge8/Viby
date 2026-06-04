import { describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { findDesktopLifecycleLogIssues } from '../test-support/desktopLifecycleSmokeSupport'
import { isPidAlive, readRuntimeStatus, reserveTcpPort } from './desktopProductLifecycle'

describe('desktop product lifecycle smoke helpers', () => {
    it('reads runtime status from the isolated Viby home', () => {
        const dir = mkdtempSync(join(tmpdir(), 'viby-runtime-status-test.'))
        try {
            const statusPath = join(dir, 'hub.runtime-status.json')
            writeFileSync(statusPath, JSON.stringify({ phase: 'ready', pid: 123, localHubUrl: 'http://127.0.0.1:1' }))

            expect(readRuntimeStatus(statusPath)).toEqual({
                phase: 'ready',
                pid: 123,
                localHubUrl: 'http://127.0.0.1:1',
            })
        } finally {
            rmSync(dir, { recursive: true, force: true })
        }
    })

    it('can reserve a real local TCP port for an isolated desktop launch', async () => {
        const port = await reserveTcpPort()

        expect(port).toBeGreaterThan(0)
    })

    it('treats invalid PIDs as not alive', () => {
        expect(isPidAlive(undefined)).toBe(false)
        expect(isPidAlive(-1)).toBe(false)
    })

    it('fails lifecycle logs on raw pairing token leaks', () => {
        const issues = findDesktopLifecycleLogIssues({
            stderr: 'connect failed https://pair.viby.run/pairings/p/events?token=secret-token',
        })

        expect(issues).toEqual([
            {
                source: 'stderr',
                line: 1,
                text: 'connect failed https://pair.viby.run/pairings/p/events?token=<redacted>',
            },
        ])
    })

    it('fails lifecycle logs on spawn-class errors and raw pairing token leaks', () => {
        const issues = findDesktopLifecycleLogIssues({
            stderr: 'No such file or directory (os error 2) https://pair.viby.run/pairings/p/events?token=secret-token',
        })

        expect(issues).toEqual([
            {
                source: 'stderr',
                line: 1,
                text: 'No such file or directory (os error 2) https://pair.viby.run/pairings/p/events?token=<redacted>',
            },
        ])
    })
})
