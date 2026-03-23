import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'bun:test'
import {
    buildRemoteDevContext,
    getDevRemoteLockPath,
    parseRemoteFlag,
    parseRemotePort,
    readActiveDevRemoteLock,
    resolveVibyHome,
    writeDevRemoteLock
} from './devRemoteHelpers'

describe('devRemoteHelpers', () => {
    it('builds remote URLs and deduplicated origins from hosts', () => {
        const context = buildRemoteDevContext(
            ['127.0.0.1', '100.121.243.108', '127.0.0.1'],
            { hubPort: 37173, vitePort: 5173 }
        )

        expect(context.webOrigins).toEqual([
            'http://127.0.0.1:5173',
            'http://100.121.243.108:5173',
        ])
        expect(context.remoteDevUrls).toEqual([
            'http://127.0.0.1:5173',
            'http://100.121.243.108:5173',
        ])
    })

    it('parses remote flags and ports defensively', () => {
        expect(parseRemoteFlag('1')).toBe(true)
        expect(parseRemoteFlag('true')).toBe(true)
        expect(parseRemoteFlag('off')).toBe(false)
        expect(parseRemotePort('5174', 5173)).toBe(5174)
        expect(parseRemotePort('bad', 5173)).toBe(5173)
    })

    it('resolves relative VIBY_HOME from the repo root so child cwd cannot drift it', () => {
        expect(resolveVibyHome('.viby-devremote', '/repo/Viby')).toBe('/repo/Viby/.viby-devremote')
    })

    it('preserves absolute VIBY_HOME paths', () => {
        expect(resolveVibyHome('/tmp/viby-devremote', '/repo/Viby')).toBe('/tmp/viby-devremote')
    })

    it('stores the dev:remote lock inside the repo root', () => {
        expect(getDevRemoteLockPath('/repo/Viby')).toBe('/repo/Viby/.viby-dev-remote.lock.json')
    })

    it('reads a live dev:remote lock and ignores stale ones', () => {
        const repoRoot = mkdtempSync(join(tmpdir(), 'viby-dev-remote-'))
        const staleRepoRoot = mkdtempSync(join(tmpdir(), 'viby-dev-remote-stale-'))

        writeDevRemoteLock(repoRoot, {
            pid: process.pid,
            repoRoot,
            hubPort: 37173,
            vitePort: 5173,
            createdAt: '2026-03-23T00:00:00.000Z'
        })
        expect(readActiveDevRemoteLock(repoRoot)).toMatchObject({
            pid: process.pid,
            hubPort: 37173,
            vitePort: 5173
        })

        mkdirSync(staleRepoRoot, { recursive: true })
        writeFileSync(getDevRemoteLockPath(staleRepoRoot), JSON.stringify({
            pid: 999_999,
            repoRoot: staleRepoRoot,
            hubPort: 37173,
            vitePort: 5173,
            createdAt: '2026-03-23T00:00:00.000Z'
        }))
        expect(readActiveDevRemoteLock(staleRepoRoot)).toBeNull()
    })
})
