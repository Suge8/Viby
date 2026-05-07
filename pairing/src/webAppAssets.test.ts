import { afterEach, describe, expect, it } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readWebAppAsset } from './webAppAssets'

function decodeAssetBody(body: ArrayBuffer): string {
    return new TextDecoder().decode(body)
}

const tempRoots: string[] = []

function createAssetRoot(): string {
    const root = mkdtempSync(join(tmpdir(), 'viby-pairing-assets-'))
    tempRoots.push(root)
    mkdirSync(join(root, 'assets'))
    writeFileSync(join(root, 'web-index.html'), '<!doctype html>')
    writeFileSync(join(root, 'assets', 'index.js'), 'console.log("ok")')
    writeFileSync(join(root, 'manifest.webmanifest'), '{"name":"Viby"}')
    writeFileSync(join(root, 'pairing.env'), 'PAIRING_CREATE_TOKEN=secret')
    return root
}

afterEach(() => {
    for (const root of tempRoots.splice(0)) {
        rmSync(root, { recursive: true, force: true })
    }
})

describe('webAppAssets', () => {
    it('serves declared public assets only', () => {
        const assetsRoot = createAssetRoot()

        expect(readWebAppAsset('/assets/index.js', { assetsRoot })?.contentType).toBe('text/javascript; charset=utf-8')
        expect(readWebAppAsset('/manifest.webmanifest', { assetsRoot })?.contentType).toBe(
            'application/manifest+json; charset=utf-8'
        )
    })

    it('rewrites the pairing-served manifest to launch the durable remote workspace', () => {
        const assetsRoot = createAssetRoot()
        const asset = readWebAppAsset('/manifest.webmanifest', { assetsRoot })

        expect(JSON.parse(decodeAssetBody(asset!.body))).toMatchObject({
            name: 'Viby',
            scope: '/',
            start_url: '/sessions?remote=1',
        })
    })

    it('rejects traversal from the hashed asset route into deploy-bundle secrets', () => {
        const assetsRoot = createAssetRoot()

        expect(readWebAppAsset('/assets/../pairing.env', { assetsRoot })).toBeNull()
        expect(readWebAppAsset('/assets/../manifest.webmanifest', { assetsRoot })).toBeNull()
    })
})
