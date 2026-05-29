import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const repoRoot = resolve(import.meta.dir, '../..')

function readRepoFile(path: string): string {
    return readFileSync(join(repoRoot, path), 'utf8')
}

describe('web build metadata contract', () => {
    it('writes one web metadata file during the web build', () => {
        expect(readRepoFile('web/package.json')).toContain('bun run scripts/writeBuildMeta.ts')
        expect(readRepoFile('web/scripts/writeBuildMeta.ts')).toContain('buildWebBuildMetadata')
    })

    it('fails deploy builds when the web metadata is missing or malformed', () => {
        expect(readRepoFile('hub/scripts/generate-embedded-web-assets.ts')).toContain('WebBuildMetadataSchema.parse')
        expect(readRepoFile('pairing/scripts/buildDeployBundle.ts')).toContain('WebBuildMetadataSchema.parse')
    })

    it('serves the metadata from the pairing broker static root', () => {
        const assets = readRepoFile('pairing/src/webAppAssets.ts')
        expect(assets).toContain('WEB_BUILD_METADATA_FILE_NAME')
        expect(assets).toContain('application/json; charset=utf-8')
    })
})
