import { afterEach, describe, expect, it } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PROTOCOL_VERSION, WEB_BUILD_METADATA_FILE_NAME, WEB_BUILD_METADATA_SCHEMA_VERSION } from '@viby/protocol'
import { findWebappDistDir } from './webAssetDist'

const roots: string[] = []

function createRoot(): string {
    const root = mkdtempSync(join(tmpdir(), 'viby-web-dist-'))
    roots.push(root)
    return root
}

function writeDist(distDir: string, protocolVersion?: number): void {
    mkdirSync(distDir, { recursive: true })
    writeFileSync(join(distDir, 'index.html'), '<!doctype html>')
    if (protocolVersion) {
        writeFileSync(
            join(distDir, WEB_BUILD_METADATA_FILE_NAME),
            JSON.stringify({
                schemaVersion: WEB_BUILD_METADATA_SCHEMA_VERSION,
                appVersion: '0.2.0',
                buildId: 'test',
                protocolVersion,
                minSupportedProtocolVersion: protocolVersion,
            })
        )
    }
}

describe('findWebappDistDir', () => {
    afterEach(() => {
        for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true })
    })

    it('prefers colocated built assets over workspace web/dist when both exist', () => {
        const root = createRoot()
        const hubDir = join(root, 'hub')
        const moduleDir = join(hubDir, 'dist')
        const workspaceWebDist = join(root, 'web', 'dist')
        writeDist(moduleDir, PROTOCOL_VERSION)
        writeDist(workspaceWebDist, PROTOCOL_VERSION)

        expect(findWebappDistDir({ cwd: hubDir, moduleDir })).toMatchObject({ distDir: moduleDir, status: 'ready' })
    })

    it('skips newer workspace assets when an older hub serves its matching built assets', () => {
        const root = createRoot()
        const hubDir = join(root, 'hub')
        const compatibleDist = join(hubDir, 'dist')
        const incompatibleWorkspaceDist = join(root, 'web', 'dist')
        writeDist(compatibleDist, PROTOCOL_VERSION)
        writeDist(incompatibleWorkspaceDist, PROTOCOL_VERSION + 1)

        expect(findWebappDistDir({ cwd: hubDir, moduleDir: join(hubDir, 'src', 'web') })).toMatchObject({
            distDir: compatibleDist,
            status: 'ready',
        })
    })

    it('refuses to serve dist assets without build metadata', () => {
        const root = createRoot()
        const hubDir = join(root, 'hub')
        const unversionedWorkspaceDist = join(root, 'web', 'dist')
        writeDist(unversionedWorkspaceDist)

        expect(findWebappDistDir({ cwd: hubDir, moduleDir: join(hubDir, 'src', 'web') })).toMatchObject({
            distDir: unversionedWorkspaceDist,
            status: 'incompatible',
        })
    })

    it('refuses to serve known-incompatible assets when no compatible build exists', () => {
        const root = createRoot()
        const hubDir = join(root, 'hub')
        const incompatibleWorkspaceDist = join(root, 'web', 'dist')
        writeDist(incompatibleWorkspaceDist, PROTOCOL_VERSION + 1)

        expect(findWebappDistDir({ cwd: hubDir, moduleDir: join(hubDir, 'src', 'web') })).toMatchObject({
            distDir: incompatibleWorkspaceDist,
            status: 'incompatible',
        })
    })
})
